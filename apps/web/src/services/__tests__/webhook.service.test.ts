import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookService } from '../webhook.service';
import fs from 'fs/promises';
import path from 'path';
import { createHmac } from 'crypto';

const testDir = path.join(process.cwd(), 'data', 'test-webhooks');
const subsPath = path.join(testDir, 'subscriptions.json');
const deadLetterPath = path.join(testDir, 'dead_letter.json');

describe('WebhookService', () => {
  let service: WebhookService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Ensure clean state
    await fs.mkdir(testDir, { recursive: true });
    
    service = new WebhookService({
      maxRetries: 3,
      baseDelay: 50, // Short delay for fast testing
      subscriptionsPath: subsPath,
      deadLetterPath: deadLetterPath,
    });

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(async () => {
    // Wait for any remaining pending operations to resolve before deleting the directory
    if (service) {
      await service.awaitPendingDeliveries();
    }
    await fs.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Subscriptions (CRUD)', () => {
    it('should start with an empty list of subscriptions', async () => {
      const subs = await service.getSubscriptions();
      expect(subs).toEqual([]);
    });

    it('should create and retrieve a subscription successfully', async () => {
      const url = 'https://api.subscriber.com/webhook';
      const events = ['stream.status_updated'];
      const secret = 'super-secret-key-123';

      const sub = await service.createSubscription(url, events, secret);

      expect(sub.id).toBeDefined();
      expect(sub.url).toBe(url);
      expect(sub.events).toEqual(events);
      expect(sub.secret).toBe(secret);
      expect(sub.createdAt).toBeDefined();

      const allSubs = await service.getSubscriptions();
      expect(allSubs).toHaveLength(1);
      expect(allSubs[0]).toEqual(sub);
    });

    it('should auto-generate a secret if not provided', async () => {
      const url = 'https://api.subscriber.com/webhook';
      const events = ['stream.status_updated'];

      const sub = await service.createSubscription(url, events);
      expect(sub.secret).toBeDefined();
      expect(sub.secret.length).toBeGreaterThan(0);
    });

    it('should throw an error for invalid URL formats', async () => {
      await expect(
        service.createSubscription('not-a-url', ['stream.status_updated'])
      ).rejects.toThrow('Invalid subscriber URL format');
    });

    it('should throw an error if no events are specified', async () => {
      await expect(
        service.createSubscription('https://example.com', [])
      ).rejects.toThrow('Subscription must specify at least one event type');
    });

    it('should delete an existing subscription', async () => {
      const sub = await service.createSubscription('https://example.com', ['*']);
      
      const deleted = await service.deleteSubscription(sub.id);
      expect(deleted).toBe(true);

      const allSubs = await service.getSubscriptions();
      expect(allSubs).toEqual([]);
    });

    it('should return false when deleting a non-existent subscription', async () => {
      const deleted = await service.deleteSubscription('sub_nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('Webhook Dispatcher & Signature Delivery', () => {
    it('should dispatch matching events to subscribers', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const sub = await service.createSubscription('https://example.com/receiver', ['stream.status_updated']);
      
      const eventData = { streamId: 'stream_123', status: 'active' };
      await service.dispatchEvent('stream.status_updated', eventData);
      await service.awaitPendingDeliveries();

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://example.com/receiver');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers['Content-Type']).toBe('application/json');
      expect(calledInit.headers['X-Webhook-Event']).toBe('stream.status_updated');
      
      const timestamp = calledInit.headers['X-Webhook-Timestamp'];
      const signature = calledInit.headers['X-Webhook-Signature'];
      const body = JSON.parse(calledInit.body);

      // Verify payload body structure
      expect(body.event).toBe('stream.status_updated');
      expect(body.payload).toEqual(eventData);
      expect(body.id).toBeDefined();
      expect(body.timestamp).toBe(Number(timestamp));

      // Verify HMAC-SHA256 signature
      const expectedHmac = createHmac('sha256', sub.secret);
      const expectedSig = expectedHmac.update(`${timestamp}.${calledInit.body}`).digest('hex');
      expect(signature).toBe(expectedSig);
    });

    it('should dispatch to wildcard * subscriptions', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await service.createSubscription('https://example.com/wildcard', ['*']);
      
      await service.dispatchEvent('milestone.funds_released', { amount: '1000' });
      await service.awaitPendingDeliveries();
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not dispatch to non-matching subscriptions', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await service.createSubscription('https://example.com/status', ['stream.status_updated']);
      
      await service.dispatchEvent('milestone.funds_released', { amount: '1000' });
      await service.awaitPendingDeliveries();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Retry & Backoff Logic & Dead-Letter Log', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should retry failed webhooks up to maxRetries with exponential backoff, then log to dead-letter', async () => {
      // Endpoint constantly returns 500 Server Error
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const sub = await service.createSubscription('https://example.com/fail', ['stream.status_updated']);
      
      const eventData = { test: true };
      await service.dispatchEvent('stream.status_updated', eventData);

      // Initial attempt (Attempt 1)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timers to trigger Attempt 2 (backoff = 50ms * 2^0 = 50ms)
      await vi.advanceTimersByTimeAsync(50);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance timers to trigger Attempt 3 (backoff = 50ms * 2^1 = 100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // No more retries should happen after Attempt 3 (maxRetries = 3)
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Await any remaining DLQ file writes to settle
      await service.awaitPendingDeliveries();

      // Check that the failure was logged to the dead-letter queue
      const deadLetters = await service.getDeadLetters();
      expect(deadLetters).toHaveLength(1);
      
      const log = deadLetters[0];
      expect(log.subscriptionId).toBe(sub.id);
      expect(log.url).toBe(sub.url);
      expect(log.event).toBe('stream.status_updated');
      expect(log.payload).toEqual(eventData);
      expect(log.success).toBe(false);
      expect(log.statusCode).toBe(500);
      expect(log.attempt).toBe(3); // 3rd and final attempt failed
      expect(log.errorMessage).toContain('HTTP failure status: 500');
    });

    it('should stop retrying once delivery succeeds', async () => {
      // First attempt fails (500), second attempt succeeds (200)
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await service.createSubscription('https://example.com/flakey', ['stream.status_updated']);
      
      await service.dispatchEvent('stream.status_updated', {});

      // Attempt 1 fails
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Trigger Attempt 2 (succeeds)
      await vi.advanceTimersByTimeAsync(50);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // No subsequent attempts should be scheduled
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Await any pending background tasks
      await service.awaitPendingDeliveries();

      // Should not be logged to dead-letter log since it eventually succeeded
      const deadLetters = await service.getDeadLetters();
      expect(deadLetters).toHaveLength(0);
    });
  });
});

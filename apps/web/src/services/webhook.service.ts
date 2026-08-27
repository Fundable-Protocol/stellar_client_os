import fs from 'fs/promises';
import path from 'path';
import { createHmac, randomUUID } from 'crypto';
import type { WebhookSubscription, WebhookDeliveryAttempt, WebhookPayload } from '../types/webhook';

export interface WebhookServiceOptions {
  maxRetries?: number;
  baseDelay?: number; // ms
  subscriptionsPath?: string;
  deadLetterPath?: string;
}

export class WebhookService {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly subscriptionsPath: string;
  private readonly deadLetterPath: string;
  private readonly pendingDeliveries: Set<Promise<void>> = new Set();

  constructor(options: WebhookServiceOptions = {}) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelay = options.baseDelay ?? 1000;
    this.subscriptionsPath = options.subscriptionsPath ?? path.join(process.cwd(), 'data', 'webhook_subscriptions.json');
    this.deadLetterPath = options.deadLetterPath ?? path.join(process.cwd(), 'data', 'webhook_dead_letter.json');
  }

  // ============================================
  // Storage Methods (Subscriptions)
  // ============================================

  /**
   * Helper to write JSON file atomically
   */
  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  /**
   * Load all subscriptions from the file-based database
   */
  async getSubscriptions(): Promise<WebhookSubscription[]> {
    try {
      const data = await fs.readFile(this.subscriptionsPath, 'utf-8');
      return JSON.parse(data) as WebhookSubscription[];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        return [];
      }
      console.error('Failed to read webhook subscriptions:', err);
      throw err;
    }
  }

  /**
   * Register a new subscription
   */
  async createSubscription(url: string, events: string[], secret?: string): Promise<WebhookSubscription> {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid subscriber URL format');
    }

    if (!events || events.length === 0) {
      throw new Error('Subscription must specify at least one event type');
    }

    const subscriptions = await this.getSubscriptions();
    const newSubscription: WebhookSubscription = {
      id: 'sub_' + randomUUID().replace(/-/g, '').slice(0, 16),
      url,
      events,
      secret: secret || randomUUID().replace(/-/g, ''),
      createdAt: new Date().toISOString(),
    };

    subscriptions.push(newSubscription);
    await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    return newSubscription;
  }

  /**
   * Delete subscription by ID
   */
  async deleteSubscription(id: string): Promise<boolean> {
    const subscriptions = await this.getSubscriptions();
    const index = subscriptions.findIndex((sub) => sub.id === id);
    if (index === -1) {
      return false;
    }

    subscriptions.splice(index, 1);
    await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    return true;
  }

  // ============================================
  // Log / Dead-Letter Queue (DLQ) Methods
  // ============================================

  /**
   * Append a failed delivery attempt to the dead-letter log
   */
  async logToDeadLetter(attempt: WebhookDeliveryAttempt): Promise<void> {
    try {
      let deadLetters: WebhookDeliveryAttempt[] = [];
      try {
        const data = await fs.readFile(this.deadLetterPath, 'utf-8');
        deadLetters = JSON.parse(data) as WebhookDeliveryAttempt[];
      } catch (err: unknown) {
        if ((err as { code?: string }).code !== 'ENOENT') {
          console.error('Failed to read dead-letter log:', err);
        }
      }

      deadLetters.push(attempt);
      await this.writeJsonAtomic(this.deadLetterPath, deadLetters);
    } catch (err) {
      console.error('Critical failure writing to dead-letter log:', err);
    }
  }

  /**
   * Read all dead-letter deliveries
   */
  async getDeadLetters(): Promise<WebhookDeliveryAttempt[]> {
    try {
      const data = await fs.readFile(this.deadLetterPath, 'utf-8');
      return JSON.parse(data) as WebhookDeliveryAttempt[];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  // ============================================
  // Webhook Dispatcher Methods
  // ============================================

  /**
   * Wait for all pending deliveries (and scheduled retries) to complete
   */
  async awaitPendingDeliveries(): Promise<void> {
    while (this.pendingDeliveries.size > 0) {
      const promises = Array.from(this.pendingDeliveries);
      await Promise.all(promises);
    }
  }

  /**
   * Dispatch an event to all interested subscribers
   */
  async dispatchEvent(event: string, eventData: Record<string, unknown>): Promise<void> {
    const subscriptions = await this.getSubscriptions();
    const matchingSubs = subscriptions.filter(
      (sub) => sub.events.includes(event) || sub.events.includes('*')
    );

    matchingSubs.forEach((sub) => {
      const deliveryPromise = this.deliverWithRetry(sub, event, eventData);
      this.pendingDeliveries.add(deliveryPromise);
      deliveryPromise.finally(() => {
        this.pendingDeliveries.delete(deliveryPromise);
      });
    });
  }

  /**
   * Internal method to orchestrate delivery with backoff retries
   */
  private async deliverWithRetry(
    sub: WebhookSubscription,
    event: string,
    eventData: Record<string, unknown>,
    attemptNum = 1
  ): Promise<void> {
    const deliveryId = 'del_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const timestamp = Date.now();

    const payload: WebhookPayload = {
      id: deliveryId,
      event,
      timestamp,
      payload: eventData,
    };

    const payloadStr = JSON.stringify(payload);
    const hmac = createHmac('sha256', sub.secret);
    const signature = hmac.update(`${timestamp}.${payloadStr}`).digest('hex');

    let success = false;
    let statusCode: number | null = null;
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s HTTP timeout

      const response = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery-Id': deliveryId,
        },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;
      success = response.ok;

      if (!success) {
        errorMessage = `HTTP failure status: ${response.status}`;
      }
    } catch (err: unknown) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const attemptRecord: WebhookDeliveryAttempt = {
      id: deliveryId,
      subscriptionId: sub.id,
      event,
      url: sub.url,
      payload: eventData,
      timestamp: new Date().toISOString(),
      statusCode,
      success,
      errorMessage,
      attempt: attemptNum,
    };

    if (success) {
      console.log(`[Webhook success] Event: ${event}, Sub: ${sub.id}, Url: ${sub.url}`);
      return;
    }

    console.warn(
      `[Webhook failure] Attempt ${attemptNum}/${this.maxRetries} to ${sub.url} failed. Error: ${errorMessage}`
    );

    if (attemptNum < this.maxRetries) {
      const backoffDelay = this.baseDelay * Math.pow(2, attemptNum - 1);
      
      const retryPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.deliverWithRetry(sub, event, eventData, attemptNum + 1).then(resolve, resolve);
        }, backoffDelay);
      });

      this.pendingDeliveries.add(retryPromise);
      retryPromise.finally(() => {
        this.pendingDeliveries.delete(retryPromise);
      });
      
      await retryPromise;
    } else {
      console.error(
        `[Webhook dead-letter] All retries (${this.maxRetries}) exhausted for ${sub.url}. Writing to DLQ.`
      );
      await this.logToDeadLetter(attemptRecord);
    }
  }
}

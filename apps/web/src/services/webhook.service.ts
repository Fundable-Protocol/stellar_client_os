import fs from 'fs/promises';
import type { CampaignWebhookEvent } from "../types/webhook";
import path from 'path';
import { createHmac, randomUUID } from 'crypto';
import type { WebhookSubscription, WebhookDeliveryAttempt, WebhookPayload } from '../types/webhook';

const IDEMPOTENCY_FIELDS = [
  'idempotencyKey',
  'idempotency_key',
  'eventId',
  'event_id',
  'notificationId',
  'notification_id',
  'verificationId',
  'verification_id',
  'campaignId',
  'campaign_id',
  'campaign',
  'nullifier',
  'txHash',
  'tx_hash',
  'transactionHash',
  'transaction_hash',
] as const;

/**
 * Return the caller-provided identity for an event, if one is available.
 *
 * A generated webhook delivery ID is deliberately not used here: it changes
 * every time the same source event is dispatched and therefore cannot prevent
 * duplicate notifications. Events without a stable identity retain the
 * existing at-least-once delivery behavior.
 */
export function getEventIdempotencyKey(
  event: string,
  eventData: Record<string, unknown>,
): string | null {
  for (const field of IDEMPOTENCY_FIELDS) {
    const value = eventData[field];
    if (typeof value === 'string' && value.length > 0) {
      return `${event}:${field}:${value}`;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return `${event}:${field}:${String(value)}`;
    }
  }

  return null;
}

export interface WebhookServiceOptions {
  maxRetries?: number;
  baseDelay?: number; // ms
  subscriptionsPath?: string;
  deadLetterPath?: string;
  /** Persistent store for successfully delivered event identities. */
  deduplicationPath?: string;
  /** Rolling log of every delivery attempt (success and failure). */
  deliveryLogPath?: string;
  /** Maximum number of attempts kept in the delivery log. */
  deliveryLogLimit?: number;
}

export interface DispatchOptions {
  /**
   * Creator the event belongs to. Creator-owned subscriptions only receive
   * events whose creatorId matches; global subscriptions receive all events.
   */
  creatorId?: string;
  /** Restrict delivery to these subscriptions (e.g. a "send test event" button). */
  subscriptionIds?: string[];
}

export interface DeliveryLogQuery {
  subscriptionId?: string;
  creatorId?: string;
  limit?: number;
}

const sameId = (a?: string, b?: string) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

interface DedupeState {
  delivered: string[];
}

export class WebhookService {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly subscriptionsPath: string;
  private readonly deadLetterPath: string;
  private readonly deduplicationPath: string;
  private readonly deliveryLogPath: string;
  private readonly deliveryLogLimit: number;
  private deliveryLogLock: Promise<void> = Promise.resolve();
  private readonly pendingDeliveries: Set<Promise<unknown>> = new Set();
  private readonly inFlightEventKeys = new Set<string>();
  private readonly deliveredEventKeys = new Set<string>();
  private deduplicationLoaded = false;
  private deduplicationLock: Promise<void> = Promise.resolve();

  constructor(options: WebhookServiceOptions = {}) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelay = options.baseDelay ?? 1000;
    this.subscriptionsPath = options.subscriptionsPath ?? path.join(process.cwd(), 'data', 'webhook_subscriptions.json');
    this.deadLetterPath = options.deadLetterPath ?? path.join(process.cwd(), 'data', 'webhook_dead_letter.json');
    this.deduplicationPath = options.deduplicationPath ?? path.join(process.cwd(), 'data', 'webhook_delivered_events.json');
    this.deliveryLogPath =
      options.deliveryLogPath ?? path.join(path.dirname(this.subscriptionsPath), 'webhook_delivery_log.json');
    this.deliveryLogLimit = options.deliveryLogLimit ?? 1000;
  }

  /** Total delivery attempts (first try + retries) made before dead-lettering. */
  get maxAttempts(): number {
    return this.maxRetries;
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
  async createSubscription(
    url: string,
    events: string[],
    secret?: string,
    options: { creatorId?: string; enabled?: boolean } = {},
  ): Promise<WebhookSubscription> {
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
      ...(options.creatorId && { creatorId: options.creatorId }),
      ...(options.enabled !== undefined && { enabled: options.enabled }),
    };

    subscriptions.push(newSubscription);
    await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    return newSubscription;
  }

  /**
   * Update a subscription's URL, events, secret or enabled flag.
   * Returns null when the subscription does not exist.
   */
  async updateSubscription(
    id: string,
    patch: Partial<Pick<WebhookSubscription, 'url' | 'events' | 'secret' | 'enabled'>>,
  ): Promise<WebhookSubscription | null> {
    if (patch.url !== undefined) {
      try {
        new URL(patch.url);
      } catch {
        throw new Error('Invalid subscriber URL format');
      }
    }
    if (patch.events !== undefined && patch.events.length === 0) {
      throw new Error('Subscription must specify at least one event type');
    }

    const subscriptions = await this.getSubscriptions();
    const index = subscriptions.findIndex((sub) => sub.id === id);
    if (index === -1) return null;

    const updated: WebhookSubscription = {
      ...subscriptions[index],
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    subscriptions[index] = updated;
    await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    return updated;
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
  // Idempotency Methods
  // ============================================

  /** Serialize mutations to the persistent idempotency store. */
  private async withDeduplicationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.deduplicationLock;
    let release!: () => void;
    this.deduplicationLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async loadDeduplicationState(): Promise<void> {
    if (this.deduplicationLoaded) return;

    try {
      const data = await fs.readFile(this.deduplicationPath, 'utf-8');
      const state = JSON.parse(data) as DedupeState;
      if (Array.isArray(state.delivered)) {
        for (const key of state.delivered) {
          if (typeof key === 'string') this.deliveredEventKeys.add(key);
        }
      }
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    this.deduplicationLoaded = true;
  }

  private async persistDeduplicationState(): Promise<void> {
    const state: DedupeState = {
      delivered: Array.from(this.deliveredEventKeys),
    };
    await this.writeJsonAtomic(this.deduplicationPath, state);
  }

  /** Reserve an event identity so concurrent dispatches cannot deliver twice. */
  private async reserveEvent(eventKey: string | null): Promise<boolean> {
    if (!eventKey) return true;

    return this.withDeduplicationLock(async () => {
      await this.loadDeduplicationState();
      if (this.deliveredEventKeys.has(eventKey) || this.inFlightEventKeys.has(eventKey)) {
        return false;
      }
      this.inFlightEventKeys.add(eventKey);
      return true;
    });
  }

  private async completeEvent(eventKey: string | null, delivered: boolean): Promise<void> {
    if (!eventKey) return;

    await this.withDeduplicationLock(async () => {
      this.inFlightEventKeys.delete(eventKey);
      if (!delivered) return;

      this.deliveredEventKeys.add(eventKey);
      await this.persistDeduplicationState();
    });
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

  /**
   * Record an attempt without delaying delivery or retry scheduling. The write
   * is tracked so awaitPendingDeliveries() also waits for the log to settle.
   */
  private logDeliveryAttempt(attempt: WebhookDeliveryAttempt): void {
    const write = this.recordDeliveryAttempt(attempt);
    this.pendingDeliveries.add(write);
    write.finally(() => {
      this.pendingDeliveries.delete(write);
    });
  }

  /** Append an attempt to the rolling delivery log. Never throws. */
  private async recordDeliveryAttempt(attempt: WebhookDeliveryAttempt): Promise<void> {
    const previous = this.deliveryLogLock;
    let release!: () => void;
    this.deliveryLogLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      const log = await this.readDeliveryLog();
      log.push(attempt);
      await this.writeJsonAtomic(this.deliveryLogPath, log.slice(-this.deliveryLogLimit));
    } catch (err) {
      console.error('Failed to write webhook delivery log:', err);
    } finally {
      release();
    }
  }

  private async readDeliveryLog(): Promise<WebhookDeliveryAttempt[]> {
    try {
      const data = await fs.readFile(this.deliveryLogPath, 'utf-8');
      return JSON.parse(data) as WebhookDeliveryAttempt[];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return [];
      throw err;
    }
  }

  /** Delivery attempts, newest first, optionally scoped to a subscription or creator. */
  async getDeliveryLog(query: DeliveryLogQuery = {}): Promise<WebhookDeliveryAttempt[]> {
    const log = await this.readDeliveryLog();
    const filtered = log.filter(
      (entry) =>
        (!query.subscriptionId || entry.subscriptionId === query.subscriptionId) &&
        (!query.creatorId || sameId(entry.creatorId, query.creatorId)),
    );
    return filtered.reverse().slice(0, query.limit ?? 100);
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
  async dispatchEvent(
    event: string,
    eventData: Record<string, unknown>,
    options: DispatchOptions = {},
  ): Promise<void> {
    const subscriptions = await this.getSubscriptions();
    const matchingSubs = subscriptions.filter(
      (sub) =>
        (sub.events.includes(event) || sub.events.includes('*')) &&
        sub.enabled !== false &&
        (!sub.creatorId || sameId(sub.creatorId, options.creatorId)) &&
        (!options.subscriptionIds || options.subscriptionIds.includes(sub.id))
    );

    for (const sub of matchingSubs) {
      // Dedupe per subscription: one subscriber must not suppress delivery to
      // another subscriber that is also listening for the same source event.
      const sourceKey = getEventIdempotencyKey(event, eventData);
      const eventKey = sourceKey ? `${sub.id}:${sourceKey}` : null;
      if (!(await this.reserveEvent(eventKey))) continue;

      const deliveryPromise = this.deliverWithRetry(sub, event, eventData).then(
        (delivered) => this.completeEvent(eventKey, delivered),
        async () => {
          await this.completeEvent(eventKey, false);
        },
      );
      this.pendingDeliveries.add(deliveryPromise);
      deliveryPromise.finally(() => {
        this.pendingDeliveries.delete(deliveryPromise);
      });
    }
  }

  /**
   * Internal method to orchestrate delivery with backoff retries
   */
  private async deliverWithRetry(
    sub: WebhookSubscription,
    event: string,
    eventData: Record<string, unknown>,
    attemptNum = 1
  ): Promise<boolean> {
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
      maxAttempts: this.maxRetries,
      nextRetryAt: null,
      ...(sub.creatorId && { creatorId: sub.creatorId }),
    };

    if (success) {
      console.log(`[Webhook success] Event: ${event}, Sub: ${sub.id}, Url: ${sub.url}`);
      this.logDeliveryAttempt(attemptRecord);
      return true;
    }

    console.warn(
      `[Webhook failure] Attempt ${attemptNum}/${this.maxRetries} to ${sub.url} failed. Error: ${errorMessage}`
    );

    if (attemptNum < this.maxRetries) {
      const backoffDelay = this.baseDelay * Math.pow(2, attemptNum - 1);
      this.logDeliveryAttempt({
        ...attemptRecord,
        nextRetryAt: new Date(Date.now() + backoffDelay).toISOString(),
      });

      const retryPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          this.deliverWithRetry(sub, event, eventData, attemptNum + 1).then(resolve, () => resolve(false));
        }, backoffDelay);
      });

      this.pendingDeliveries.add(retryPromise);
      retryPromise.finally(() => {
        this.pendingDeliveries.delete(retryPromise);
      });
      
      return retryPromise;
    } else {
      console.error(
        `[Webhook dead-letter] All retries (${this.maxRetries}) exhausted for ${sub.url}. Writing to DLQ.`
      );
      this.logDeliveryAttempt(attemptRecord);
      await this.logToDeadLetter(attemptRecord);
      return false;
    }
  }
}


/** Dispatch one of the campaign integration events through the signed delivery pipeline. */
export async function dispatchCampaignWebhook(
  event: CampaignWebhookEvent,
  payload: Record<string, unknown>,
  service = new WebhookService(),
): Promise<void> {
  if (!payload.eventId && !payload.verificationId && !payload.treeId && !payload.campaignId) {
    throw new Error("Campaign webhook payload must include a stable eventId, verificationId, treeId, or campaignId");
  }
  await service.dispatchEvent(event, payload);
}

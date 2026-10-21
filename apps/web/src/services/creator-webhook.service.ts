/**
 * Creator Webhook Service (#1220)
 *
 * Lets a campaign creator register one HTTPS endpoint that receives signed
 * POST notifications for their campaigns' lifecycle events. Delivery, HMAC
 * signing, exponential back-off retries and dead-lettering are handled by
 * WebhookService; this layer scopes subscriptions and the event log to a
 * creator and keeps the signing secret write-only.
 */

import { randomBytes } from "crypto";
import { WebhookService } from "./webhook.service";
import type { WebhookDeliveryAttempt, WebhookSubscription } from "@/types/webhook";

export const CREATOR_WEBHOOK_EVENTS = [
  "pledge.created",
  "campaign.milestone_reached",
  "campaign.ended",
  "refund.requested",
] as const;

export type CreatorWebhookEvent = (typeof CREATOR_WEBHOOK_EVENTS)[number];

/** Sent by the "send test event" button; always delivered to the creator's endpoint. */
export const CREATOR_WEBHOOK_TEST_EVENT = "webhook.test";

export const MIN_WEBHOOK_SECRET_LENGTH = 16;

export type CreatorWebhookErrorCode = "INVALID_INPUT" | "NOT_CONFIGURED" | "NOT_AUTHORIZED";

export class CreatorWebhookError extends Error {
  constructor(
    public readonly code: CreatorWebhookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreatorWebhookError";
  }
}

/** Public view of a creator's endpoint: the secret is never returned after creation. */
export interface CreatorWebhookConfig {
  id: string;
  url: string;
  events: CreatorWebhookEvent[];
  enabled: boolean;
  secretPreview: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SaveCreatorWebhookInput {
  url?: unknown;
  events?: unknown;
  secret?: unknown;
  enabled?: unknown;
  rotateSecret?: unknown;
}

export interface SaveCreatorWebhookResult {
  config: CreatorWebhookConfig;
  /** Present only when a secret was generated or replaced by this call. */
  secret?: string;
}

const isCreatorEvent = (value: unknown): value is CreatorWebhookEvent =>
  typeof value === "string" && (CREATOR_WEBHOOK_EVENTS as readonly string[]).includes(value);

const sameId = (a?: string, b?: string) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function maskSecret(secret: string): string {
  return secret.length <= 8 ? "••••" : `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

function validateUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreatorWebhookError("INVALID_INPUT", "url is required");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CreatorWebhookError("INVALID_INPUT", "url must be a valid absolute URL");
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost && process.env.NODE_ENV !== "production")) {
    throw new CreatorWebhookError("INVALID_INPUT", "url must use https");
  }
  return url.toString();
}

function validateEvents(value: unknown): CreatorWebhookEvent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CreatorWebhookError("INVALID_INPUT", "Select at least one event");
  }
  const invalid = value.filter((event) => !isCreatorEvent(event));
  if (invalid.length > 0) {
    throw new CreatorWebhookError(
      "INVALID_INPUT",
      `Unsupported events: ${invalid.join(", ")}. Allowed: ${CREATOR_WEBHOOK_EVENTS.join(", ")}`,
    );
  }
  return [...new Set(value as CreatorWebhookEvent[])];
}

function validateSecret(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length < MIN_WEBHOOK_SECRET_LENGTH) {
    throw new CreatorWebhookError(
      "INVALID_INPUT",
      `secret must be at least ${MIN_WEBHOOK_SECRET_LENGTH} characters`,
    );
  }
  return value.trim();
}

function toConfig(sub: WebhookSubscription): CreatorWebhookConfig {
  return {
    id: sub.id,
    url: sub.url,
    events: sub.events.filter(isCreatorEvent),
    enabled: sub.enabled !== false,
    secretPreview: maskSecret(sub.secret),
    createdAt: sub.createdAt,
    ...(sub.updatedAt && { updatedAt: sub.updatedAt }),
  };
}

export class CreatorWebhookService {
  constructor(private readonly webhooks = new WebhookService()) {}

  get maxAttempts(): number {
    return this.webhooks.maxAttempts;
  }

  private async findSubscription(creatorId: string): Promise<WebhookSubscription | null> {
    const subscriptions = await this.webhooks.getSubscriptions();
    return subscriptions.find((sub) => sameId(sub.creatorId, creatorId)) ?? null;
  }

  async getConfig(creatorId: string): Promise<CreatorWebhookConfig | null> {
    const sub = await this.findSubscription(creatorId);
    return sub ? toConfig(sub) : null;
  }

  /** Create or update the creator's endpoint. */
  async saveConfig(creatorId: string, input: SaveCreatorWebhookInput): Promise<SaveCreatorWebhookResult> {
    if (!creatorId.trim()) throw new CreatorWebhookError("INVALID_INPUT", "creator address is required");
    const existing = await this.findSubscription(creatorId);
    const providedSecret = validateSecret(input.secret);
    const enabled = typeof input.enabled === "boolean" ? input.enabled : undefined;

    // The test event is always subscribed so "send test event" works for any selection.
    const withTestEvent = (events: CreatorWebhookEvent[]) => [...events, CREATOR_WEBHOOK_TEST_EVENT];

    if (!existing) {
      const url = validateUrl(input.url);
      const events = validateEvents(input.events ?? [...CREATOR_WEBHOOK_EVENTS]);
      const secret = providedSecret ?? generateWebhookSecret();
      const sub = await this.webhooks.createSubscription(url, withTestEvent(events), secret, {
        creatorId: creatorId.trim(),
        enabled: enabled ?? true,
      });
      return { config: toConfig(sub), secret };
    }

    const rotate = input.rotateSecret === true;
    const secret = providedSecret ?? (rotate ? generateWebhookSecret() : undefined);
    const updated = await this.webhooks.updateSubscription(existing.id, {
      url: input.url !== undefined ? validateUrl(input.url) : undefined,
      events: input.events !== undefined ? withTestEvent(validateEvents(input.events)) : undefined,
      secret,
      enabled,
    });
    if (!updated) throw new CreatorWebhookError("NOT_CONFIGURED", "Webhook not found");
    return { config: toConfig(updated), ...(secret && { secret }) };
  }

  async deleteConfig(creatorId: string): Promise<boolean> {
    const sub = await this.findSubscription(creatorId);
    return sub ? this.webhooks.deleteSubscription(sub.id) : false;
  }

  /** Queue a signed test delivery to the creator's endpoint. */
  async sendTestEvent(creatorId: string): Promise<void> {
    const sub = await this.findSubscription(creatorId);
    if (!sub) throw new CreatorWebhookError("NOT_CONFIGURED", "Configure a webhook URL first");
    await this.webhooks.dispatchEvent(
      CREATOR_WEBHOOK_TEST_EVENT,
      { message: "This is a test event from Fundable.", sentAt: new Date().toISOString() },
      { creatorId: sub.creatorId, subscriptionIds: [sub.id] },
    );
  }

  /** Recent delivery attempts for the creator's endpoint(s), newest first. */
  async getEventLog(creatorId: string, limit = 50): Promise<WebhookDeliveryAttempt[]> {
    return this.webhooks.getDeliveryLog({ creatorId, limit: Math.min(Math.max(limit, 1), 200) });
  }

  /**
   * Notify a creator's endpoint of a lifecycle event. `eventId` must be stable
   * for the source event so retried dispatches are deduplicated.
   */
  async notify(
    creatorId: string | undefined,
    event: CreatorWebhookEvent,
    payload: { eventId: string; campaignId: string } & Record<string, unknown>,
  ): Promise<void> {
    if (!creatorId) return;
    await this.webhooks.dispatchEvent(event, { ...payload, creatorId }, { creatorId });
  }

  /** Wait for in-flight deliveries (tests and graceful shutdown). */
  awaitPendingDeliveries(): Promise<void> {
    return this.webhooks.awaitPendingDeliveries();
  }
}

export const creatorWebhookService = new CreatorWebhookService();

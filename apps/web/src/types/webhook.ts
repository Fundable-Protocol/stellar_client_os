export const CAMPAIGN_WEBHOOK_EVENTS = ["tree_verified", "batch_verified", "campaign_milestone_reached", "campaign_completed"] as const;
export type CampaignWebhookEvent = (typeof CAMPAIGN_WEBHOOK_EVENTS)[number];

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[]; // e.g., ["stream.status_updated", "milestone.funds_released"] or ["*"]
  secret: string; // Used for HMAC-SHA256 signature
  createdAt: string;
  /** Set for creator-owned endpoints; they only receive events dispatched for that creator. */
  creatorId?: string;
  /** Paused subscriptions are kept but receive no deliveries. Defaults to true. */
  enabled?: boolean;
  updatedAt?: string;
}

export interface WebhookPayload {
  id: string; // Unique delivery attempt UUID
  event: string; // Event name (e.g., 'stream.status_updated')
  timestamp: number; // Epoch timestamp of delivery
  payload: Record<string, unknown>; // Event details
}

export interface WebhookDeliveryAttempt {
  id: string; // Unique delivery ID
  subscriptionId: string;
  event: string;
  url: string;
  payload: Record<string, unknown>;
  timestamp: string; // ISO string
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  attempt: number; // Retries count (1 for first try, 2, etc.)
  /** Total attempts allowed for this delivery. */
  maxAttempts?: number;
  /** When the next retry is scheduled; null when no retry follows this attempt. */
  nextRetryAt?: string | null;
  creatorId?: string;
}

export type WebhookDeliveryStatus = "delivered" | "retrying" | "failed";

export function getDeliveryStatus(attempt: WebhookDeliveryAttempt): WebhookDeliveryStatus {
  if (attempt.success) return "delivered";
  return attempt.nextRetryAt ? "retrying" : "failed";
}

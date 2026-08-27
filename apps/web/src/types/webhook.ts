export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[]; // e.g., ["stream.status_updated", "milestone.funds_released"] or ["*"]
  secret: string; // Used for HMAC-SHA256 signature
  createdAt: string;
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
}

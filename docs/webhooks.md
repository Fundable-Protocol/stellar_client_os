# Webhook Delivery System

The Fundable Webhook Delivery System enables real-time notification of events on the platform (e.g., when a stream status is updated or milestone funds are released) directly to external HTTP endpoints.

## 🚀 Subscription Management API

### 1. Register a Subscription
* **Endpoint:** `POST /api/webhooks/subscriptions`
* **Content-Type:** `application/json`
* **Request Body:**
```json
{
  "url": "https://your-service.com/webhook",
  "events": ["stream.status_updated", "milestone.funds_released"],
  "secret": "your_custom_secret_key" // Optional: auto-generated if omitted (min 8 chars)
}
```
* **Response:**
```json
{
  "id": "sub_12345abcd",
  "url": "https://your-service.com/webhook",
  "events": ["stream.status_updated", "milestone.funds_released"],
  "secret": "generated_or_provided_secret_key",
  "createdAt": "2026-07-29T13:00:00.000Z"
}
```

### 2. List Subscriptions
* **Endpoint:** `GET /api/webhooks/subscriptions`
* **Response:**
```json
[
  {
    "id": "sub_12345abcd",
    "url": "https://your-service.com/webhook",
    "events": ["stream.status_updated", "milestone.funds_released"],
    "secret": "generated_or_provided_secret_key",
    "createdAt": "2026-07-29T13:00:00.000Z"
  }
]
```

### 3. Delete a Subscription
* **Endpoint:** `DELETE /api/webhooks/subscriptions/[id]`
* **Response:**
```json
{
  "success": true,
  "message": "Subscription deleted successfully"
}
```

---

## ♻️ Idempotent Event Delivery

When the same source event can be observed through more than one backend path, include a stable identity in the event payload so it can be delivered only once to each subscriber. The webhook service recognizes `idempotencyKey`, `eventId`, `notificationId`, `verificationId`, `nullifier`, `txHash`, and their snake-case equivalents. For tree-verification events, the verification event ID or nullifier is the appropriate identity; the generated `X-Webhook-Delivery-Id` must not be used because it changes on every attempt.

Successful identities are persisted in `apps/web/data/webhook_delivered_events.json`, and concurrent dispatches are reserved before delivery. De-duplication is scoped to the subscription, so the same event is still delivered once to every distinct subscriber. Events without a stable identity retain the existing at-least-once behavior, and failed deliveries are not marked as complete so a later dispatch can retry them.

---

## 🔒 Signature Verification

Every webhook payload delivered includes the following headers to enable authenticity verification and prevent replay attacks:

* `X-Webhook-Timestamp`: Unix epoch timestamp of the dispatch.
* `X-Webhook-Signature`: The computed HMAC-SHA256 hex signature of the payload.
* `X-Webhook-Event`: The type of event (e.g. `stream.status_updated`).
* `X-Webhook-Delivery-Id`: Unique delivery execution ID.

### Verifying Signatures (Node.js Example)

To verify the payload was sent by Fundable and was not tampered with, sign the string: `<X-Webhook-Timestamp>.<stringified_json_body>` using the shared subscription `secret`:

```javascript
import { createHmac } from 'crypto';

function verifyWebhook(req, secret) {
  const timestamp = req.headers['x-webhook-timestamp'];
  const signature = req.headers['x-webhook-signature'];
  const rawBody = JSON.stringify(req.body); // Ensure this is the raw string body

  const expectedSignature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return expectedSignature === signature;
}
```

---

## 🔄 Delivery Retries and Dead-Letter Queue (DLQ)

If a subscriber's endpoint fails to acknowledge the webhook payload (returns a non-2xx status, times out, or encounters a network error), the delivery system will automatically retry:

* **Max Retries:** 5 attempts.
* **Exponential Backoff:** The delay doubles after each failed attempt:
  * Attempt 1: Immediate
  * Attempt 2: 2s delay
  * Attempt 3: 4s delay
  * Attempt 4: 8s delay
  * Attempt 5: 16s delay
* **Dead-Letter Queue:** If all 5 attempts fail, the delivery attempt (including the payload, destination URL, status code, timestamps, and error message) is permanently logged to the dead-letter queue (`apps/web/data/webhook_dead_letter.json`).

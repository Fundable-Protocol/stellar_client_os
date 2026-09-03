# Campaign API Rate Limits & Throttling Policy

This document outlines the API rate limits, throttling strategy, response headers, and procedure for requesting higher usage limits across the Fundable Campaign API platform.

---

## ⏱️ Overview of Rate Limits

To maintain system stability, protect on-chain and backend infrastructure from abuse, and ensure fair resource allocation, all Campaign API endpoints enforce sliding-window rate limits.

Rate limits are evaluated per client IP address (or authenticated API key/Stellar wallet address) over a rolling 60-second window (`windowMs = 60000`).

### Endpoint Tiers

| Tier Name | Endpoints | Default Limit (per min) | Burst Tolerance |
| :--- | :--- | :--- | :--- |
| **Read Tier** | `GET /api/campaigns/*`, `GET /api/reports/*`, `GET /api/graphql` | 60 requests / min | 15 req / 10s |
| **Creation Tier** | `POST /api/streams`, `POST /api/campaigns/metadata/ipfs` | 30 requests / min | 5 req / 10s |
| **Execution & Submission Tier** | `POST /api/campaigns/creator-stats`, `POST /api/webhooks/subscriptions`, Payment operations | 10 requests / min | 2 req / 10s |
| **Enterprise / Institutional Tier** | Custom provisioned endpoints & whitelisted API keys | Up to 5,000 requests / min | Custom |

---

## 🛠️ Throttling Strategy & Implementation

Fundable uses an atomic **Sliding-Window Counter** algorithm backed by Redis sorted sets (`ZSET`) and Lua scripts (`SLIDING_WINDOW_SCRIPT`).

### Algorithm Characteristics
1. **Precision Sliding Window:** Unlike fixed-window counters, the sliding window prevents traffic bursts at window boundaries (up to 2x limit).
2. **Atomic Execution:** Evaluated as a single Redis command to prevent TOCTOU (Time-Of-Check To Time-Of-Use) race conditions under high concurrency.
3. **Graceful Degradation:** In the event of a Redis connectivity outage, the rate-limiting middleware fails-open (`allowed: true`) to prevent blocking legitimate transaction flow.
4. **Key Extraction Strategy:**
   - Evaluates `X-Forwarded-For` header (primary).
   - Falls back to `X-Real-IP`.
   - Falls back to authenticated wallet address / API Key.

---

## 📡 HTTP Response Headers

Every API response from rate-limited endpoints includes standardized rate limit headers complying with IETF standards:

| Response Header | Description | Example |
| :--- | :--- | :--- |
| `RateLimit-Limit` | Maximum allowed requests within the current window | `60` |
| `RateLimit-Remaining` | Remaining requests available in the current window | `54` |
| `RateLimit-Reset` | Time in seconds until the oldest request in the window expires | `18` |
| `X-RateLimit-Limit` | Compatibility alias for limit | `60` |
| `X-RateLimit-Remaining` | Compatibility alias for remaining | `54` |
| `X-RateLimit-Reset` | Compatibility alias for reset seconds | `18` |
| `Retry-After` | Included on HTTP 429 status code; specifies seconds to wait before retrying | `30` |

### Throttled Error Response (HTTP 429)

When rate limits are exceeded, the server responds with HTTP Status `429 Too Many Requests`:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": "30"
}
```

---

## 🚀 Requesting Higher Limits

If your application or institution requires higher throughput, custom rate limits can be requested through the following process:

### 1. Self-Service Skip-List / Whitelisting (Development & Staging)
For internal node operators or partner gateways, add your service IP address to the `RATE_LIMIT_SKIP_IPS` environment variable:

```env
RATE_LIMIT_SKIP_IPS="192.168.1.10,10.0.4.15"
```

### 2. Requesting Enterprise Tier API Keys
To request an enterprise rate limit expansion:
1. Submit an enterprise expansion request to `api-support@fundable.protocol`.
2. Provide your wallet address, organization name, target endpoint list, and expected peak requests per minute.
3. Upon approval, you will receive an authenticated API Key (`X-API-Key`) with elevated quota tier limits up to 5,000 req/min.

---

## 🔗 Related References
- [Webhook Delivery System](file:///c:/Users/Hp/Desktop/drip/stellar_client_os-1/docs/webhooks.md)
- [OpenAPI Specification](file:///c:/Users/Hp/Desktop/drip/stellar_client_os-1/docs/openapi.yaml)

# Public API Rate Limits & Tier-Based Pricing

This document outlines the rate limiting policy, tier-based pricing structure, authentication schemes, response headers, and integration best practices for the **Fundable Stellar Public API**.

---

## 1. Overview

To ensure fair usage, high availability, and platform stability across the Stellar ecosystem, Fundable enforces a **sliding-window rate limiter** backed by Redis sorted sets.

- **Sliding-Window Guarantees:** Unlike naive fixed-window limiters which allow bursts of up to 2× the rate limit at boundary transitions, Fundable calculates rolling request frequencies atomically via Lua scripts.
- **Graceful Degradation:** In the unlikely event of cache unavailability, the API degrades gracefully without blocking mission-critical transactions.

---

## 2. Pricing Tiers & Usage Limits

Fundable offers tiered access designed to support everyone from indie planters to enterprise sustainability platforms:

| Tier | Daily Request Limit | Monthly Price (USD) | Burst Limit (Req / Min) | Support SLA | Recommended For |
|---|---|---|---|---|---|
| **Free Tier** | **100 req / day** | **$0.00** | 10 req / min | Community (Discord / GitHub) | Development, testing, indie planters, personal trackers |
| **Paid Tier 1** | **1,000 req / day** | **$10.00 / month** | 60 req / min | Standard Email (48h SLA) | Production dApps, community bots, regional reforestation dashboards |
| **Paid Tier 2** | **10,000 req / day** | **$50.00 / month** | 300 req / min | Priority Support (12h SLA) | High-volume indexers, analytics providers, multi-chain bridges, enterprise portals |
| **Enterprise Tier** | **100,000+ req / day** | **Custom ($250+/mo)** | 1,000+ req / min | Dedicated 24/7 & 99.9% Uptime SLA | Institutional sponsors, global carbon registries, high-frequency settlement nodes |

---

## 3. Authentication & API Keys

### Unauthenticated (Free Tier)
Requests without an API key are automatically mapped to the **Free Tier** (100 req/day). The rate limit identifier is extracted from the client's IP address (`X-Forwarded-For` or `X-Real-IP`).

### Authenticated (Paid Tiers)
Subscribers receive an API key corresponding to their purchased tier. Pass your key in any of the following standard headers:

1. **Bearer Token (Recommended):**
   ```http
   Authorization: Bearer pk_live_t1_xxxxxxxxxxxxxxxx
   ```
2. **API Key Header:**
   ```http
   X-API-Key: pk_live_t2_xxxxxxxxxxxxxxxx
   ```

---

## 4. Rate Limit Response Headers

Every public API response includes standardized IETF and legacy `X-RateLimit` headers informing clients of their current quota status:

| Header | Description | Example |
|---|---|---|
| `RateLimit-Limit` | Maximum allowed requests in the current window | `1000` |
| `RateLimit-Remaining` | Number of requests remaining before being throttled | `842` |
| `RateLimit-Reset` | Time in seconds until the current rolling window fully resets | `36` |
| `X-RateLimit-Limit` | Legacy compatibility header for limit | `1000` |
| `X-RateLimit-Remaining` | Legacy compatibility header for remaining count | `842` |
| `X-RateLimit-Reset` | Legacy compatibility header for reset time | `36` |
| `Retry-After` | *(Included only when status is 429)* Seconds to wait before retrying | `45` |

---

## 5. Handling 429 (Rate Limit Exceeded)

When the rate limit threshold is breached, the API immediately responds with `HTTP 429 Too Many Requests` and a standard JSON error payload:

### Example 429 Response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 45
Retry-After: 45

{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Daily rate limit exceeded for Free Tier (100 req/day). Please upgrade to Tier 1 ($10/mo for 1,000 req/day) or Tier 2 ($50/mo for 10,000 req/day).",
  "retryAfter": 45,
  "currentTier": "free",
  "upgradeUrl": "https://fundable.network/pricing"
}
```

---

## 6. Upgrading Your Subscription

Subscriptions can be provisioned and paid using:
1. **On-Chain Settlement (Stellar USDC / XLM):** Direct payment streaming or monthly distribution contracts to Fundable Protocol.
2. **Credit Card / Fiat (Stripe):** Available through the developer dashboard at `https://fundable.network/dashboard`.

Once payment is confirmed, an API key with prefixes `pk_live_t1_` (Tier 1) or `pk_live_t2_` (Tier 2) is generated and activated instantaneously.

---

## 7. Client Integration Best Practices

### A. Exponential Backoff with Jitter
When receiving an `HTTP 429`, always respect the `Retry-After` header or apply exponential backoff with full jitter:

```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("Retry-After")) || Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000 + jitter));
      continue;
    }

    return res;
  }
  throw new Error("Rate limit retry budget exceeded");
}
```

### B. Client-Side Caching & Webhooks
- **GraphQL Analytics & Map Streams:** Cache geospatial responses locally for at least 30–60 seconds.
- **Real-Time Updates:** Instead of polling endpoints, subscribe to our [Webhook Notifications](webhooks.md) for tree milestone verifications and stream lifecycle events.

---

## 8. Summary Table for Developers

```
+-----------------------------------------------------------------------------------+
| Tier         | Daily Limit  | Monthly Price | Auth Method   | Key Prefix          |
+-----------------------------------------------------------------------------------+
| Free         | 100 req/day  | $0 / mo       | Client IP     | None (Default)      |
| Paid Tier 1  | 1,000 req/day| $10 / mo      | Bearer Token  | pk_live_t1_...      |
| Paid Tier 2  | 10,000 req/d | $50 / mo      | Bearer Token  | pk_live_t2_...      |
| Enterprise   | 100k+ req/day| Custom ($250+)| Dedicated     | pk_live_ent_...     |
+-----------------------------------------------------------------------------------+
```

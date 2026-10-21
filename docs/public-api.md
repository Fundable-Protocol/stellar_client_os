# Public API for Third-Party Campaign Integrations

The **Fundable RESTful Public API (`v1`)** enables third-party platforms, sustainability dashboards, and partner dApps to authenticate via **OAuth 2.0**, read verified campaign data, embed live impact widgets, and subscribe to HMAC-signed webhooks across isolated **Sandbox** and **Production** environments.

---

## 1. OAuth 2.0 Authentication

All Public API `v1` endpoints require an OAuth 2.0 Bearer access token passed in the `Authorization` header:

```http
Authorization: Bearer fnd_at_sbx_9f8e7d6c5b4a3210
```

### Supported Scopes

| Scope | Permission |
| :--- | :--- |
| `campaigns:read` | Read campaign listings, funding progress, ecological impact metrics, and quota status |
| `widgets:embed` | Generate embeddable campaign widget snippets (`<iframe>` / `<script>`) and render widget HTML |
| `webhooks:manage` | Register, list, delete, and trigger test webhook subscriptions |

### Supported Grant Flows

1. **Client Credentials (`client_credentials`)** — Server-to-server integrations
2. **Authorization Code (`authorization_code`)** — User-delegated third-party apps via `GET/POST /api/v1/oauth/authorize`
3. **Refresh Token (`refresh_token`)** — Rotate expired access tokens without re-prompting

### Requesting an Access Token

**Endpoint:** `POST /api/v1/oauth/token`

```bash
curl -X POST https://fundable.network/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "fnd_sbx_client_demo",
    "client_secret": "fnd_sbx_secret_demo_2026",
    "scope": "campaigns:read widgets:embed webhooks:manage"
  }'
```

**Response (`200 OK`):**

```json
{
  "access_token": "fnd_at_sbx_e4d909c290d0fb1ca068ffaddf22cbd0",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "fnd_rt_sbx_7c211433f02071597741e6ff5a8ea347",
  "scope": "campaigns:read widgets:embed webhooks:manage",
  "environment": "sandbox"
}
```

---

## 2. Rate Limiting & Quota Display

Every response from `/api/v1/*` includes real-time rate limit and daily quota headers, and developers can inspect their live quota allocation at any time via `GET /api/v1/quota` or on the **Developer Portal (`/developers`)**.

### Quota Tiers

| Tier | Hourly Limit | Daily Quota | Burst Limit | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Developer Free (`free`)** | 100 req / hr | 1,000 req / day | 20 req / min | Default tier for development and sandbox integrations |
| **Growth Pro (`pro`)** | 1,000 req / hr | 25,000 req / day | 120 req / min | Production partner widgets and campaign feeds |
| **Enterprise (`enterprise`)** | 10,000 req / hr | 250,000 req / day | 600 req / min | Institutional registries and high-frequency indexers |

### Response Headers

| Header | Description |
| :--- | :--- |
| `RateLimit-Limit` | Maximum requests allowed in the rolling 1-hour window |
| `RateLimit-Remaining` | Requests remaining in the current 1-hour window |
| `RateLimit-Reset` | Seconds until the current hourly window resets |
| `X-Quota-Tier` | Active quota tier (`free`, `pro`, `enterprise`) |
| `X-Quota-Limit` | Total daily request allocation |
| `X-Quota-Used` | Requests consumed in the rolling 24-hour window |
| `X-Quota-Remaining` | Remaining requests in the 24-hour quota |
| `X-Quota-Reset` | ISO-8601 timestamp when the daily quota resets |
| `X-API-Environment` | Active execution environment (`sandbox` or `production`) |
| `Retry-After` | Seconds to wait before retrying when `429 Too Many Requests` is returned |

---

## 3. RESTful Endpoint Reference

### Read Campaigns
- **`GET /api/v1/campaigns`** (Scope: `campaigns:read`)
  - Query parameters: `status`, `search`, `creator`, `limit`, `offset`, `environment` (`sandbox` | `production`)
- **`GET /api/v1/campaigns/{id}`** (Scope: `campaigns:read`)
  - Returns campaign metadata, funding percentage, tree count, verified CO₂ sequestration (tonnes), and sponsor count.

### Embed Widgets
- **`GET /api/v1/campaigns/{id}/widget`** (Scope: `widgets:embed`)
  - Query parameters:
    - `theme`: `light` | `dark` | `forest`
    - `format`: `json` (returns `iframeSrc`, `iframeSnippet`, `scriptSnippet`, and impact metrics) or `html` (renders standalone embeddable HTML card)
    - `environment`: `sandbox` | `production`

### Receive & Test Webhooks
- **`GET /api/v1/webhooks`** (Scope: `webhooks:manage`) — List active webhook subscriptions and recent delivery logs.
- **`POST /api/v1/webhooks`** (Scope: `webhooks:manage`) — Register a webhook endpoint for `campaign.created`, `campaign.donation_received`, `campaign.milestone_reached`, `campaign.completed`, `tree_verified`, or `batch_verified`.
- **`DELETE /api/v1/webhooks?id={subscriptionId}`** (Scope: `webhooks:manage`) — Delete a webhook subscription.
- **`POST /api/v1/webhooks/test`** (Scope: `webhooks:manage`) — Dispatch a signed sandbox webhook event and inspect the `X-Fundable-Signature` (`sha256=<hmac>`) header and payload.

---

## 4. Sandbox Environment for Testing

The Public API ships with a deterministic **Sandbox Environment** pre-seeded with sample reforestation campaigns (`sbx-camp-amazon-01`, `sbx-camp-mangrove-02`, `sbx-camp-sahel-03`) and pre-provisioned sandbox OAuth2 credentials:

- **Sandbox Client ID:** `fnd_sbx_client_demo`
- **Sandbox Client Secret:** `fnd_sbx_secret_demo_2026`
- **Reset Sandbox State:** `POST /api/v1/sandbox/reset` restores all sandbox campaigns, clears test webhook subscriptions, and resets sandbox quota counters.

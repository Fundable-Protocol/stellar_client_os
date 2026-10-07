# Campaign Partnership Marketplace (NGOs)

The partnership marketplace lets campaigns find and partner with verified
non-governmental organizations that carry out the on-the-ground work — land
access, planting labor, and independent verification — promised by a campaign.
Only **VERIFIED** NGOs are partner-eligible, so campaign funds land with
organizations that have passed the admin review flow.

This is part of **Issue #887** (backend). It documents the service layer, the
HTTP API, and the data model.

---

## NGO directory & verification

NGOs onboard by registering a profile. The profile starts in `PENDING`
verification and is hidden from the default directory until an admin approves
it.

| Status | Meaning | Partner-eligible |
| :--- | :--- | :--- |
| `PENDING` | Registration received, not yet reviewed | No |
| `VERIFIED` | Passed admin review | Yes |
| `REJECTED` | Failed admin review | No |

A profile carries:

- `id`, `name`, `description`
- `services` — one or more of `LAND_ACCESS`, `PLANTING_LABOR`, `VERIFICATION`
- `country`, `website`
- `verificationStatus`, `isVerified`, `reviewedBy`, `reviewedAt`

### Discovery

`GET /api/ngos` lists the directory, newest first. Filters:

| Query | Description |
| :--- | :--- |
| `q` | Free-text search over name and description |
| `service` | Only NGOs offering this service (`LAND_ACCESS` \| `PLANTING_LABOR` \| `VERIFICATION`) |
| `country` | Case-insensitive country filter |
| `status` | `VERIFIED` (default) \| `PENDING` \| `REJECTED` \| `ALL` |

`GET /api/ngos/{id}` returns a single profile.

### Registration & review

`POST /api/ngos` registers a profile (returns `201` with a `PENDING` profile).
Registration body: `name`, `description`, `services[]`, optional `country`,
`website`, `submitterWallet`. Invalid service values or an empty service list
are rejected with `400`.

`PATCH /api/ngos/{id}` (admin only, `Authorization: Bearer <ADMIN_API_KEY>`)
applies a review verdict: `{ "verdict": "VERIFIED" | "REJECTED" }`. The verdict
sets `verificationStatus`, `isVerified`, and records `reviewedBy`/`reviewedAt`.

---

## Partnership requests

A campaign proposes a partnership with an NGO by requesting one or more
services. The NGO (or either side, via the status endpoint) advances the
request through a fixed lifecycle:

| From | Allowed transitions |
| :--- | :--- |
| `PENDING` | `ACCEPTED`, `REJECTED`, `CANCELED` |
| `ACCEPTED` | `COMPLETED`, `CANCELED` |
| `REJECTED` / `COMPLETED` / `CANCELED` | — (terminal) |

### Endpoints

- `GET /api/campaigns/{id}/partnerships` — list a campaign's requests,
  optionally filtered by `?status=`.
- `POST /api/campaigns/{id}/partnerships` — create a request. Body:
  `{ "ngoId", "servicesRequested": [...], "proposedTerms"? }`. The request is
  created in `PENDING` with `initiatedBy` set to the campaign creator.
- `GET /api/campaigns/{id}/partnerships/{requestId}` — fetch one request. A
  request belonging to another campaign is treated as not found (`404`).
- `PATCH /api/campaigns/{id}/partnerships/{requestId}` — advance status. Body:
  `{ "status": "...", "updatedBy"? }`.

### Creation rules

`POST /api/campaigns/{id}/partnerships` enforces:

- The campaign and NGO must exist (`404`).
- The NGO must be **VERIFIED** (`409 NGO_NOT_VERIFIED`).
- The NGO must offer **every** requested service (`400 SERVICE_NOT_OFFERED`).
- The body is validated with zod (`400` for bad enums / empty service lists).
- Only **one active request** may exist between a given campaign and NGO
  (`409 DUPLICATE_ACTIVE_PARTNERSHIP`). "Active" means the most recent request
  is `PENDING` or `ACCEPTED`; once it reaches a terminal status
  (`REJECTED`/`COMPLETED`/`CANCELED`), a fresh request may be created.

### Error responses

Errors are returned as `{ "error": "<message>", "code": "<CODE>" }` with an
HTTP status mapped from the code (e.g. `409` for `INVALID_TRANSITION`).

---

## Data model

Migrations are in `migrations/007_campaign_ngos.sql`:

- `ngos` — directory profiles with `verification_status` check constraint.
- `campaign_partnerships` — requests keyed by `campaign_id` + `ngo_id` with a
  `status` check constraint and GIN index on `services_requested`.

The runtime implementation is **in-memory** (`InMemoryPartnershipDataSource`
in `apps/web/src/services/campaign-partnership.service.ts`), sharing the
injectable-data-source pattern used by `campaign.service.ts`, so tests swap in
a fresh seeded store per case. The SQL schema is the target for a later
persistence migration.

---

## OpenAPI

All four endpoints and their schemas are documented in
`docs/openapi.yaml` under the `NGOS` and `Campaign partnerships` tags.
---
"@fundable/web": minor
---

feat(backend): campaign partnership marketplace — connect with NGOs (#887)

Campaigns can now partner with verified NGOs to carry out on-the-ground work
(land access, planting labor, and independent verification):

- NGO directory with admin review flow. NGOs register via `POST /api/ngos` and
  start in `PENDING`; an admin approves or rejects them with
  `PATCH /api/ngos/{id}` (`{ verdict: "VERIFIED" | "REJECTED" }`). Only
  `VERIFIED` NGOs are partner-eligible.
- Searchable directory at `GET /api/ngos` with `q`, `service`, `country`, and
  `status` filters (verified-only by default) and a profile endpoint at
  `GET /api/ngos/{id}`.
- Partnership request lifecycle under `/api/campaigns/{id}/partnerships`
  (list/create) and `/api/campaigns/{id}/partnerships/{requestId}`
  (fetch/update status): `PENDING -> ACCEPTED | REJECTED | CANCELED` and
  `ACCEPTED -> COMPLETED | CANCELED`, with zod-validated bodies, typed error
  codes, and a guard against duplicate active requests between the same
  campaign and NGO.
- Backed by the injectable in-memory `campaign-partnership.service` (seeded
  store pattern like `campaign.service`), with service and route test suites,
  a SQL schema in `migrations/007_campaign_ngos.sql`, OpenAPI documentation,
  and this changelog.
# Campaign verification transparency

## Immutable audit trail

`GET /api/campaigns/:id/verification` returns the append-only verification log. `POST` accepts `submitted_for_review`, `verifier_comment`, `photo_uploaded`, `approved`, and `rejected` events. Each entry contains the actor, timestamp, optional comment/evidence reference, a SHA-256 `entryHash`, `previousHash`, and a `blockchainTxHash` anchor. Production indexers should provide the Soroban transaction hash and ledger sequence; development-only entries use a `pending:` anchor.

## Evidence

After a photo or video has been uploaded using `/api/presign-upload`, publish its metadata with `POST /api/campaigns/:id/verification/evidence`:

```json
{
  "id": "evidence-42",
  "type": "photo",
  "url": "https://cdn.example/evidence-42.jpg",
  "capturedAt": 1780000000000,
  "latitude": -1.2921,
  "longitude": 36.8219,
  "verifierId": "GVERIFIER",
  "caption": "Plot 7 after planting"
}
```

The campaign detail page renders published evidence with timestamp, coordinates, and verifier identity.

## Export

`GET /api/campaigns/:id/export?format=csv&report=full` downloads sponsor, impact, GPS, CO2, and status timeline data. Use `format=json` for a structured export containing sponsors, campaign impact, timeline, verification audit trail, and evidence.

## Webhooks

Subscribe to `tree_verified`, `batch_verified`, `campaign_milestone_reached`, and `campaign_completed` in addition to existing event types. Payloads use the existing signed, retrying, idempotent delivery mechanism. Include a stable `eventId` (or `verificationId`) in every event so consumers can safely retry.

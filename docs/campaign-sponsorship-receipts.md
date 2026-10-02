# Campaign sponsorship receipts

A sponsorship receipt records what a sponsor paid for in a campaign — tree
count, species, planting location, and the expected CO2 sequestration — plus a
commitment that ties those claims to a Stellar transaction. Verification is a
pure read: recompute the commitment from the receipt and check it against the
transaction on Horizon. Nothing is stored, because the receipt is its own proof.

* Issuing and verification calls: [`apps/web/src/app/api/campaigns/[id]/sponsorship-receipt/route.ts`](../apps/web/src/app/api/campaigns/[id]/sponsorship-receipt/route.ts)
* Receipt format and checks: [`apps/web/src/lib/sponsorship-receipt.ts`](../apps/web/src/lib/sponsorship-receipt.ts)
* Issuing and Horizon lookup: [`apps/web/src/services/campaign-sponsorship-receipt.service.ts`](../apps/web/src/services/campaign-sponsorship-receipt.service.ts)
* CO2 model reused by the receipt: [`apps/web/src/lib/co2-impact.ts`](../apps/web/src/lib/co2-impact.ts)

## The commitment

The receipt body is the claimed sponsorship plus the projected sequestration:

```
version, campaignId, sponsorAddress, treeCount, species, plantingLocation,
plantedAt, currency, amount, co2
```

Its keys are sorted recursively and serialized as compact JSON
(`canonicalizeReceiptBody`), then hashed with SHA-256. `receiptHash` is that
digest as 64 lowercase hex characters, and `receiptId` is `rcpt_` plus its first
16 characters (a short handle, small enough for a Stellar text memo).

Two consequences worth knowing:

* **The commitment is reproducible.** The same sponsorship always produces the
  same hash, on any machine, because the body is canonical and `plantedAt` is a
  plain `YYYY-MM-DD` date rather than a timestamp.
* **The planting date is part of it.** The CO2 model applies a 2x rainy-season
  multiplier (May–October), so the date changes `co2` and therefore the hash.

`speciesId` must be one of the species in `co2-impact.ts` (`oak`, `maple`,
`pine`, `teak`, `eucalyptus`, `mango`, `neem`, `cedar`), `sponsorAddress` must
be a Stellar public key, and `treeCount` must be a whole number greater than
zero. Anything else is rejected before a receipt is built.

## Issuing a receipt — `POST /api/campaigns/{id}/sponsorship-receipt`

```bash
curl -X POST https://api.fundable.network/api/campaigns/camp-101/sponsorship-receipt \
  -H 'Content-Type: application/json' \
  -d '{
    "sponsorAddress": "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW",
    "treeCount": 100,
    "speciesId": "oak",
    "plantingLocation": { "country": "Kenya", "region": "Nyeri", "latitude": -0.42, "longitude": 36.95 },
    "plantedAt": "2026-06-15",
    "currency": "XLM",
    "amount": "250"
  }'
```

`201 Created`:

```json
{
  "success": true,
  "receipt": {
    "version": 1,
    "campaignId": "camp-101",
    "sponsorAddress": "GD6B...NJUW",
    "treeCount": 100,
    "species": { "id": "oak", "label": "Oak", "co2PerTreePerYearKg": 21 },
    "plantingLocation": { "country": "Kenya", "region": "Nyeri", "latitude": -0.42, "longitude": 36.95 },
    "plantedAt": "2026-06-15",
    "currency": "XLM",
    "amount": "250",
    "co2": { "perYearKg": 4200, "over10YearsKg": 42000, "over10YearsTonnes": 42 },
    "receiptHash": "9f2c...c1ab",
    "receiptId": "rcpt_9f2c0a1b2c3d4e5f"
  },
  "memo": { "type": "hash", "memoHex": "9f2c...c1ab", "byteLength": 32 },
  "verification": {
    "method": "PUT",
    "endpoint": "/api/campaigns/camp-101/sponsorship-receipt",
    "body": ["receipt", "transactionHash"],
    "acceptedMemoTypes": ["hash", "text"]
  }
}
```

The campaign comes from the URL. A `campaignId` in the body is accepted only if
it matches, so a receipt can never be issued under a campaign the request did
not name. `currency` and `amount` are optional and are hashed as given — omitting
them produces a different commitment from sending `null`.

### Attaching the commitment on chain

The sponsor's payment transaction must carry the commitment, so the receipt can
be tied to the payment that produced it. Two memo types are accepted:

| Memo | Value | Notes |
| --- | --- | --- |
| `hash` (canonical) | the 32-byte commitment — `Memo.hash(Buffer.from(receipt.receiptHash, "hex"))` | Commits to the full digest. Horizon returns it base64-encoded; both forms verify. |
| `text` | `receipt.receiptId` (`rcpt_` + 16 hex characters) | Convenience for wallets that cannot set a hash memo. Commits to only the first 8 bytes of the digest. |

## Verifying a receipt — `PUT /api/campaigns/{id}/sponsorship-receipt`

```bash
curl -X PUT https://api.fundable.network/api/campaigns/camp-101/sponsorship-receipt \
  -H 'Content-Type: application/json' \
  -d '{"receipt": { ...the receipt... }, "transactionHash": "b7f1...9e02"}'
```

`receipt` may be the receipt object or its JSON string, which is what a scanned
QR code yields. The response reports every check it made:

```json
{
  "success": true,
  "campaignId": "camp-101",
  "verified": true,
  "status": "verified",
  "receiptId": "rcpt_9f2c0a1b2c3d4e5f",
  "receiptHash": "9f2c...c1ab",
  "transactionHash": "b7f1...9e02",
  "checks": {
    "transactionFound": true,
    "receiptHashMatchesContent": true,
    "transactionSuccessful": true,
    "memoTypeSupported": true,
    "memoMatchesReceipt": true
  },
  "reason": null,
  "transaction": {
    "hash": "b7f1...9e02",
    "successful": true,
    "memoType": "hash",
    "memo": "nywB...qQ==",
    "sourceAccount": "GD6B...NJUW",
    "ledger": 1234567,
    "createdAt": "2026-06-16T00:00:00Z"
  }
}
```

`verified` is true only when all five checks pass. The first failing check
decides `status`:

| `status` | `verified` | Meaning |
| --- | --- | --- |
| `verified` | `true` | The receipt is intact and the transaction carries its commitment. |
| `receipt_mismatch` | `false` | The receipt's fields no longer hash to the `receiptHash` it carries — it was edited after issue. |
| `not_found` | `false` | No transaction with that hash on this network. |
| `transaction_failed` | `false` | The transaction exists but did not succeed. |
| `unsupported_memo` | `false` | The transaction carries an `id`, `return`, or `none` memo, which cannot carry a commitment. |
| `memo_mismatch` | `false` | The transaction's memo commits to something else. |

Verification outcomes are reported rather than thrown: a receipt that fails a
check is a valid answer to "is this receipt real?", so it is a `200` with
`verified: false` and a human-readable `reason`. The endpoint only uses other
statuses for problems the caller can act on:

| Status | When |
| --- | --- |
| `400` | Unparseable body, a payload that cannot describe a sponsorship, a `transactionHash` that is not a hash, or a receipt belonging to another campaign. |
| `500` | Issuing failed unexpectedly. |
| `502` | The Horizon lookup itself failed — a network problem, reported as such rather than as a missing transaction. |

## Horizon configuration

Verification reads `NEXT_PUBLIC_STELLAR_HORIZON_URL` and falls back to
`https://horizon-testnet.stellar.org`, matching `apps/web/src/lib/env.ts`. A 404
from Horizon resolves to "not found"; any other failure is rethrown so a
transient outage can never be reported as a missing transaction.

## Tests

```bash
pnpm --filter @fundable/web test
```

* `apps/web/src/lib/__tests__/sponsorship-receipt.test.ts` — commitment
  stability and canonicalization, every validation rule, the rainy-season
  multiplier, memo encoding (hex and base64), tamper detection, and each
  verification status.
* `apps/web/src/services/campaign-sponsorship-receipt.service.test.ts` — memo
  and endpoint hints, the Horizon record mapping, 404 vs. failed lookup, and the
  configured Horizon URL.
* `apps/web/src/app/api/campaigns/[id]/sponsorship-receipt/route.test.ts` —
  both handlers end to end, including the campaign-id mismatch, malformed
  payloads, and the `502` path.

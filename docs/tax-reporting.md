# Tax Document Generation — issue #792

The Fundable Protocol auto-generates tax documents for campaign creators based
on the funding they received in a given tax year. Creators receive documents
matching their tax jurisdiction:

| Jurisdiction | Document type | Notes |
| ------------ | ------------- | ----- |
| **US** | `us-1099-nec` | IRS 1099-NEC — Nonemployee compensation |
| **EU** | `eu-vat-oss` | EU VAT OSS annual summary |
| **Other** | `earnings-statement` | Generic annual earnings statement |

## How earnings are computed

"Funding received" is derived from the platform's campaign sponsorship ledger:
every sponsor payment a creator earned on **their campaigns** in the tax year
(UTC calendar year) is summed in integer USDC units and rendered as a
two-decimal amount (e.g. `3500` → `"3500.00"`).

Because a creator's exact tax attributes (legal name, EIN/VAT ID, residence) are
KYC data collected at onboarding, the endpoints take the identifier/name
optionally and default to the wallet address — production deployments should
source these fields from the verified creator profile.

## API Endpoints

### `POST /api/tax/generate-1099`

Compiles gross annual earnings for a campaign creator (fee/revenue "received")
in 1099-ready form.

#### Request Body
```json
{
  "creatorId": "GAAA...",
  "taxYear": 2025
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "creatorId": "GAAA...",
    "taxYear": 2025,
    "grossEarningsUSDC": "3500.00",
    "totalTransactions": 2,
    "transactions": [
      { "amount": "1000", "timestamp": 1740825600000, "reference": "campaign-a:s1" }
    ],
    "generatedAt": "2026-03-30T12:00:00.000Z"
  },
  "message": "IRS 1099-NEC data compiled successfully for tax year 2025."
}
```

### `POST /api/tax/documents`

Auto-generates the actual tax document as a PDF.

#### Request Body
```json
{
  "creatorId": "GAAA...",
  "taxYear": 2025,
  "jurisdiction": "US",
  "creatorName": "Ada Lovelace",
  "taxId": "12-3456789"
}
```

- `jurisdiction`: `"US"` | `"EU"` | `"OTHER"` (optional — selects the document
  type; defaults to `us-1099-nec` when omitted).
- `documentType`: `"us-1099-nec"` | `"eu-vat-oss"` | `"earnings-statement"`
  (optional — takes precedence over `jurisdiction`; unsupported values → `400`).
- `creatorName` / `taxId`: optional fields stamped onto the document.

#### Response (`200 OK`)
`application/pdf`, streamed with `Content-Disposition: attachment;
filename="tax-us-1099-nec-2025-GAAA...pdf"`.

## SDK support

`@fundable/sdk` exposes the same logic in the `tax` module for clients that
compile their own reports:

- `computeAnnualEarnings(transactions, taxYear)` — sum + count within the year
- `selectTaxForm(jurisdiction)` — jurisdiction → document type
- `TaxReportingSDK.getAnnualEarnings(params, transactions)` — 1099-ready record
  (reports zeros when no transactions are supplied, instead of fabricating data)

## Notes

- VAT obligations depend both on the supplier's and the customer's member
  state; the generated EU summary reflects platform-measured funding and must
  be reviewed by the creator's accountant before filing.
- Documents generated here are informational and do not replace the statutory
  copies (e.g. Copy A) that must be filed with the relevant authority.
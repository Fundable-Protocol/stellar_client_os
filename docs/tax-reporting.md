# Tax Document Generation — issue #792

## Annual creator and backer compliance report — issue #1351

Wallet owners can download an annual transaction summary from **Settings →
Tax reports** in CSV or PDF format. Choose the calendar tax year and whether
the report is for creator activity or backer pledges. The export includes
recorded campaign, UTC date, transaction hash when available, token amount,
counterparty, and annual gross totals grouped by token.

The report uses the campaign sponsorship records and associated backer
contributions currently held by the platform. The ledger does not currently
record historical USD exchange rates, platform-fee amounts, milestone payouts,
or reward fulfillment. Those values are identified as not recorded in the
report; they are never estimated. Backer reward status is also unclassified
when fulfillment data is unavailable. Reports are informational and do not
constitute tax advice.

`GET /api/tax/compliance-report?wallet=G...&year=2025&role=backer&format=csv`
returns the CSV; use `format=pdf` for the formatted PDF. The `role` parameter
accepts `creator` or `backer`.

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

## Campaign nonprofit contribution acknowledgments

Campaign creation may include a `nonprofitPartner` object with `legalName`,
`registrationNumber`, and `country`. New partner records start with
`verificationStatus: "PENDING"`; a trusted partner-verification workflow must
mark the campaign partner `VERIFIED` before certificates can be issued. The
verification status must not be accepted from public campaign-creation input.

`GET /api/campaigns/{campaignId}/tax-certificate?sponsorAddress=G...&taxYear=2025`
streams a PDF acknowledgment for the sponsor's campaign ledger contributions
recorded during that UTC tax year. Amounts are grouped by token rather than
combined across different tokens. The request returns `403` for campaigns
without a verified nonprofit partner and `404` when the sponsor has no matching
contributions.

The acknowledgment reports platform-recorded contribution amounts. Tax
deductibility depends on applicable law and any goods or services received;
issuance does not guarantee that an amount is deductible.

## Notes

- VAT obligations depend both on the supplier's and the customer's member
  state; the generated EU summary reflects platform-measured funding and must
  be reviewed by the creator's accountant before filing.
- Documents generated here are informational and do not replace the statutory
  copies (e.g. Copy A) that must be filed with the relevant authority.
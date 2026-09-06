---
"@fundable/sdk": minor
---

Add tax reporting helpers (issue #792): `computeAnnualEarnings` (BigInt annual sums with UTC tax-year filtering), `selectTaxForm` (jurisdiction → form type), `formatUsdcFromInteger`, and `TaxReportingSDK.getAnnualEarnings` which now compiles real earnings from supplied transactions instead of fabricating placeholder data.
# IRS 1099 Tax Reporting System

The Fundable Protocol includes a tax reporting utility designed to track annual platform revenue earned by campaign creators and format the data for IRS 1099-NEC / 1099-MISC compliance.

## API Endpoint

### `POST /api/tax/generate-1099`

Calculates gross annual earnings for a given campaign creator.

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
    "grossEarningsUSDC": "12500.00",
    "totalTransactions": 42,
    "generatedAt": "2026-03-30T12:00:00.000Z"
  },
  "message": "IRS 1099-NEC data compiled successfully for tax year 2025."
}
```

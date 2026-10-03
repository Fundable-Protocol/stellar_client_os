# Campaign growth controls (v1)

This document covers issues #937, #943, #944, and #945.

## Milestone feature rewards

`GET /api/campaigns/:id/features` returns cumulative feature entitlements based on the campaign's `treeCount`:

| Tree count | Unlocked feature |
| ---: | --- |
| 1,000 | Custom branding |
| 5,000 | White-label option |
| 10,000 | API access |

The endpoint also returns the campaign's seasonal carbon-credit incentive and resolved API funding tier.

## Seasonal carbon credits

The multiplier is fixed when the campaign is created:

- April (Earth Month, including Arbor Day): **1.5x**
- May–October by default (configurable through `RAINY_SEASON_MONTHS`): **2x**
- Other months: **1x**

The value is persisted as `carbonCreditMultiplier` with a `seasonalIncentive` reason, so reporting remains stable after creation.

## Fraud anomaly detection

`POST /api/campaigns/:id/fraud-check` accepts optional `treeCount`, `targetTrees`, `campaignDurationDays`, `verifications`, `location`, and enriched sponsor samples. v1 detects:

- unrealistic tree counts relative to duration or target;
- repeated verifier identities or verification totals exceeding the claim;
- bot-like sponsors (failed verification, very young accounts, repeated user agents);
- sponsor location mismatch;
- existing rapid-pledge, IP-clustering, and circular-transaction signals.

Scores at or above 80 are auto-suspended, while lower signals are retained for review.

## Campaign API rate limits

Campaign detail and feature endpoints use a Redis sliding window keyed by caller and campaign:

| Funding goal (smallest token units) | Tier | Limit |
| ---: | --- | ---: |
| `< 10,000` | Basic | 100 requests/hour |
| `10,000–99,999` | Pro | 1,000 requests/hour |
| `>= 100,000` | Enterprise | 10,000 requests/hour |

An explicit `fundingTier` on a campaign overrides goal-based resolution. Standard `RateLimit-*` and `X-RateLimit-*` headers are returned, and Redis outages retain the existing fail-open behavior.

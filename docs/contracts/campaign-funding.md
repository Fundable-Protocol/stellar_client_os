# Campaign funding: sponsor refunds and matching funds

## Funding model

Every campaign has an immutable `funding_model` field set at creation time.

| Model | Value | Behaviour |
|---|---|---|
| **All-or-Nothing** | `AllOrNothing` | Contributions are held in escrow. `trigger_expiry` marks the campaign `Failed` if `total_raised < min_target` at the deadline — all escrowed tokens become refundable via `refund`. If `total_raised >= min_target` the campaign is marked `Successful` and proceeds normally. |
| **Keep-What-You-Raise** | `KeepWhatYouRaise` | `trigger_expiry` always marks the campaign `Successful` regardless of how much was raised. The creator may call `claim_funds` immediately without waiting for tree-verification. No automatic refunds are issued. |

### Choosing a model

Creators select the model in the campaign creation wizard (Goals step). The choice is immutable after creation.

### On-chain events

- `CampaignCreatedEvent` — includes `funding_model` so indexers can filter by model from creation.
- `FundingModelSelectedEvent` — dedicated event emitted at creation with topic `FundingModelSelected`, for lightweight listeners that only care about this field.

### SDK

```ts
import { CampaignFundingClient, type FundingModel } from "@fundable/sdk";

const tx = await client.createCampaign({
  creator: "G...",
  token: "C...",
  target_amount: 100_000_000n,
  min_target:    50_000_000n,
  deadline:      BigInt(Math.floor(Date.now() / 1000) + 30 * 86_400),
  funding_model: { tag: "AllOrNothing" },   // or { tag: "KeepWhatYouRaise" }
});
```

The `Campaign` interface returned by `getCampaign` now includes a `funding_model` property of type `FundingModel`.

---

## Gross contribution refunds

The `Contribution(campaign_id, contributor)` record represents the sponsor's **gross contribution**: the exact amount transferred from the sponsor into campaign escrow. The contract also preserves that value in `OriginalContribution` so future fee accounting cannot accidentally reduce a refund. `refund` and `claim_insurance_refund` return the gross amount and remove both records before transferring funds, preventing double refunds while preserving the sponsor's original contribution.

Protocol fees are applied only during `claim_funds` after a campaign succeeds. They reduce the creator's net payout and are sent to the fee collector; they do not reduce a sponsor's refundable contribution on a failed campaign.

## Admin matching funds

The admin may call `add_matching_funds(campaign_id, amount, cap)` to deposit matching tokens and configure a campaign matching cap. Each subsequent contribution receives dollar-for-dollar matching up to the remaining campaign target, the configured cap, and the deposited matching balance. Matching is held by the campaign contract, and `get_matching_funds` exposes the configured and used amounts for auditing.

Sponsor accounting remains separate from matching accounting. `get_contribution` reports the sponsor's gross contribution only, while `Campaign.total_raised` includes both sponsor and matched amounts. The matching balance is decremented atomically with each matched contribution, so the contract can never promise more matching tokens than it actually holds.

The sponsor flow is exposed at `/campaigns/:id/sponsor` in the web app. It deliberately separates tree selection, amount entry, preview, and wallet confirmation so a sponsor can review the gross amount before signing the contribution transaction.

The `Contribution(campaign_id, contributor)` record represents the sponsor’s **gross contribution**: the exact amount transferred from the sponsor into campaign escrow. The contract also preserves that value in `OriginalContribution` so future fee accounting cannot accidentally reduce a refund. `refund` and `claim_insurance_refund` return the gross amount and remove both records before transferring funds, preventing double refunds while preserving the sponsor’s original contribution.

Protocol fees are applied only during `claim_funds` after a campaign succeeds. They reduce the creator’s net payout and are sent to the fee collector; they do not reduce a sponsor’s refundable contribution on a failed campaign.

## Admin matching funds

The admin may call `add_matching_funds(campaign_id, amount, cap)` to deposit matching tokens and configure a campaign matching cap. Each subsequent contribution receives dollar-for-dollar matching up to the remaining campaign target, the configured cap, and the deposited matching balance. Matching is held by the campaign contract, and `get_matching_funds` exposes the configured and used amounts for auditing.

Sponsor accounting remains separate from matching accounting. `get_contribution` reports the sponsor’s gross contribution only, while `Campaign.total_raised` includes both sponsor and matched amounts. The matching balance is decremented atomically with each matched contribution, so the contract can never promise more matching tokens than it actually holds.

The sponsor flow is exposed at `/campaigns/:id/sponsor` in the web app. It deliberately separates tree selection, amount entry, preview, and wallet confirmation so a sponsor can review the gross amount before signing the contribution transaction.

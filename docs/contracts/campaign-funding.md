# Campaign funding: sponsor refunds and matching funds

## Gross contribution refunds

The `Contribution(campaign_id, contributor)` record represents the sponsor’s **gross contribution**: the exact amount transferred from the sponsor into campaign escrow. The contract also preserves that value in `OriginalContribution` so future fee accounting cannot accidentally reduce a refund. `refund` and `claim_insurance_refund` return the gross amount and remove both records before transferring funds, preventing double refunds while preserving the sponsor’s original contribution.

Protocol fees are applied only during `claim_funds` after a campaign succeeds. They reduce the creator’s net payout and are sent to the fee collector; they do not reduce a sponsor’s refundable contribution on a failed campaign.

## Admin matching funds

The admin may call `add_matching_funds(campaign_id, amount, cap)` to deposit matching tokens and configure a campaign matching cap. Each subsequent contribution receives dollar-for-dollar matching up to the remaining campaign target, the configured cap, and the deposited matching balance. Matching is held by the campaign contract, and `get_matching_funds` exposes the configured and used amounts for auditing.

Sponsor accounting remains separate from matching accounting. `get_contribution` reports the sponsor’s gross contribution only, while `Campaign.total_raised` includes both sponsor and matched amounts. The matching balance is decremented atomically with each matched contribution, so the contract can never promise more matching tokens than it actually holds.

The sponsor flow is exposed at `/campaigns/:id/sponsor` in the web app. It deliberately separates tree selection, amount entry, preview, and wallet confirmation so a sponsor can review the gross amount before signing the contribution transaction.

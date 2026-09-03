# Campaign Guide

This guide covers the full lifecycle of a Fundable campaign: creation, sponsorship, tree-verification, and payouts. It is aimed at campaign creators and sponsors who want to understand what happens on-chain at each step.

---

## Table of Contents

1. [Overview](#overview)
2. [Campaign Creation](#campaign-creation)
3. [Sponsorship Mechanics](#sponsorship-mechanics)
4. [Verification Process](#verification-process)
5. [Payouts](#payouts)
6. [Error Reference](#error-reference)

---

## Overview

A Fundable campaign lets a creator raise tokens from sponsors to fund a real-world tree-planting effort. The contract enforces every financial rule — escrow, fees, insurance, milestones, refunds, and payouts — with no trusted intermediary.

The lifecycle looks like this:

```
create_campaign  →  contribute (×N)  →  trigger_expiry
                                              │
                             ┌────────────────┴────────────────┐
                             ▼                                 ▼
                         Successful                         Failed
                             │                                 │
                        claim_funds                         refund (×N)
                             │
                    mark_trees_died (optional)
                             │
                   claim_insurance_refund (×N)
```

---

## Campaign Creation

### What the creator provides

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `Address` | Stellar asset contract to accept (e.g. USDC) |
| `target_amount` | `i128` | Hard cap — contributions close when this is reached |
| `min_target` | `i128` | Minimum raise required for success (`0 < min_target ≤ target_amount`) |
| `deadline` | `u64` | Unix timestamp after which no new contributions are accepted (max 180 days from now) |
| `insurance_fee` | `i128` | Upfront premium the creator pays into the insurance pool |

### What happens on-chain

1. The creator's `insurance_fee` is transferred from their wallet into the contract's insurance pool immediately.
2. A `Campaign` record is stored with status `Active` and a unique numeric ID (starts at 1, increments by 1).
3. A `CampaignCreated` event is emitted.

### Constraints

- `target_amount` must be positive.
- `min_target` must satisfy `0 < min_target ≤ target_amount`.
- `deadline` must be in the future and no more than 180 days away.
- `insurance_fee` must be positive. It is non-refundable even if the campaign fails.

### SDK example

```typescript
import { CampaignFundingClient } from '@fundable/sdk';

const client = new CampaignFundingClient({ /* config */ });

const campaignId = await client.createCampaign({
  creator:       'GAAA...',
  token:         'CDDD...',   // USDC contract address
  targetAmount:  10_000_000n, // 1,000 USDC (7 decimals)
  minTarget:      5_000_000n, // 500 USDC minimum
  deadline:      BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), // 30 days
  insuranceFee:    100_000n,  // 10 USDC premium
});
```

### Team rewards (optional)

Before any funds are claimed the creator can configure how proceeds are split among co-creators:

```typescript
await client.setTeamRewards({
  campaignId,
  team: [
    { address: 'GAAA...', percentageBps: 6000 }, // 60 %
    { address: 'GBBB...', percentageBps: 4000 }, // 40 %
  ],
});
```

Percentages are in basis points and must sum exactly to `10_000` (100 %). This can only be called while the campaign is `Active`.

---

## Sponsorship Mechanics

### Contributing

Any wallet can contribute to an `Active` campaign before its deadline:

```typescript
await client.contribute({
  contributor: 'GBBB...',
  campaignId,
  amount: 1_000_000n, // 100 USDC
});
```

The full amount is held in contract escrow immediately. Multiple contributions from the same wallet accumulate.

### Hard cap enforcement

If a contribution would push `total_raised` above `target_amount` the transaction is rejected with `TargetExceeded`. The campaign auto-transitions to `Successful` the moment `total_raised == target_amount`.

### Funding milestones

Every time contributions cross 25 %, 50 %, 75 %, or 100 % of `target_amount` the contract emits a `MilestoneReached` event. Each milestone fires exactly once. Frontends can subscribe to these to show a live progress bar or trigger notifications.

| Milestone | Condition |
|-----------|-----------|
| 25 % | `total_raised * 100 ≥ target_amount * 25` |
| 50 % | `total_raised * 100 ≥ target_amount * 50` |
| 75 % | `total_raised * 100 ≥ target_amount * 75` |
| 100 % | `total_raised == target_amount` |

### Triggering expiry

Once `deadline` has passed, anyone (creator, sponsor, or bot) can call `trigger_expiry`:

```typescript
await client.triggerExpiry({ campaignId });
```

- `total_raised ≥ min_target` → status becomes `Successful`
- `total_raised < min_target` → status becomes `Failed`, all contributions become refundable

This function is permissionless by design — sponsors are never dependent on the creator to unlock their refunds.

### Refunds (failed campaigns)

Each sponsor calls `refund` individually to recover their exact contribution. There are no fees on refunds.

```typescript
await client.refund({ contributor: 'GBBB...', campaignId });
```

The contribution record is cleared before the transfer (check-effects-interactions) so double-refunds are impossible.

---

## Verification Process

After a campaign is claimed, Fundable's admin team verifies that the trees were planted. This step determines whether sponsors receive reward streams or insurance refunds.

### Normal outcome — trees alive

No on-chain action is required. Sponsors receive their rewards via the streaming contract (see [Payouts](#payouts)).

### Failed outcome — trees died

The admin calls `mark_trees_died`:

```
mark_trees_died(campaign_id)   [admin only]
```

This transitions the campaign from `Claimed` to `VerificationFailed`. Sponsors can then claim a full refund from the insurance pool that was funded by the creator's upfront premium:

```typescript
await client.claimInsuranceRefund({ campaignId, contributor: 'GBBB...' });
```

Each sponsor recovers their original contribution amount from the pool. The contribution record is cleared before transfer to prevent double-claims.

> **Note:** The insurance pool covers sponsors' contributions, not the creator's fee. The creator's `insurance_fee` is what funds the pool; it is consumed when claims are paid out.

---

## Payouts

### Creator payout (`claim_funds`)

Only the campaign creator can call this, and only when status is `Successful`:

```typescript
await client.claimFunds({ campaignId });
```

The payout calculation is:

```
gross          = total_raised
protocol_fee   = ceil(gross × fee_rate / 10_000)   ← rounded up
after_fee      = gross - protocol_fee
reserve        = ceil(after_fee × 10% )             ← rounded up, held for tree replacement
distributable  = after_fee - reserve
```

The `distributable` amount is sent to the creator (or split among team members if `set_team_rewards` was called). The reserve stays in the contract and is available for dead-tree replacement costs.

**Events emitted:**
- `ProtocolFeeCollected` — records the fee amount and collector address
- `ReserveAllocated` — records the 10 % reserve amount
- `FundsClaimed` — records the net distributable amount
- `TeamPayoutIssued` — one per team member (if team rewards are configured)

### Sponsor reward streams

After the creator has claimed, anyone can initiate a 12-month linear reward stream for a given sponsor:

```typescript
await client.streamSponsorRewards({ campaignId, contributor: 'GBBB...' });
```

This creates a stream via the payment-stream contract. The sponsor's escrowed contribution amount vests linearly over 12 months from the moment the stream is created. The sponsor withdraws from the stream on their own schedule using the payment-stream contract's `withdraw` function.

A `SponsorRewardStreamed` event is emitted and the stream is marked so it cannot be created twice for the same sponsor.

### Fee tiers (payment-stream withdrawals)

When a sponsor withdraws from their reward stream, a protocol fee is deducted based on the sender's cumulative volume across all streams:

| Cumulative volume | Fee rate |
|-------------------|----------|
| < 50,000 | 5.00 % (500 bps) |
| 50,000 – 499,999 | 2.50 % (250 bps) |
| ≥ 500,000 | 1.00 % (100 bps) |

---

## Error Reference

| Code | Name | Meaning |
|------|------|---------|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `NotInitialized` | Contract used before `initialize` |
| 3 | `Unauthorized` | Caller lacks permission |
| 4 | `InvalidAmount` | Zero or negative amount |
| 5 | `InvalidDeadline` | Deadline is in the past |
| 6 | `InvalidTarget` | `min_target` out of `(0, target_amount]` |
| 7 | `CampaignNotFound` | No campaign with this ID |
| 8 | `CampaignNotActive` | Operation requires `Active` status |
| 9 | `DeadlineNotReached` | `trigger_expiry` called too early |
| 10 | `CampaignNotFailed` | `refund` requires `Failed` status |
| 11 | `CampaignNotSuccessful` | `claim_funds` requires `Successful` status |
| 12 | `NoContributionFound` | Caller has no contribution to refund |
| 13 | `AlreadyClaimed` | Funds already claimed |
| 14 | `FeeTooHigh` | Fee rate exceeds 500 bps (5 %) |
| 15 | `ArithmeticOverflow` | Internal overflow guard triggered |
| 16 | `TargetExceeded` | Contribution would exceed hard cap |
| 17 | `DeadlineTooFar` | Deadline exceeds 180-day maximum |
| 18 | `CampaignNotVerificationFailed` | Insurance refund requires `VerificationFailed` status |
| 19 | `InsuranceFeeTooHigh` | Insurance fee rate exceeds protocol maximum |
| 20 | `TeamEmpty` | `set_team_rewards` called with empty team |
| 21 | `TeamInvalidSplit` | Team percentages do not sum to 10,000 bps |
| 22 | `TeamDuplicateMember` | Same address appears twice in team |
| 23 | `ContractFull` | Campaign ID space exhausted |

# Campaign State Machine Documentation

This document provides comprehensive documentation for all valid campaign states and their transitions in the Fundable platform.

## Campaign States

The Fundable platform defines six distinct states that a campaign can be in throughout its lifecycle:

### 1. Draft
**Description:** Initial state when a campaign is being created but not yet published.

**Characteristics:**
- Campaign is visible only to the creator
- Can be edited freely
- No contributions are accepted
- No on-chain transactions have occurred

**Entry Conditions:**
- Campaign is created but not yet activated

### 2. Active
**Description:** Campaign is live and accepting contributions.

**Characteristics:**
- Campaign is publicly visible
- Accepts sponsor contributions
- Deadline has not passed
- Target amount has not been exceeded
- Contributions are held in escrow

**Entry Conditions:**
- Creator publishes a Draft campaign
- Campaign has valid parameters (target, min_target, deadline)
- Creator has paid the insurance fee (on-chain campaigns)

### 3. TreesBeingPlanted
**Description:** Campaign funding has been claimed and trees are being planted.

**Characteristics:**
- Funds have been claimed by creator
- Physical tree planting is in progress
- Sponsor rewards may be streaming (if configured)
- Campaign awaits verification

**Entry Conditions:**
- Campaign was Successful
- Creator called `claim_funds`
- Reserve allocation completed

### 4. UnderVerification
**Description:** Trees have been planted and are awaiting verification by Fundable's admin team.

**Characteristics:**
- Tree planting work is complete
- Evidence has been submitted
- Admin review is pending
- Verification can result in completion or failure

**Entry Conditions:**
- Campaign reached TreesBeingPlanted state
- Creator/planter submitted verification evidence
- Required documentation provided

### 5. Completed
**Description:** Campaign successfully completed with verified tree planting.

**Characteristics:**
- All trees verified as planted and alive
- Sponsor rewards fully distributed
- Campaign metrics finalized (total trees, CO2 sequestered)
- Insurance not triggered
- Campaign serves as successful case study

**Entry Conditions:**
- Campaign was UnderVerification
- Admin verified tree planting evidence
- All verification requirements met

### 6. Abandoned
**Description:** Campaign did not reach minimum funding target or creator abandoned it.

**Characteristics:**
- Campaign failed to meet minimum funding threshold
- All contributions are refundable to sponsors
- No funds released to creator
- No tree planting occurred

**Entry Conditions:**
- Active campaign passed deadline without reaching `min_target`
- Anyone called `trigger_expiry`
- Creator explicitly abandoned a Draft campaign

## State Transition Diagram

```
┌─────────┐
│  Draft  │
└────┬────┘
     │ publish
     ▼
┌─────────┐                                    ┌───────────┐
│ Active  │──── deadline passed & funded ─────▶│ Completed │
└────┬────┘    (auto with claim_funds)         └───────────┘
     │
     │ deadline passed & underfunded
     │ OR creator abandons
     ▼
┌───────────┐
│ Abandoned │
└───────────┘


[Detailed transition path for successful campaigns]

┌─────────┐
│  Draft  │
└────┬────┘
     │ publish
     ▼
┌──────────┐
│  Active  │
└────┬─────┘
     │ contributions + claim_funds
     ▼
┌───────────────────┐
│TreesBeingPlanted  │
└────┬──────────────┘
     │ submit verification
     ▼
┌──────────────────┐
│UnderVerification │
└────┬─────────────┘
     │
     ├─ verification passed ──▶ ┌───────────┐
     │                          │ Completed │
     │                          └───────────┘
     │
     └─ trees died ──▶ ┌───────────┐
                       │ Abandoned │
                       └───────────┘
```

## State Transitions

### From Draft

| To State | Trigger | Conditions | Actor |
|----------|---------|------------|-------|
| Active | `publish()` | Valid campaign parameters, insurance fee paid | Creator |
| Abandoned | `abandon()` | Creator decides not to proceed | Creator |

### From Active

| To State | Trigger | Conditions | Actor |
|----------|---------|------------|-------|
| TreesBeingPlanted | `claim_funds()` | Campaign successful (reached min_target), deadline passed | Creator |
| Abandoned | `trigger_expiry()` | Deadline passed, `total_raised < min_target` | Anyone |
| Abandoned | `abandon()` | Creator cancels before deadline | Creator |

### From TreesBeingPlanted

| To State | Trigger | Conditions | Actor |
|----------|---------|------------|-------|
| UnderVerification | `submit_verification()` | Tree planting evidence submitted | Creator/Planter |

### From UnderVerification

| To State | Trigger | Conditions | Actor |
|----------|---------|------------|-------|
| Completed | `verify_trees()` | Trees verified as planted and alive | Admin |
| Abandoned | `mark_trees_died()` | Trees verified as dead/not planted | Admin |

### From Completed

**Terminal state** - No further transitions

### From Abandoned

**Terminal state** - No further transitions
- Sponsors can claim refunds (if campaign was Active)
- Sponsors can claim insurance refunds (if verification failed)

## State-Specific Operations

### Operations Available by State

| Operation | Draft | Active | TreesBeingPlanted | UnderVerification | Completed | Abandoned |
|-----------|-------|--------|-------------------|-------------------|-----------|-----------|
| Edit campaign details | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Publish campaign | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Contribute | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Claim funds | ❌ | ✅* | ❌ | ❌ | ❌ | ❌ |
| Submit verification | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Verify trees (admin) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Claim refund | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Claim insurance refund | ❌ | ❌ | ❌ | ❌ | ❌ | ✅** |

\* Only after deadline passed and min_target reached  
\*\* Only if abandoned due to verification failure

## Events Emitted by State Transitions

Each state transition emits events that can be subscribed to via webhooks:

| Transition | Event(s) Emitted |
|------------|------------------|
| Draft → Active | `campaign.published` |
| Active → TreesBeingPlanted | `campaign.funded`, `funds.claimed` |
| Active → Abandoned | `campaign.failed` |
| TreesBeingPlanted → UnderVerification | `verification.submitted` |
| UnderVerification → Completed | `campaign.completed`, `trees.verified` |
| UnderVerification → Abandoned | `verification.failed`, `trees.died` |

## Database Schema

Campaign state is persisted in PostgreSQL with full history tracking:

```sql
-- Current state
campaigns.status: ENUM(
  'DRAFT',
  'ACTIVE', 
  'TREES_BEING_PLANTED',
  'UNDER_VERIFICATION',
  'COMPLETED',
  'ABANDONED'
)

-- State history
campaign_status_history (
  id uuid,
  campaign_id uuid,
  from_status text,
  to_status text,
  changed_by text,
  changed_at timestamptz,
  reason text
)
```

## On-Chain State (Smart Contract)

The Stellar smart contract tracks a simplified state model:

```rust
pub enum CampaignStatus {
    Active = 0,      // Accepting contributions
    Successful = 1,  // Funded, can claim
    Failed = 2,      // Deadline passed, below min_target
    Claimed = 3,     // Funds claimed, trees being planted
    VerificationFailed = 4, // Trees died
}
```

**Mapping to Off-Chain States:**
- Contract `Active` = Off-chain `Active` or `Draft`
- Contract `Successful` = Off-chain `Active` (after deadline, before claim)
- Contract `Failed` = Off-chain `Abandoned`
- Contract `Claimed` = Off-chain `TreesBeingPlanted` or `UnderVerification`
- Contract `VerificationFailed` = Off-chain `Abandoned` (verification failure)
- Off-chain `Completed` = Contract `Claimed` (after successful verification)

## State Validation Rules

### Active State Requirements
- `deadline` must be in the future
- `min_target` > 0 and ≤ `target_amount`
- `target_amount` > 0
- Insurance fee paid (on-chain)
- Creator has not abandoned

### TreesBeingPlanted Requirements
- Previous state was Active
- `total_raised >= min_target`
- `claim_funds()` was called successfully
- Reserve allocated (10% of after-fee amount)

### UnderVerification Requirements
- Previous state was TreesBeingPlanted
- Verification evidence submitted
- Evidence includes:
  - Tree planting photos
  - GPS coordinates
  - Planting date
  - Species information

### Completed Requirements
- Previous state was UnderVerification
- Admin verified evidence
- Trees confirmed alive
- All verification criteria met

## Error Handling

### Common State Transition Errors

| Error | Code | Description |
|-------|------|-------------|
| `CampaignNotActive` | 8 | Operation requires Active status |
| `CampaignNotSuccessful` | 11 | Operation requires successful funding |
| `CampaignNotFailed` | 10 | Refund requires Abandoned status |
| `AlreadyClaimed` | 13 | Funds already claimed |
| `DeadlineNotReached` | 9 | Expiry trigger called too early |
| `CampaignNotVerificationFailed` | 18 | Insurance refund requires verification failure |

## Best Practices

### For Campaign Creators
1. **Draft State:** Take time to configure all parameters correctly before publishing
2. **Active State:** Monitor contributions and engage with sponsors
3. **TreesBeingPlanted:** Begin planting immediately after claiming funds
4. **UnderVerification:** Provide comprehensive evidence to ensure smooth verification

### For Integrators
1. Subscribe to state transition webhooks to track campaign progress
2. Poll campaign status for real-time dashboard updates
3. Handle all possible states in your UI (don't assume Active/Completed only)
4. Show appropriate actions based on current state
5. Display state history for transparency

### For Sponsors
1. Only contribute to Active campaigns
2. Monitor state transitions via webhooks or polling
3. Understand refund eligibility based on final state
4. Track reward stream status (for Completed campaigns)

## Audit Trail

All state transitions are recorded in `campaign_status_history` with:
- Timestamp (UTC)
- Actor (who triggered the transition)
- Reason (optional explanation)
- Previous and new state

This provides complete traceability for:
- Compliance audits
- Dispute resolution
- Performance analytics
- Historical reporting

## Related Documentation

- [Campaign Guide](./campaign-guide.md) - Full campaign lifecycle documentation
- [Webhooks](./webhooks.md) - Event subscription and delivery
- [Campaign Verification](./campaign-verification.md) - Verification process details
- [API Rate Limits](./campaign-api-rate-limits.md) - API usage guidelines

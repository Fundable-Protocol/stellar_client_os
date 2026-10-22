# Quadratic Funding Implementation

## Overview

This implementation adds Soroban smart contract support for quadratic funding rounds with anti-Sybil protection, real-time match estimation, and automated payout distribution.

## Features

### 1. Soroban Smart Contract (`contracts/quadratic-funding`)

The quadratic funding contract implements:

- **Funding Round Management**: Create and manage funding rounds with configurable matching pools, time periods, and minimum contribution thresholds
- **Quadratic Formula**: Calculates matching allocations using the formula `(sum(sqrt(c_i)))^2` where `c_i` is each contribution
- **Anti-Sybil Protection**: Hooks for verifying contributor identity and flagging suspicious accounts
- **Real-time Match Estimation**: Calculate estimated matching amounts during checkout
- **Automated Distribution**: Distribute matching funds proportionally to all projects at round conclusion

#### Key Functions

```rust
// Initialize the contract
fn initialize(env: Env, admin: Address)

// Create a new funding round
fn create_round(
    env: Env,
    token: Address,
    matching_pool: i128,
    start_time: u64,
    end_time: u64,
    min_contribution: i128
) -> u64

// Contribute to a project
fn contribute(env: Env, round_id: u64, project: Address, amount: i128)

// Get estimated match for a project
fn get_estimated_match(env: Env, round_id: u64, project: Address) -> i128

// Distribute matching funds (admin only)
fn distribute_matching(env: Env, round_id: u64)

// Update Sybil verification status (admin only)
fn set_sybil_status(
    env: Env,
    round_id: u64,
    contributor: Address,
    status: SybilStatus
)
```

### 2. Backend API

Three new API endpoints for managing quadratic funding:

#### `POST /api/quadratic-funding/rounds`
Create a new funding round (admin only).

**Request:**
```json
{
  "token": "GXXXXXXX...",
  "matchingPool": "1000000000",
  "startTime": 1234567890,
  "endTime": 1234654290,
  "minContribution": "1000000"
}
```

**Response:**
```json
{
  "roundId": "1"
}
```

#### `POST /api/quadratic-funding/estimate-match`
Calculate real-time estimated match during checkout.

**Request:**
```json
{
  "roundId": "1",
  "projectAddress": "GXXXXXXX...",
  "contributionAmount": "5000000"
}
```

**Response:**
```json
{
  "estimatedMatch": "2500000",
  "totalAllocation": "7500000",
  "contributorCount": 12
}
```

#### `POST /api/quadratic-funding/:roundId/distribute`
Trigger automated distribution at round conclusion (admin only).

**Response:**
```json
{
  "success": true,
  "distributions": [
    {
      "project": "GXXXXXXX...",
      "directContributions": "10000000",
      "matchingAmount": "5000000",
      "totalPayout": "15000000"
    }
  ]
}
```

### 3. Frontend Components

#### `QuadraticMatchDisplay`
Real-time display component for checkout showing estimated matching funds.

```tsx
<QuadraticMatchDisplay
  roundId="1"
  projectAddress="GXXXXXXX..."
  contributionAmount="5000000"
  tokenSymbol="USDC"
/>
```

Features:
- Debounced API calls to avoid excessive requests
- Loading states and error handling
- Clear visualization of direct contribution + matching
- Educational messaging about quadratic funding

#### `RoundManagement`
Admin interface for creating and managing funding rounds.

```tsx
<RoundManagement adminToken="..." />
```

### 4. Anti-Sybil Protection

Multi-layered verification system in `lib/quadratic-funding-sybil.ts`:

1. **Account Age Check**: Flags accounts created very recently
2. **On-chain Reputation**: Analyzes previous contributions and token holdings
3. **Contribution Pattern Analysis**: Detects coordinated behavior and suspicious patterns
4. **Identity Provider Integration**: Hooks for BrightID, Gitcoin Passport, Civic

Contributors receive a score (0-100):
- **≥80**: Verified (contributions count fully)
- **40-79**: Unverified (contributions may be weighted)
- **<40**: Flagged (contributions excluded from matching)

## Quadratic Funding Formula

For each project, the matching allocation is calculated as:

```
matching_i = matching_pool × (sum_sqrt_i)² / Σ(sum_sqrt_j)²
```

Where:
- `sum_sqrt_i = Σ sqrt(contribution_k)` for all verified contributions to project i
- The denominator sums across all projects in the round

This formula:
- Amplifies the impact of smaller contributions
- Rewards broad community support over large individual donations
- Makes it less profitable to split large donations across multiple accounts

## Example Scenario

**Matching Pool**: 10,000 USDC

**Project A** (local community garden):
- 20 contributors: 5 @ $10, 10 @ $25, 5 @ $50
- Direct total: $625
- QF score: (5×√10 + 10×√25 + 5×√50)² ≈ 2,916
- Matching: ~$4,860
- **Total**: ~$5,485

**Project B** (large environmental org):
- 3 contributors: 1 @ $5,000, 2 @ $100
- Direct total: $5,200
- QF score: (√5000 + 2×√100)² ≈ 5,476
- Matching: ~$5,140
- **Total**: ~$10,340

Despite raising more directly, Project B doesn't dominate the matching pool. Project A's broad community support is amplified by the quadratic formula.

## Testing

### Contract Tests
```bash
cd contracts
cargo test --package quadratic-funding
```

Tests cover:
- Round creation and lifecycle
- Contribution flow
- Quadratic formula correctness
- Integer square root implementation
- Edge cases and error conditions

### Service Tests
```bash
pnpm test quadratic-funding.service.test.ts
pnpm test quadratic-funding-sybil.test.ts
```

## Deployment Checklist

1. ✅ Deploy quadratic-funding contract to Stellar
2. ✅ Set `QUADRATIC_FUNDING_CONTRACT_ID` environment variable
3. ✅ Configure admin wallet for round creation
4. ✅ Set up anti-Sybil identity provider integrations
5. ✅ Test round creation and contribution flow on testnet
6. ✅ Monitor initial rounds for Sybil attacks
7. ✅ Document gas costs and optimization opportunities

## Future Enhancements

- Pairwise coordination subsidy (more sophisticated QF variant)
- Reputation-weighted contributions
- Multi-token matching pools
- Streaming distribution over time
- On-chain governance for round parameters
- Machine learning-based Sybil detection

## References

- [Quadratic Funding: A Primer](https://wtfisqf.com/)
- [Gitcoin Grants Rounds](https://gitcoin.co/grants/)
- [Vitalik on QF](https://vitalik.ca/general/2019/12/07/quadratic.html)
- [Anti-Sybil Best Practices](https://gov.gitcoin.co/t/anti-sybil-best-practices/)

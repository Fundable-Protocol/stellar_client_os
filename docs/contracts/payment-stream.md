# Payment Stream Contract

## Overview

The `PaymentStreamContract` is the main Soroban contract for Fundable's streaming engine. It manages escrowed token payments, vesting schedules, optional cliff periods, protocol fee accounting, sender/delegate controls, emergency pauses, and admin-managed dispute resolution.

This document reflects the live contract interface and is intended as an ABI-style reference, including data shapes, function signatures, return types, and event payloads.

---

## Contract Type Definitions

### `StreamStatus`

```rust
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamStatus {
    Active,
    Paused,
    Canceled,
    Completed,
    Disputed,
}
```

Meaning:

- `Active`: stream is vesting normally
- `Paused`: stream is temporarily frozen by sender
- `Canceled`: stream was canceled by sender; remaining escrow can be refunded
- `Completed`: stream has fully vested/settled
- `Disputed`: dispute is queued and the stream is temporarily blocked

### `Stream`

```rust
#[contracttype]
#[derive(Clone)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub balance: i128,
    pub withdrawn_amount: i128,
    pub start_time: u64,
    pub cliff_duration: u64,
    pub end_time: u64,
    pub status: StreamStatus,
    pub paused_at: Option<u64>,
    pub total_paused_duration: u64,
}
```

### `StreamParams`

```rust
#[contracttype]
#[derive(Clone)]
pub struct StreamParams {
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub initial_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_duration: u64,
}
```

### `StreamMetrics`

```rust
#[contracttype]
#[derive(Clone)]
pub struct StreamMetrics {
    pub last_activity: u64,
    pub total_withdrawn: i128,
    pub withdrawal_count: u32,
    pub pause_count: u32,
    pub total_delegations: u32,
    pub current_delegate: Option<Address>,
    pub last_delegation_time: u64,
}
```

### `ProtocolMetrics`

```rust
#[contracttype]
#[derive(Clone)]
pub struct ProtocolMetrics {
    pub total_active_streams: u64,
    pub total_tokens_streamed: i128,
    pub total_streams_created: u64,
    pub total_delegations: u64,
}
```

### `QueuedResolution`

```rust
#[contracttype]
#[derive(Clone)]
pub struct QueuedResolution {
    pub dispute_id: u64,
    pub stream_id: u64,
    pub recipient_amount: i128,
    pub sender_amount: i128,
    pub execute_after: u64,
    pub executed: bool,
    pub previous_status: StreamStatus,
}
```

---

## Enum Errors

```rust
#[contracterror]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidTimeRange = 5,
    StreamNotFound = 6,
    StreamNotActive = 7,
    StreamNotPaused = 8,
    StreamCannotBeCanceled = 9,
    InsufficientWithdrawable = 10,
    TransferFailed = 11,
    FeeTooHigh = 12,
    InvalidRecipient = 13,
    DepositExceedsTotal = 14,
    ArithmeticOverflow = 15,
    InvalidDelegate = 16,
    ContractPaused = 17,
    AlreadyPaused = 18,
    NotPaused = 19,
    InvalidSwapPath = 20,
    SlippageExceeded = 21,
    SwapFailed = 22,
    InvalidCliff = 23,
    BatchLimitExceeded = 24,
    EmptyBatch = 25,
    DisputeInProgress = 26,
    DisputeAlreadyQueued = 27,
    DisputeNotFound = 28,
    DisputeAlreadyExecuted = 29,
    TimelockNotElapsed = 30,
    InvalidResolutionAmounts = 31,
}
```

---

## Public ABI

### 1. `initialize`

```rust
pub fn initialize(env: Env, admin: Address, fee_collector: Address, general_fee_rate: u32)
```

- Parameters:
  - `admin: Address`
  - `fee_collector: Address`
  - `general_fee_rate: u32`
- Returns: `void`
- Authorization: `admin.require_auth()`
- Validates: fee rate must not exceed `MAX_FEE` (`500` => 5%)

### 2. `emergency_pause`

```rust
pub fn emergency_pause(env: Env)
```

- Returns: `void`
- Authorization: admin only
- Sets the global emergency pause circuit breaker

### 3. `emergency_unpause`

```rust
pub fn emergency_unpause(env: Env)
```

- Returns: `void`
- Authorization: admin only
- Clears the emergency pause flag

### 4. `is_paused`

```rust
pub fn is_paused(env: Env) -> bool
```

- Returns: current global paused status

### 5. `create_stream`

```rust
pub fn create_stream(
    env: Env,
    sender: Address,
    recipient: Address,
    token: Address,
    total_amount: i128,
    initial_amount: i128,
    start_time: u64,
    end_time: u64,
) -> u64
```

- Returns: new stream id
- Authorization: `sender.require_auth()`
- Creates a stream with no cliff

### 6. `create_stream_with_cliff`

```rust
pub fn create_stream_with_cliff(
    env: Env,
    sender: Address,
    recipient: Address,
    token: Address,
    total_amount: i128,
    initial_amount: i128,
    start_time: u64,
    end_time: u64,
    cliff_duration: u64,
) -> u64
```

- Returns: new stream id
- Authorization: `sender.require_auth()`
- Validates `cliff_duration < end_time - start_time`
- When active, no withdrawals are allowed until the cliff window elapses

### 7. `create_batch_streams`

```rust
pub fn create_batch_streams(
    env: Env,
    sender: Address,
    params: Vec<StreamParams>,
) -> Vec<u64>
```

- Returns: ordered list of created stream ids
- Authorization: `sender.require_auth()`
- Enforces `params.len() <= 50`
- Rejects the entire batch atomically if any entry is invalid

### 8. `deposit`

```rust
pub fn deposit(env: Env, stream_id: u64, amount: i128)
```

- Authorization: stream sender only
- Adds more escrowed funds to an existing active stream
- Fails if stream is canceled, completed, or disputed

### 9. `deposit_with_swap`

```rust
pub fn deposit_with_swap(
    env: Env,
    stream_id: u64,
    from_token: Address,
    amount_in: i128,
    min_amount_out: i128,
    swap_path: Vec<Address>,
)
```

- Authorization: stream sender only
- Swaps a source asset into the stream asset via a configured DEX router
- Validates slippage and stream balance limits

### 10. `set_dex_router`

```rust
pub fn set_dex_router(env: Env, router: Address)
```

- Authorization: admin only
- Configures the DEX router used by `deposit_with_swap`

### 11. `get_dex_router`

```rust
pub fn get_dex_router(env: Env) -> Option<Address>
```

- Returns: configured router address, if any

### 12. `get_stream`

```rust
pub fn get_stream(env: Env, stream_id: u64) -> Stream
```

- Returns: stored `Stream` object
- Panics with `StreamNotFound` if missing

### 13. `set_delegate`

```rust
pub fn set_delegate(env: Env, stream_id: u64, delegate: Address)
```

- Authorization: recipient only
- Grants a delegate rights to call withdrawal methods on the stream

### 14. `revoke_delegate`

```rust
pub fn revoke_delegate(env: Env, stream_id: u64)
```

- Authorization: recipient only
- Removes a delegate for the stream

### 15. `get_delegate`

```rust
pub fn get_delegate(env: Env, stream_id: u64) -> Option<Address>
```

- Returns: current delegated address for a stream, if any

### 16. `withdrawable_amount`

```rust
pub fn withdrawable_amount(env: Env, stream_id: u64) -> i128
```

- Returns: currently withdrawable amount for the recipient
- `0` if stream is paused, completed, canceled, or not yet vested

### 17. `withdraw`

```rust
pub fn withdraw(env: Env, stream_id: u64, amount: i128)
```

- Authorization: recipient or delegate
- Transfers the requested vesting amount to the recipient
- Applies protocol fee before transfer

### 18. `withdraw_max`

```rust
pub fn withdraw_max(env: Env, stream_id: u64)
```

- Authorization: recipient or delegate
- Withdraws all currently withdrawable tokens for that stream

### 19. `pause_stream`

```rust
pub fn pause_stream(env: Env, stream_id: u64)
```

- Authorization: sender only
- Marks the stream as `Paused`
- Paused streams stop vesting while paused

### 20. `resume_stream`

```rust
pub fn resume_stream(env: Env, stream_id: u64)
```

- Authorization: sender only
- Restores `Paused` stream to `Active`
- Extends the end time by the paused duration to preserve the vesting schedule

### 21. `cancel_stream`

```rust
pub fn cancel_stream(env: Env, stream_id: u64)
```

- Authorization: sender only
- Cancels an `Active` or `Paused` stream
- Refunds the remaining escrowed balance to the sender

### 22. `set_protocol_fee_rate`

```rust
pub fn set_protocol_fee_rate(env: Env, new_fee_rate: u32)
```

- Authorization: admin only
- Accepts fee in basis points; max `500` (5%)

### 23. `get_protocol_fee_rate`

```rust
pub fn get_protocol_fee_rate(env: Env) -> u32
```

- Returns: current protocol fee rate, in basis points

### 24. `set_fee_collector`

```rust
pub fn set_fee_collector(env: Env, new_fee_collector: Address)
```

- Authorization: admin only
- Sets the wallet receiving collected protocol fees

### 25. `get_fee_collector`

```rust
pub fn get_fee_collector(env: Env) -> Address
```

- Returns: configured fee collector address

### 26. `get_stream_metrics`

```rust
pub fn get_stream_metrics(env: Env, stream_id: u64) -> StreamMetrics
```

- Returns: per-stream activity and delegation metrics

### 27. `get_protocol_metrics`

```rust
pub fn get_protocol_metrics(env: Env) -> ProtocolMetrics
```

- Returns: protocol-wide stream and delegation metrics

### 28. `resolve_dispute`

```rust
pub fn resolve_dispute(
    env: Env,
    stream_id: u64,
    recipient_amount: i128,
    sender_amount: i128,
) -> u64
```

- Authorization: admin only
- Marks stream as `Disputed` and enqueues the resolution behind a 48-hour timelock
- Returns: dispute id

### 29. `execute_resolution`

```rust
pub fn execute_resolution(env: Env, dispute_id: u64)
```

- Executes a queued dispute after the timelock expires
- Transfers the resolved amounts to recipient and sender
- Marks the stream as `Completed`

### 30. `cancel_queued_resolution`

```rust
pub fn cancel_queued_resolution(env: Env, dispute_id: u64)
```

- Authorization: admin only
- Removes a queued dispute before execution and restores the previous stream status

### 31. `get_queued_resolution`

```rust
pub fn get_queued_resolution(env: Env, dispute_id: u64) -> Option<QueuedResolution>
```

- Returns: queued dispute if present

### 32. `get_active_dispute`

```rust
pub fn get_active_dispute(env: Env, stream_id: u64) -> Option<u64>
```

- Returns: active dispute id for a stream, if any

---

## Event Signatures

All event payloads are emitted with Soroban contract events. The following are the published event types exposed by the contract.

### `FeeCollected`

```rust
#[contractevent(topics = ["FeeCollected"])]
pub struct FeeCollectedEvent {
    pub stream_id: u64,
    pub amount: i128,
}
```

### `StreamDeposit`

```rust
#[contractevent(topics = ["StreamDeposit"])]
pub struct StreamDepositEvent {
    pub stream_id: u64,
    pub amount: i128,
}
```

### `SwapDeposit`

```rust
#[contractevent(topics = ["SwapDeposit"])]
pub struct SwapDepositEvent {
    pub stream_id: u64,
    pub from_token: Address,
    pub amount_in: i128,
    pub amount_out: i128,
}
```

### `DelegationGranted`

```rust
#[contractevent(topics = ["DelegationGranted"])]
pub struct DelegationGrantedEvent {
    pub stream_id: u64,
    pub recipient: Address,
    pub delegate: Address,
}
```

### `DelegationRevoked`

```rust
#[contractevent(topics = ["DelegationRevoked"])]
pub struct DelegationRevokedEvent {
    pub stream_id: u64,
    pub recipient: Address,
}
```

### `StreamPaused`

```rust
#[contractevent(topics = ["StreamPaused"])]
pub struct StreamPausedEvent {
    pub stream_id: u64,
    pub paused_at: u64,
}
```

### `StreamResumed`

```rust
#[contractevent(topics = ["StreamResumed"])]
pub struct StreamResumedEvent {
    pub stream_id: u64,
    pub resumed_at: u64,
    pub paused_duration: u64,
}
```

### `EmergencyPaused`

```rust
#[contractevent(topics = ["EmergencyPaused"])]
pub struct EmergencyPausedEvent {
    pub paused_by: Address,
    pub paused_at: u64,
}
```

### `EmergencyUnpaused`

```rust
#[contractevent(topics = ["EmergencyUnpaused"])]
pub struct EmergencyUnpausedEvent {
    pub unpaused_by: Address,
    pub unpaused_at: u64,
}
```

### `DisputeQueued`

```rust
pub struct DisputeQueuedEvent {
    pub dispute_id: u64,
    pub stream_id: u64,
    pub recipient_amount: i128,
    pub sender_amount: i128,
    pub execute_after: u64,
}
```

The event is published as a Soroban event with topic `("DisputeQueued", stream_id)`.

### `DisputeExecuted`

```rust
pub struct DisputeExecutedEvent {
    pub dispute_id: u64,
    pub stream_id: u64,
    pub recipient_amount: i128,
    pub sender_amount: i128,
}
```

The event is published as a Soroban event with topic `("DisputeExecuted", stream_id)`.

### `DisputeCanceled`

```rust
pub struct DisputeCanceledEvent {
    pub dispute_id: u64,
    pub stream_id: u64,
}
```

The event is published as a Soroban event with topic `("DisputeCanceled", stream_id)`.

---

## Notes for SDK Consumers

The generated SDK surface in `packages/sdk/src/generated/payment-stream/src/index.ts` mirrors these contract types and methods. In TypeScript, the values align to:

- `u64` => `bigint` / `number` depending on runtime context
- `i128` => `bigint`
- `Address` => `string`
- `Vec<T>` => `T[]` in generated wrappers
- `Option<T>` => `T | null` / `undefined` in SDK code patterns

The contract supports both standard vesting flows and edge cases like emergency pause, dispute timelocks, and cross-asset top-ups through the configured DEX router.

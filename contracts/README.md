# Soroban Smart Contracts

This directory contains the Soroban smart contracts for the Fundable Protocol, written in Rust. The contracts are organized as a Cargo workspace.

## Workspace Structure

The `contracts` directory is a Cargo workspace with the following members:

-   `payment-stream`: A contract for creating and managing continuous token streams.
-   `distributor`: A contract for distributing tokens to multiple recipients.

Shared dependencies, such as the `soroban-sdk`, are managed in the root `Cargo.toml` of this workspace.

---

## Contracts

### 1. Payment Stream (`payment-stream`)

The `payment-stream` contract allows for the creation of linear payment streams, where a specified amount of tokens is released to a recipient over a defined period.

#### Core Concepts

-   **Stream:** A `Stream` is the central data structure, containing details about the sender, recipient, token, total amount, withdrawn amount, start and end times, and the stream's status.
-   **Status:** A stream can have one of the following statuses: `Active`, `Paused`, `Canceled`, or `Completed`.

#### Key Functions

-   `initialize(admin: Address)`: Initializes the contract with an administrative address.
-   `create_stream(...)`: Creates a new payment stream with specified parameters.
-   `get_stream(stream_id: u64)`: Retrieves the details of a specific stream.
-   `withdrawable_amount(stream_id: u64)`: Calculates the amount that can be withdrawn from a stream at the current time.
-   `withdraw(stream_id: u64, amount: i128)`: Allows the recipient to withdraw available funds.
-   `pause_stream(stream_id: u64)`: Pauses an active stream (sender only).
-   `resume_stream(stream_id: u64)`: Resumes a paused stream (sender only).
-   `cancel_stream(stream_id: u64)`: Cancels a stream (sender only), allowing for the recovery of unvested funds.

### 2. Distributor (`distributor`)

The `distributor` contract provides functionality for sending tokens to multiple recipients in a single transaction.

#### Core Concepts

The contract supports two modes of distribution:

-   **Equal Distribution:** A total amount is divided equally among a list of recipients.
-   **Weighted Distribution:** Each recipient in a list receives a corresponding specified amount.

#### Key Functions

-   `initialize(admin: Address)`: Initializes the contract with an administrative address.
-   `distribute_equal(...)`: Distributes a total amount equally among a list of recipients.
-   `distribute_weighted(...)`: Distributes specified amounts to a list of recipients.
-   `get_admin()`: Retrieves the admin address.

---

## Building and Testing

To build and test the contracts, you can use the following commands from the **root of the project**:

-   **Build Contracts:**
    ```bash
    pnpm build:contracts
    ```
    This command runs `cargo build --release` within the `contracts` workspace.

-   **Run Contract Tests:**
    ```bash
    pnpm test:contracts
    ```
    This command runs `cargo test` for all contracts in the workspace.

# Test Suite Documentation

**54 tests · 15 distributor · 39 payment stream ·**

---

## Distributor Contract

### Initialisation

| Test | Verifies |
|---|---|
| `test_initialize` | Contract initialises state correctly on first deploy. |
| `test_re_initialize_fails` | A second call to `initialize` panics — prevents overwriting live state. |

### Protocol Fees

| Test | Verifies |
|---|---|
| `test_set_protocol_fee` | Fee can be updated to a new valid value after initialisation. |
| `test_zero_protocol_fee` | Setting the fee to zero is accepted; distributions pass through with no deduction. |

### Equal Distribution

| Test | Verifies |
|---|---|
| `test_distribute_equal` | A given amount is split evenly across all recipients and balances match. |
| `test_distribute_equal_with_protocol_fee` | The protocol fee is deducted before splitting; every recipient receives `(amount − fee) / n`. |
| `test_distribute_equal_empty_recipients` | Passing an empty recipient list panics — no distribution is attempted. |
| `test_distribute_equal_amount_too_small` | An amount smaller than the number of recipients panics — avoids zero-token transfers. |

### Weighted Distribution

| Test | Verifies |
|---|---|
| `test_distribute_weighted` | Each recipient receives a share proportional to their declared weight. |
| `test_distribute_weighted_with_protocol_fee` | The fee is deducted first; weighted shares are then calculated on the net amount. |
| `test_distribute_weighted_zero_amount` | A zero-amount weighted call panics — guards against no-op distributions. |

### Statistics & History

| Test | Verifies |
|---|---|
| `test_record_history` | Each distribution is persisted to the on-chain history log. |
| `test_update_token_statistics` | Per-token running totals (volume, count) are incremented after a distribution. |
| `test_update_global_stats` | The contract-wide aggregate counters update on every distribution. |
| `test_update_user_statistics` | Per-user totals (sent/received) are updated correctly. |

---

## Payment Stream Contract

### Stream Creation & Queries

| Test | Verifies |
|---|---|
| `test_create_stream` | A new stream is created with the correct sender, recipient, amount, and duration. |
| `test_get_nonexistent_stream` | Querying a stream ID that does not exist panics. |

### Withdrawals

| Test | Verifies |
|---|---|
| `test_withdraw` | The recipient can withdraw the currently vested portion of the stream. |
| `test_withdrawable_amount` | The view function returns the correct vested amount at a given point in time. |
| `test_withdraw_max` | Withdrawing the full vested amount at stream completion transfers the entire balance. |
| `test_withdraw_after_pause_and_resume` | Vested tokens accumulated before and after a pause/resume cycle are both withdrawable. |
| `test_unauthorized_withdraw` | A caller who is neither the recipient nor an authorised delegate is rejected. |

### Delegation

| Test | Verifies |
|---|---|
| `test_set_delegate` | A delegate address is stored and recognised for the stream. |
| `test_delegate_withdraw` | The delegate can withdraw vested tokens on behalf of the recipient. |
| `test_overwrite_delegate` | Setting a new delegate replaces the previous one without error. |
| `test_revoke_delegate` | After revocation the former delegate loses withdrawal access. |
| `test_revoke_nonexistent_delegate` | Revoking when no delegate is set completes without error. |
| `test_set_self_delegate` | Assigning the sender as their own delegate panics. |
| `test_recipient_can_still_withdraw_after_delegate_set` | The recipient retains direct withdrawal access even when a delegate exists. |
| `test_unauthorized_delegate_withdraw_after_revoke` | A revoked delegate's attempt to withdraw panics. |

### Pause & Resume

| Test | Verifies |
|---|---|
| `test_pause_and_resume_stream` | A stream can be paused and later resumed, returning to an active state. |
| `test_pausing_stops_token_vesting` | While paused the withdrawable amount does not increase over time. |
| `test_resuming_continues_from_where_it_left_off` | After resume, vesting picks up exactly where it stopped — no time is lost or double-counted. |
| `test_withdrawable_amount_zero_for_paused_streams` | A freshly paused stream with no prior vesting reports zero withdrawable. |
| `test_only_sender_can_pause` | Any caller other than the stream sender is rejected when pausing. |
| `test_only_sender_can_resume` | Any caller other than the stream sender is rejected when resuming. |

### Cancellation

| Test | Verifies |
|---|---|
| `test_cancel_stream` | The sender can cancel an active stream; unvested funds are returned. |

### Deposits (Top-Up)

| Test | Verifies |
|---|---|
| `test_deposit` | Additional funds can be deposited into an existing stream. |
| `test_deposit_multiple` | Several successive deposits accumulate correctly in the stream balance. |
| `test_deposit_after_withdrawal` | A deposit after a partial withdrawal restores the available balance. |
| `test_deposit_updates_last_activity` | Each deposit advances the stream's `last_activity` timestamp. |
| `test_deposit_exceeds_total` | Depositing more than the remaining stream capacity panics. |
| `test_deposit_negative_amount` | A negative deposit amount panics. |
| `test_deposit_invalid_amount` | A non-numeric or otherwise malformed amount panics. |

### Metrics & Events

| Test | Verifies |
|---|---|
| `test_protocol_metrics_initialization` | All protocol-level counters start at zero on deploy. |
| `test_multiple_streams_metrics` | Creating several streams increments the global stream counter correctly. |
| `test_withdrawal_updates_metrics` | A withdrawal increments the protocol's total-withdrawn counter. |
| `test_withdraw_max_updates_metrics` | A full withdrawal updates both the stream-level and protocol-level metrics. |
| `test_multiple_withdrawals_accumulate_metrics` | Successive partial withdrawals sum correctly in the metrics. |
| `test_pause_updates_metrics` | Pausing a stream increments the pause counter. |
| `test_resume_updates_metrics` | Resuming a stream increments the resume counter. |
| `test_revoke_delegate_updates_metrics` | Revoking a delegate increments the revocation counter. |
| `test_stream_paused_event_emitted` | A `StreamPaused` event is emitted with the correct stream ID on pause. |
| `test_stream_resumed_event_emitted` | A `StreamResumed` event is emitted with the correct stream ID on resume. |
# Payment Stream Contract

## Overview

The Payment Stream contract is a Soroban smart contract for creating and managing continuous payment streams. It allows a sender to establish a stream that releases a specified token amount to a recipient over a defined period. The contract supports functionalities such as creating, pausing, resuming, and canceling streams, as well as allowing recipients to withdraw their vested funds.

## Data Structures

### `Stream`

A struct that holds all the essential information about a single payment stream.

-   `id`: `u64` - A unique identifier for the stream.
-   `sender`: `Address` - The address initiating the stream and funding it.
-   `recipient`: `Address` - The address that will receive the streamed funds.
-   `token`: `Address` - The contract address of the token being streamed.
-   `total_amount`: `i128` - The total amount of tokens to be streamed over the duration.
-   `withdrawn_amount`: `i128` - The amount of tokens already withdrawn by the recipient.
-   `start_time`: `u64` - The Unix timestamp marking the beginning of the stream.
-   `cliff_duration`: `u64` - Seconds after `start_time` during which nothing is withdrawable (linear lockup). `0` means no cliff.
-   `end_time`: `u64` - The Unix timestamp marking the end of the stream.
-   `status`: `StreamStatus` - The current status of the stream.

### `StreamStatus`

An enum representing the possible states of a payment stream.

-   `Active`: The stream is currently in progress and funds are vesting.
-   `Paused`: The stream has been temporarily halted by the sender.
-   `Canceled`: The stream has been permanently stopped by the sender.
-   `Completed`: The stream has concluded, either by reaching its end time or by the recipient withdrawing the full amount.

## Functions

### `initialize(env: Env, admin: Address)`

Initializes the contract by setting the administrative address and a counter for streams.

-   `env`: The contract environment.
-   `admin`: The `Address` to be designated as the contract administrator.

### `create_stream(...) -> u64`

Creates a new payment stream with the specified parameters.

-   `env`: The contract environment.
-   `sender`: `Address` - The account funding the stream.
-   `recipient`: `Address` - The account that will receive the funds.
-   `token`: `Address` - The token to be streamed.
-   `total_amount`: `i128` - The total amount to be streamed.
-   `start_time`: `u64` - The timestamp when the stream begins.
-   `end_time`: `u64` - The timestamp when the stream ends.
-   Returns: A `u64` representing the unique ID of the newly created stream.

### `create_stream_with_cliff(env: Env, sender: Address, recipient: Address, token: Address, total_amount: i128, initial_amount: i128, start_time: u64, end_time: u64, cliff_duration: u64) -> u64`

Creates a new payment stream with a cliff (linear lockup) period.

-   `env`: The contract environment.
-   `sender`: `Address` - The account funding the stream.
-   `recipient`: `Address` - The account that will receive the funds.
-   `token`: `Address` - The token to be streamed.
-   `total_amount`: `i128` - The total amount to be streamed.
-   `initial_amount`: `i128` - The amount transferred to the escrow on creation.
-   `start_time`: `u64` - The timestamp when vesting begins.
-   `end_time`: `u64` - The timestamp when vesting completes.
-   `cliff_duration`: `u64` - Seconds after `start_time` during which nothing is withdrawable. Must be strictly shorter than `end_time - start_time`.
-   Returns: A `u64` representing the unique ID of the newly created stream.

> **Cliff semantics:** no tokens are withdrawable until `cliff_duration` seconds after `start_time`. Once the cliff passes, tokens vest linearly across the whole `[start_time, end_time]` window, so the pro-rata share accrued during the cliff becomes claimable immediately at the cliff boundary.

### `get_stream(env: Env, stream_id: u64) -> Option<Stream>`

Retrieves the details of a specific stream by its ID.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream to query.
-   Returns: An `Option<Stream>` with the stream's data if found.

### `withdrawable_amount(env: Env, stream_id: u64) -> i128`

Calculates the amount of tokens that are currently available for the recipient to withdraw based on the elapsed time.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream.
-   Returns: An `i128` indicating the vested amount that has not yet been withdrawn.

### `withdraw(env: Env, stream_id: u64, amount: i128)`

Allows the recipient to withdraw a specified `amount` from their vested balance in the stream.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream.
-   `amount`: `i128` - The amount the recipient wishes to withdraw.
-   **Note**: The actual token transfer logic is marked as `TODO` and needs to be implemented.

### `pause_stream(env: Env, stream_id: u64)`

Allows the `sender` to pause an `Active` stream.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream to pause.

### `resume_stream(env: Env, stream_id: u64)`

Allows the `sender` to resume a `Paused` stream, setting its status back to `Active`.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream to resume.

### `cancel_stream(env: Env, stream_id: u64)`

Allows the `sender` to permanently cancel a stream that is either `Active` or `Paused`.

-   `env`: The contract environment.
-   `stream_id`: `u64` - The ID of the stream to cancel.
-   **Note**: The logic to return the remaining (unvested) tokens to the sender is marked as `TODO` and needs to be implemented.

#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env};

/// Persistent/instance storage keys.
///
/// Using an enum instead of ad-hoc `Symbol::new()` strings and tuple keys
/// keeps the ledger footprint small: each variant is a compact XDR value
/// rather than a dynamically constructed string, which reduces both the
/// per-entry key size and the CPU cost of building keys on every call.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    StreamCount,
    FeeCollector,
    FeeRate,
    ProtocolMetrics,
    Stream(u64),
    Metrics(u64),
    Delegate(u64),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Current lifecycle state of a payment stream.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamStatus {
    /// Stream is open and tokens are vesting linearly.
    Active,
    /// Stream has been paused by the sender; vesting is suspended.
    Paused,
    /// Stream was canceled by the sender; remaining balance refunded.
    Canceled,
    /// All tokens have been withdrawn; stream is fully settled.
    Completed,
}

/// Core payment stream record stored on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Stream {
    /// Unique numeric identifier assigned at creation.
    pub id: u64,
    /// Address that created and funds the stream.
    pub sender: Address,
    /// Address entitled to withdraw the vesting tokens.
    pub recipient: Address,
    /// Stellar asset contract address of the streaming token.
    pub token: Address,
    /// Total token amount committed to this stream (hard cap).
    pub total_amount: i128,
    /// Current escrowed balance (deposits minus withdrawals).
    pub balance: i128,
    /// Cumulative amount withdrawn by the recipient.
    pub withdrawn_amount: i128,
    /// Unix timestamp (seconds) at which linear vesting begins.
    pub start_time: u64,
    /// Unix timestamp (seconds) at which vesting ends (extended on pause/resume).
    pub end_time: u64,
    /// Current lifecycle state.
    pub status: StreamStatus,
    /// Ledger timestamp when the stream was most recently paused, if applicable.
    pub paused_at: Option<u64>,
    /// Total accumulated pause duration in seconds.
    pub total_paused_duration: u64,
}

/// Per-stream activity and delegation metrics.
#[contracttype]
#[derive(Clone)]
pub struct StreamMetrics {
    /// Timestamp of the last state-mutating operation on this stream.
    pub last_activity: u64,
    /// Cumulative tokens withdrawn from this stream.
    pub total_withdrawn: i128,
    /// Number of individual withdrawal operations.
    pub withdrawal_count: u32,
    /// Number of times the stream has been paused.
    pub pause_count: u32,
    /// Total number of delegation assignments (including overwrites).
    pub total_delegations: u32,
    /// Current delegate address, if one is active.
    pub current_delegate: Option<Address>,
    /// Timestamp of the most recent delegation change.
    pub last_delegation_time: u64,
}

/// Protocol-wide aggregate metrics.
#[contracttype]
#[derive(Clone)]
pub struct ProtocolMetrics {
    /// Count of streams currently in the `Active` state.
    pub total_active_streams: u64,
    /// Sum of `total_amount` across all streams ever created.
    pub total_tokens_streamed: i128,
    /// Total number of streams ever created.
    pub total_streams_created: u64,
    /// Total delegation assignments across all streams.
    pub total_delegations: u64,
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Emitted when a protocol fee is collected during a withdrawal.
#[contracttype]
#[derive(Clone)]
pub struct FeeCollectedEvent {
    pub stream_id: u64,
    pub amount: i128,
}

/// Emitted when the sender deposits tokens into an existing stream.
#[contracttype]
#[derive(Clone)]
pub struct StreamDepositEvent {
    pub stream_id: u64,
    pub amount: i128,
}

/// Emitted when a recipient grants withdrawal delegation to another address.
/// Swap-deposit event data — emitted when a cross-asset deposit completes
#[contracttype]
#[derive(Clone)]
pub struct SwapDepositEvent {
    /// The stream that received the deposit
    pub stream_id: u64,
    /// Token sent by the caller (source asset)
    pub from_token: Address,
    /// Amount of source token spent
    pub amount_in: i128,
    /// Amount of stream token credited to the stream
    pub amount_out: i128,
}

/// Delegation granted event data
#[contracttype]
#[derive(Clone)]
pub struct DelegationGrantedEvent {
    pub stream_id: u64,
    pub recipient: Address,
    pub delegate: Address,
}

/// Emitted when a delegation is revoked.
#[contracttype]
#[derive(Clone)]
pub struct DelegationRevokedEvent {
    pub stream_id: u64,
    pub recipient: Address,
}

/// Emitted when a stream is paused.
#[contracttype]
#[derive(Clone)]
pub struct StreamPausedEvent {
    pub stream_id: u64,
    pub paused_at: u64,
}

/// Emitted when a paused stream is resumed.
#[contracttype]
#[derive(Clone)]
pub struct StreamResumedEvent {
    pub stream_id: u64,
    pub resumed_at: u64,
    pub paused_duration: u64,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Exhaustive error enumeration for the payment-stream contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was called on an already-initialised contract.
    AlreadyInitialized = 1,
    /// A function requiring initialisation was called before `initialize`.
    NotInitialized = 2,
    /// The caller does not have the required permission for this action.
    Unauthorized = 3,
    /// A zero or negative monetary amount was supplied where a positive value is required.
    InvalidAmount = 4,
    /// `end_time` is not strictly greater than `start_time`.
    InvalidTimeRange = 5,
    /// No stream exists with the requested ID.
    StreamNotFound = 6,
    /// The operation requires the stream to be in the `Active` state.
    StreamNotActive = 7,
    /// The operation requires the stream to be in the `Paused` state.
    StreamNotPaused = 8,
    /// The stream is not in a cancelable state (`Active` or `Paused`).
    StreamCannotBeCanceled = 9,
    /// The requested withdrawal amount exceeds the currently vested balance.
    InsufficientWithdrawable = 10,
    /// An internal token transfer failed.
    TransferFailed = 11,
    /// The supplied fee rate exceeds the protocol maximum of 500 bps (5 %).
    FeeTooHigh = 12,
    /// The recipient address is invalid for this operation.
    InvalidRecipient = 13,
    /// The deposit would push the stream balance above `total_amount`.
    DepositExceedsTotal = 14,
    /// An intermediate arithmetic value overflowed `i128`.
    ArithmeticOverflow = 15,
    /// A self-delegation attempt was detected (`delegate == recipient`).
    InvalidDelegate = 16,
    /// A reentrant call was detected; the stream or global lock is already held.
    ReentrancyGuard = 17,
    /// Protocol is globally paused by the emergency circuit breaker
    ContractPaused = 17,
    /// Emergency pause is already active
    AlreadyPaused = 18,
    /// Contract is not currently paused
    NotPaused = 19,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum protocol fee: 500 basis points = 5 %.
const MAX_FEE: u32 = 500;
/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PaymentStreamContract;

#[contractimpl]
impl PaymentStreamContract {

    // -----------------------------------------------------------------------
    // Reentrancy guard helpers (private)
    // -----------------------------------------------------------------------

    /// Acquire a per-stream reentrancy lock stored in temporary storage.
    ///
    /// Must be called at the top of every state-mutating function before any
    /// reads or writes.  The lock is keyed by `(stream_id, "lock")` so
    /// independent streams never block each other.
    ///
    /// # Errors
    /// * [`Error::ReentrancyGuard`] — the lock is already held, indicating
    ///   a reentrant call attempt (e.g. a malicious token contract calling
    ///   back into this contract during a `transfer`).
    fn acquire_stream_lock(env: &Env, stream_id: u64) {
        let key = (stream_id, Symbol::new(env, "lock"));
        if env.storage().temporary().get::<_, bool>(&key).unwrap_or(false) {
            panic_with_error!(env, Error::ReentrancyGuard);
        }
        env.storage().temporary().set(&key, &true);
    }

    /// Release the per-stream reentrancy lock.
    ///
    /// Must be called at the end of every function that called
    /// [`acquire_stream_lock`].  Removing the entry is cheaper than setting
    /// it to `false` and avoids leaving stale state.
    fn release_stream_lock(env: &Env, stream_id: u64) {
        let key = (stream_id, Symbol::new(env, "lock"));
        env.storage().temporary().remove(&key);
    }

    /// Acquire the global reentrancy lock for non-stream operations.
    ///
    /// Used by admin functions that mutate instance storage without a
    /// stream-scoped context.
    ///
    /// # Errors
    /// * [`Error::ReentrancyGuard`] — the global lock is already held.
    fn acquire_global_lock(env: &Env) {
        let key = Symbol::new(env, "g_lock");
        if env.storage().temporary().get::<_, bool>(&key).unwrap_or(false) {
            panic_with_error!(env, Error::ReentrancyGuard);
        }
        env.storage().temporary().set(&key, &true);
    }

    /// Release the global reentrancy lock.
    fn release_global_lock(env: &Env) {
        let key = Symbol::new(env, "g_lock");
        env.storage().temporary().remove(&key);
    }

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the contract.
    ///
    /// Must be called exactly once before any other function.
    ///
    /// # Arguments
    /// * `admin`            — Address authorised to update protocol parameters.
    /// * `fee_collector`    — Address that receives the protocol fee on each
    ///   successful withdrawal.
    /// * `general_fee_rate` — Protocol fee in basis points (1 bp = 0.01 %).
    ///   Maximum accepted value: **500** (5 %).
    ///
    /// # Errors
    /// * [`Error::AlreadyInitialized`] — if called a second time.
    /// * [`Error::FeeTooHigh`]         — if `general_fee_rate > 500`.
    pub fn initialize(env: Env, admin: Address, fee_collector: Address, general_fee_rate: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if general_fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "stream_count"), &0u64);
        env.storage().instance().set(&Symbol::new(&env, "fee_collector"), &fee_collector);
        env.storage().instance().set(&Symbol::new(&env, "general_protocol_fee_rate"), &general_fee_rate);

        let initial_metrics = ProtocolMetrics {
            total_active_streams: 0,
            total_tokens_streamed: 0,
            total_streams_created: 0,
            total_delegations: 0,
        };
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &initial_metrics);

        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Emergency pause circuit breaker
    // -----------------------------------------------------------------------

    /// Internal guard: panics with `ContractPaused` when the global emergency
    /// pause flag is active.  Call this at the top of every state-mutating
    /// entry point that should be halted during an incident.
    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "paused"))
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, Error::ContractPaused);
        }
    }

    /// Activate the global emergency pause switch.
    ///
    /// When active, all calls to `create_stream`, `deposit`, `withdraw`, and
    /// `withdraw_max` will be rejected with `Error::ContractPaused`.
    /// Admin-only operations (fee management, pause/unpause) remain available.
    ///
    /// # Authorization
    /// Requires the stored admin address to sign this transaction.
    ///
    /// # Errors
    /// - `Error::Unauthorized` – caller is not admin.
    /// - `Error::AlreadyPaused` – the circuit breaker is already active.
    pub fn emergency_pause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let already_paused: bool = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "paused"))
            .unwrap_or(false);
        if already_paused {
            panic_with_error!(&env, Error::AlreadyPaused);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "paused"), &true);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let now = env.ledger().timestamp();
        env.events().publish(
            ("EmergencyPaused",),
            EmergencyPausedEvent {
                paused_by: admin,
                paused_at: now,
            },
        );
    }

    /// Deactivate the global emergency pause switch, resuming normal operation.
    ///
    /// # Authorization
    /// Requires the stored admin address to sign this transaction.
    ///
    /// # Errors
    /// - `Error::Unauthorized` – caller is not admin.
    /// - `Error::NotPaused` – the circuit breaker is not currently active.
    pub fn emergency_unpause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let paused: bool = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "paused"))
            .unwrap_or(false);
        if !paused {
            panic_with_error!(&env, Error::NotPaused);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "paused"), &false);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let now = env.ledger().timestamp();
        env.events().publish(
            ("EmergencyUnpaused",),
            EmergencyUnpausedEvent {
                unpaused_by: admin,
                unpaused_at: now,
            },
        );
    }

    /// Returns `true` when the global emergency pause is active.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "paused"))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Core stream operations
    // -----------------------------------------------------------------------

    /// Create a new payment stream
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        initial_amount: i128,
        start_time: u64,
        end_time: u64,
    ) -> u64 {
        Self::assert_not_paused(&env);
        sender.require_auth();
        Self::require_not_paused(&env);

        if total_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if initial_amount < 0 || initial_amount > total_amount {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if end_time <= start_time {
            panic_with_error!(&env, Error::InvalidTimeRange);
        }

        // Determine stream_id before acquiring the lock so the key is known.
        let mut stream_count: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "stream_count"))
            .unwrap_or(0);
        let stream_id = stream_count + 1;
        stream_count += 1;
        env.storage().instance().set(&DataKey::StreamCount, &stream_count);

        // Acquire per-stream reentrancy guard before state mutation and token transfer.
        Self::acquire_stream_lock(&env, stream_id);

        let current_time = env.ledger().timestamp();

        let stream = Stream {
            id: stream_id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            total_amount,
            balance: initial_amount,
            withdrawn_amount: 0,
            start_time,
            end_time,
            status: StreamStatus::Active,
            paused_at: None,
            total_paused_duration: 0,
        };

        let stream_metrics = StreamMetrics {
            last_activity: current_time,
            total_withdrawn: 0,
            withdrawal_count: 0,
            pause_count: 0,
            total_delegations: 0,
            current_delegate: None,
            last_delegation_time: 0,
        };

        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &stream_metrics);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut protocol_metrics: ProtocolMetrics = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap_or(ProtocolMetrics {
                total_active_streams: 0,
                total_tokens_streamed: 0,
                total_streams_created: 0,
                total_delegations: 0,
            });

        protocol_metrics.total_active_streams += 1;
        protocol_metrics.total_tokens_streamed += total_amount;
        protocol_metrics.total_streams_created += 1;

        env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        // Cross-contract token transfer — reentrancy vector; guard is held.
        if initial_amount > 0 {
            let token_client = token::Client::new(&env, &token);
            token_client.transfer(&sender, &env.current_contract_address(), &initial_amount);
        }

        // Release guard after all state mutations and transfers are complete.
        Self::release_stream_lock(&env, stream_id);

        stream_id
    }

    /// Deposit additional tokens into an existing stream.
    ///
    /// Only the stream `sender` may deposit.  The stream must not be
    /// `Canceled` or `Completed`.  The resulting balance must not exceed
    /// `total_amount`.
    ///
    /// A reentrancy guard is held for the duration of the token transfer.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    /// * `amount`    — Positive token amount to deposit.
    ///
    /// # Errors
    /// * [`Error::StreamNotActive`]   — stream is `Canceled` or `Completed`.
    /// * [`Error::InvalidAmount`]     — `amount ≤ 0`.
    /// * [`Error::DepositExceedsTotal`] — deposit would exceed `total_amount`.
    /// * [`Error::ArithmeticOverflow`]  — internal overflow guard.
    /// * [`Error::ReentrancyGuard`]   — reentrant call detected.
    pub fn deposit(env: Env, stream_id: u64, amount: i128) {
        // Acquire per-stream reentrancy guard.
        Self::acquire_stream_lock(&env, stream_id);

        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        if matches!(stream.status, StreamStatus::Canceled | StreamStatus::Completed) {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::StreamNotActive);
        }

        stream.sender.require_auth();
        Self::require_not_paused(&env);

        if amount <= 0 {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let new_balance = stream
            .balance
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        if new_balance > stream.total_amount {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::DepositExceedsTotal);
        }

        // Cross-contract transfer — reentrancy vector; guard is held.
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&stream.sender, &env.current_contract_address(), &amount);

        stream.balance = new_balance;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(("StreamDeposit", stream_id), StreamDepositEvent { stream_id, amount });

        Self::release_stream_lock(&env, stream_id);
    }

    /// Withdraw a specific amount from a vested stream.
    ///
    /// The caller must be either the stream recipient or the current delegate.
    /// A protocol fee is deducted from the gross amount and forwarded to the
    /// fee collector; the net amount is sent to the recipient.
    ///
    /// State is updated (check-effects) before token transfers to mitigate
    /// reentrancy.  An explicit per-stream reentrancy guard provides a
    /// second line of defence against malicious token contracts.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    /// * `amount`    — Positive token amount to withdraw (must be ≤ vested
    ///   balance).
    ///
    /// # Errors
    /// * [`Error::InsufficientWithdrawable`] — `amount` exceeds available or
    ///   is non-positive.
    /// * [`Error::ReentrancyGuard`]           — reentrant call detected.
    pub fn withdraw(env: Env, stream_id: u64, amount: i128) {
        // Acquire per-stream reentrancy guard before any state access.
        Self::acquire_stream_lock(&env, stream_id);

    }

    /// Deposit by first swapping a source asset into the stream token via the Stellar DEX.
    ///
    /// This enables **atomic cross-asset deposits**: the caller pays in any asset that has a
    /// DEX path to the stream token, and the converted amount is credited to the stream in a
    /// single transaction.
    ///
    /// ## Flow
    /// 1. Caller authorises the call as `stream.sender`.
    /// 2. `amount_in` of `from_token` is pulled from the sender into this contract.
    /// 3. A strict-send path-payment is executed via the configured DEX router:
    ///    `from_token --[swap_path]--> stream.token`.
    /// 4. The actual `stream.token` amount received is validated against `min_amount_out`.
    /// 5. The validated amount is credited to `stream.balance`.
    ///
    /// ## Arguments
    /// * `stream_id`      – Target stream (must be Active or Paused).
    /// * `from_token`     – Asset the caller is spending (e.g. XLM native).
    /// * `amount_in`      – Exact amount of `from_token` to spend.
    /// * `min_amount_out` – Minimum acceptable `stream.token` amount (slippage guard).
    /// * `swap_path`      – Ordered intermediate asset addresses (may be empty for a direct pair).
    ///
    /// ## Errors
    /// | Code | Meaning |
    /// |------|---------|
    /// | `StreamNotActive`     | Stream is Canceled or Completed. |
    /// | `InvalidAmount`       | `amount_in` or `min_amount_out` ≤ 0. |
    /// | `InvalidSwapPath`     | `from_token` == `stream.token`; use `deposit()` instead. |
    /// | `DepositExceedsTotal` | Swap output would exceed `stream.total_amount`. |
    /// | `SlippageExceeded`    | DEX returned fewer tokens than `min_amount_out`. |
    /// | `SwapFailed`          | Internal arithmetic failure post-swap. |
    pub fn deposit_with_swap(
        env: Env,
        stream_id: u64,
        from_token: Address,
        amount_in: i128,
        min_amount_out: i128,
        swap_path: Vec<Address>,
    ) {
        // 1. Load stream and validate status
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        if matches!(stream.status, StreamStatus::Canceled | StreamStatus::Completed) {
            panic_with_error!(&env, Error::StreamNotActive);
        }

        // 2. Authorisation – only the stream sender may top-up via swap
        stream.sender.require_auth();

        // 3. Parameter validation
        if amount_in <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if min_amount_out <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        // Caller must actually be swapping a different asset; same-token use deposit()
        if from_token == stream.token {
            panic_with_error!(&env, Error::InvalidSwapPath);
        }

        let contract_addr = env.current_contract_address();

        // 4. Pull source tokens from sender into this contract so the DEX
        //    router can deduct them from `contract_addr`.
        let from_client = token::Client::new(&env, &from_token);
        from_client.transfer(&stream.sender, &contract_addr, &amount_in);

        // 5. Snapshot stream-token balance before the swap for delta accounting.
        let stream_token_client = token::Client::new(&env, &stream.token);
        let balance_before = stream_token_client.balance(&contract_addr);

        // 6. Build the full path: from_token -> ...swap_path... -> stream.token
        //
        //    The router's `swap_exact_tokens_for_tokens` expects a complete
        //    path vector where index 0 is the source and the last index is the
        //    destination.  We prepend `from_token` and append `stream.token`
        //    around any caller-supplied intermediate hops.
        let mut full_path: Vec<Address> = Vec::new(&env);
        full_path.push_back(from_token.clone());
        for hop in swap_path.iter() {
            full_path.push_back(hop);
        }
        full_path.push_back(stream.token.clone());

        // 7. Invoke the DEX router.
        //
        //    The router address is stored in instance storage under "dex_router".
        //    It must be set by the admin via `set_dex_router` before this
        //    function can be used.  If not configured the call will panic.
        let dex_router: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "dex_router"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::SwapFailed));

        let router = DexRouterClient::new(&env, &dex_router);
        let amounts_out = router.swap_exact_tokens_for_tokens(
            &amount_in,
            &min_amount_out,
            &full_path,
            &contract_addr, // output tokens come back to this contract
        );

        // 8. Determine actual tokens received via balance delta (defensive double-check).
        let balance_after = stream_token_client.balance(&contract_addr);
        let actual_received = balance_after
            .checked_sub(balance_before)
            .unwrap_or_else(|| panic_with_error!(&env, Error::SwapFailed));

        // Also verify against the router's own reported output.
        let reported_out = amounts_out.last().unwrap_or(0);
        let _ = reported_out; // used implicitly through slippage guard below

        if actual_received < min_amount_out {
            panic_with_error!(&env, Error::SlippageExceeded);
        }

        // 9. Validate stream capacity
        let new_balance = stream
            .balance
            .checked_add(actual_received)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        if new_balance > stream.total_amount {
            panic_with_error!(&env, Error::DepositExceedsTotal);
        }

        // 10. Persist updated stream state
        stream.balance = new_balance;
        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // 11. Update stream metrics
        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(
            &(stream_id, Symbol::new(&env, "metrics")),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );

        // 12. Emit events
        //
        // `SwapDeposit` carries swap-specific details for indexers.
        // `StreamDeposit` is also emitted so existing listeners remain compatible.
        env.events().publish(
            ("SwapDeposit", stream_id),
            SwapDepositEvent {
                stream_id,
                from_token,
                amount_in,
                amount_out: actual_received,
            },
        );
        env.events().publish(
            ("StreamDeposit", stream_id),
            StreamDepositEvent {
                stream_id,
                amount: actual_received,
            },
        );
    }

    /// Register the DEX router contract address (admin only).
    ///
    /// Must be called once before `deposit_with_swap` can be used.
    /// The router must implement the `DexRouter` interface
    /// (`swap_exact_tokens_for_tokens`).
    pub fn set_dex_router(env: Env, router: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "dex_router"), &router);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Return the currently configured DEX router address, if any.
    pub fn get_dex_router(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "dex_router"))
    }

    /// Get stream details
    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        match env.storage().persistent().get(&DataKey::Stream(stream_id)) {
            Some(stream) => {
                env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);
                stream
            },
            None => panic_with_error!(&env, Error::StreamNotFound),
        }
    }

    /// Helper function to create default stream metrics
    fn default_stream_metrics(env: &Env) -> StreamMetrics {
        StreamMetrics {
            last_activity: env.ledger().timestamp(),
            total_withdrawn: 0,
            withdrawal_count: 0,
            pause_count: 0,
            total_delegations: 0,
            current_delegate: None,
            last_delegation_time: 0,
        }
    }

    /// Assert that the caller is authorized to withdraw (recipient or delegate).
    fn assert_is_recipient_or_delegate(env: &Env, stream_id: u64) {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        
        // First, check if a delegate is set and try to require auth from them
        let delegate_opt: Option<Address> = env.storage().persistent().get(&DataKey::Delegate(stream_id));
        
        if let Some(delegate) = delegate_opt {
            // If delegate exists, require auth from delegate (they're the one calling)
            delegate.require_auth();
        } else {
            // No delegate, require auth from recipient
            stream.recipient.require_auth();
        }
    }

    /// Set a delegate for withdrawal rights on a stream
    pub fn set_delegate(env: Env, stream_id: u64, delegate: Address) {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        stream.recipient.require_auth();
    
        // Prevent self-delegation
        if delegate == stream.recipient {
            panic_with_error!(&env, Error::InvalidDelegate);
        }

        // Check if there's an existing delegate and emit revocation event
        let delegate_key = DataKey::Delegate(stream_id);
        if let Some(old_delegate) = env.storage().persistent().get::<_, Address>(&delegate_key) {
            if old_delegate != delegate {
                let revoke_event = DelegationRevokedEvent {
                    stream_id,
                    recipient: stream.recipient.clone(),
                };
                env.events().publish(("DelegationRevoked", stream_id), revoke_event);
            }
        }

        let current_time = env.ledger().timestamp();

        // Store delegate
        env.storage().persistent().set(&delegate_key, &delegate);
        env.storage().persistent().extend_ttl(&delegate_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_delegations += 1;
        metrics.current_delegate = Some(delegate.clone());
        metrics.last_delegation_time = current_time;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&DataKey::ProtocolMetrics)
            .unwrap();
        protocol_metrics.total_delegations += 1;
        env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        // Emit event
        let event = DelegationGrantedEvent {
            stream_id,
            recipient: stream.recipient,
            delegate: delegate.clone(),
        };
        env.events().publish(("DelegationGranted", stream_id), event);
    }

    /// Revoke the delegate for a stream
    pub fn revoke_delegate(env: Env, stream_id: u64) {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        stream.recipient.require_auth();

        let delegate_key = DataKey::Delegate(stream_id);
        let had_delegate = env.storage().persistent().has(&delegate_key);

        // Remove delegate
        env.storage().persistent().remove(&delegate_key);

        // Update stream metrics
        if had_delegate {
            let mut metrics: StreamMetrics = env.storage().persistent()
                .get(&DataKey::Metrics(stream_id))
                .unwrap_or_else(|| Self::default_stream_metrics(&env));

            metrics.current_delegate = None;
            metrics.last_activity = env.ledger().timestamp();

            env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
            env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

            // Emit event
            let event = DelegationRevokedEvent {
                stream_id,
                recipient: stream.recipient,
            };
            env.events().publish(("DelegationRevoked", stream_id), event);
        }
    }

    /// Get the delegate for a stream
    pub fn get_delegate(env: Env, stream_id: u64) -> Option<Address> {
        // Ensure stream exists
        Self::get_stream(env.clone(), stream_id);
        env.storage().persistent().get(&DataKey::Delegate(stream_id))
    }

    /// Calculate the protocol fee for a given amount
    fn calculate_protocol_fee(env: &Env, amount: i128) -> i128 {
        let fee_rate: u32 = env.storage().instance().get(&DataKey::FeeRate).unwrap_or(0);

        if fee_rate == 0 || amount <= 0 {
            return 0;
        }

        // fee = (amount * fee_rate) / 10000
        // Split calculation to avoid overflow while preserving precision
        let rate = fee_rate as i128;
        let fee = (amount / 10000) * rate + ((amount % 10000) * rate) / 10000;
        fee.max(0)
    }

    /// Calculate withdrawable amount for a stream
    pub fn withdrawable_amount(env: Env, stream_id: u64) -> i128 {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);

        // Paused streams have no withdrawable amount
        if stream.status == StreamStatus::Paused {
            return 0;
        }

        // Only active streams can have withdrawable amounts
        if stream.status != StreamStatus::Active {
            return 0;
        }

        let current_time = env.ledger().timestamp();

        if current_time <= stream.start_time {
            return 0;
        }

        // Calculate effective elapsed time (excluding paused duration)
        let raw_elapsed = if current_time >= stream.end_time {
            stream.end_time - stream.start_time
        } else {
            current_time - stream.start_time
        };

        // Subtract the total paused duration from elapsed time
        let elapsed = raw_elapsed.saturating_sub(stream.total_paused_duration);

        let duration = (stream.end_time - stream.start_time).saturating_sub(stream.total_paused_duration);
        if duration == 0 {
            return 0;
        }

        let vested = (stream.total_amount * elapsed as i128) / duration as i128;

        vested - stream.withdrawn_amount
    }

    /// Withdraw from a stream
    pub fn withdraw(env: Env, stream_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        Self::assert_is_recipient_or_delegate(&env, stream_id);
        Self::require_not_paused(&env);

        let available = Self::withdrawable_amount(env.clone(), stream_id);
        if amount > available || amount <= 0 {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }

        let fee = Self::calculate_protocol_fee(&env, amount);
        let net_amount = amount - fee;

        // CHECK-EFFECTS: update state before any cross-contract call.
        stream.withdrawn_amount += amount;

        if stream.withdrawn_amount >= stream.total_amount {
            stream.status = StreamStatus::Completed;

            let mut protocol_metrics: ProtocolMetrics = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "protocol_metrics"))
                .unwrap();
            protocol_metrics.total_active_streams =
                protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
        }

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_withdrawn += amount;
        metrics.withdrawal_count += 1;
        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // INTERACTIONS: cross-contract transfers after all state is committed.
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &net_amount);

        if fee > 0 {
            let fee_collector: Address = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "fee_collector"))
                .unwrap();
            token_client.transfer(&env.current_contract_address(), &fee_collector, &fee);
            env.events().publish(("FeeCollected", stream_id), fee);
        }

        // Release guard after all operations complete.
        Self::release_stream_lock(&env, stream_id);
    }

    /// Withdraw the maximum currently vested amount from a stream.
    ///
    /// Equivalent to calling [`withdraw`] with `withdrawable_amount(stream_id)`.
    /// The reentrancy guard is acquired inside [`withdraw`]; no additional
    /// lock is needed here.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    ///
    /// # Errors
    /// * [`Error::InsufficientWithdrawable`] — nothing is currently vested.
    /// * [`Error::ReentrancyGuard`]           — reentrant call detected (via
    ///   [`withdraw`]).
    pub fn withdraw_max(env: Env, stream_id: u64) {
        Self::assert_not_paused(&env);
        let available = Self::withdrawable_amount(env.clone(), stream_id);
        if available <= 0 {
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }
        // Reentrancy protection is enforced inside `withdraw`.
        Self::withdraw(env, stream_id, available);
    }

    /// Pause an active stream (sender only).
    ///
    /// Halts linear vesting; `withdrawable_amount` returns `0` while the
    /// stream is paused.  The pause timestamp is recorded so the paused
    /// duration can be excluded from the vesting calculation on resume.
    ///
    /// A reentrancy guard is held for the full function body.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    ///
    /// # Errors
    /// * [`Error::StreamNotActive`] — stream is not `Active`.
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn pause_stream(env: Env, stream_id: u64) {
        Self::acquire_stream_lock(&env, stream_id);

        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Active {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::StreamNotActive);
        }

        let current_time = env.ledger().timestamp();

        stream.status = StreamStatus::Paused;
        stream.paused_at = Some(current_time);

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.pause_count += 1;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut protocol_metrics: ProtocolMetrics = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_active_streams =
            protocol_metrics.total_active_streams.saturating_sub(1);
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("StreamPaused", stream_id),
            StreamPausedEvent { stream_id, paused_at: current_time },
        );

        Self::release_stream_lock(&env, stream_id);
    }

    /// Resume a paused stream (sender only).
    ///
    /// Restarts linear vesting from where it left off by extending `end_time`
    /// by the duration the stream was paused.  The accumulated paused duration
    /// is added to `total_paused_duration` for future vesting calculations.
    ///
    /// A reentrancy guard is held for the full function body.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    ///
    /// # Errors
    /// * [`Error::StreamNotPaused`] — stream is not `Paused`.
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn resume_stream(env: Env, stream_id: u64) {
        Self::acquire_stream_lock(&env, stream_id);

        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Paused {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::StreamNotPaused);
        }

        let current_time = env.ledger().timestamp();

        let paused_duration = if let Some(paused_at) = stream.paused_at {
            current_time.saturating_sub(paused_at)
        } else {
            0
        };

        stream.total_paused_duration += paused_duration;
        stream.end_time += paused_duration;
        stream.status = StreamStatus::Active;
        stream.paused_at = None;

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = current_time;

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut protocol_metrics: ProtocolMetrics = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_active_streams += 1;
        env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("StreamResumed", stream_id),
            StreamResumedEvent { stream_id, resumed_at: current_time, paused_duration },
        );

        Self::release_stream_lock(&env, stream_id);
    }

    /// Cancel a stream (sender only).
    ///
    /// Transitions an `Active` or `Paused` stream to `Canceled` and refunds
    /// the remaining escrowed balance to the sender.
    ///
    /// State is committed (check-effects) before the refund transfer.  A
    /// per-stream reentrancy guard provides additional protection against
    /// malicious token callbacks.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    ///
    /// # Errors
    /// * [`Error::StreamCannotBeCanceled`] — stream is `Completed` or already
    ///   `Canceled`.
    /// * [`Error::ReentrancyGuard`]        — reentrant call detected.
    pub fn cancel_stream(env: Env, stream_id: u64) {
        Self::acquire_stream_lock(&env, stream_id);

        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Active && stream.status != StreamStatus::Paused {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::StreamCannotBeCanceled);
        }

        let was_active = stream.status == StreamStatus::Active;

        // CHECK-EFFECTS: update state before the refund transfer.
        stream.status = StreamStatus::Canceled;

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        if was_active {
            let mut protocol_metrics: ProtocolMetrics = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "protocol_metrics"))
                .unwrap();
            protocol_metrics.total_active_streams =
                protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
            env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        }

        // INTERACTION: cross-contract refund transfer after state is committed.
        let remaining = (stream.balance - stream.withdrawn_amount).max(0);
        if remaining > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(&env.current_contract_address(), &stream.sender, &remaining);
        }

        Self::release_stream_lock(&env, stream_id);
    }

    // -----------------------------------------------------------------------
    // Delegation
    // -----------------------------------------------------------------------

    /// Grant withdrawal delegation rights to another address.
    ///
    /// Only the stream `recipient` may assign or change the delegate.
    /// Self-delegation (delegate == recipient) is rejected.  If a different
    /// delegate was previously set, a `DelegationRevoked` event is emitted
    /// before the `DelegationGranted` event.
    ///
    /// A per-stream reentrancy guard is held for the full function body.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    /// * `delegate`  — Address to grant withdrawal rights to.
    ///
    /// # Errors
    /// * [`Error::InvalidDelegate`] — `delegate == recipient`.
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn set_delegate(env: Env, stream_id: u64, delegate: Address) {
        Self::acquire_stream_lock(&env, stream_id);
    /// Set the protocol fee rate
    pub fn set_protocol_fee_rate(env: Env, new_fee_rate: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        stream.recipient.require_auth();

        if delegate == stream.recipient {
            Self::release_stream_lock(&env, stream_id);
            panic_with_error!(&env, Error::InvalidDelegate);
        }

        let delegate_key = (stream_id, Symbol::new(&env, "delegate"));
        if let Some(old_delegate) = env.storage().persistent().get::<_, Address>(&delegate_key) {
            if old_delegate != delegate {
                env.events().publish(
                    ("DelegationRevoked", stream_id),
                    DelegationRevokedEvent { stream_id, recipient: stream.recipient.clone() },
                );
            }
        }

        let current_time = env.ledger().timestamp();

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "delegate")), &delegate);
        env.storage().persistent().extend_ttl(
            &(stream_id, Symbol::new(&env, "delegate")),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );

        let mut metrics: StreamMetrics = env
            .storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_delegations += 1;
        metrics.current_delegate = Some(delegate.clone());
        metrics.last_delegation_time = current_time;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        let mut protocol_metrics: ProtocolMetrics = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_delegations += 1;
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("DelegationGranted", stream_id),
            DelegationGrantedEvent { stream_id, recipient: stream.recipient, delegate: delegate.clone() },
        );

        Self::release_stream_lock(&env, stream_id);
    }

    /// Revoke the current delegate for a stream.
    ///
    /// Only the stream `recipient` may revoke delegation.  If no delegate
    /// is set this is a no-op (no event emitted).
    ///
    /// A per-stream reentrancy guard is held for the full function body.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    ///
    /// # Errors
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn revoke_delegate(env: Env, stream_id: u64) {
        Self::acquire_stream_lock(&env, stream_id);

        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        stream.recipient.require_auth();

        let delegate_key = (stream_id, Symbol::new(&env, "delegate"));
        let had_delegate = env.storage().persistent().has(&delegate_key);

        env.storage().persistent().remove(&delegate_key);

        if had_delegate {
            let mut metrics: StreamMetrics = env
                .storage()
                .persistent()
                .get(&(stream_id, Symbol::new(&env, "metrics")))
                .unwrap_or_else(|| Self::default_stream_metrics(&env));

            metrics.current_delegate = None;
            metrics.last_activity = env.ledger().timestamp();

            env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
            env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

            env.events().publish(
                ("DelegationRevoked", stream_id),
                DelegationRevokedEvent { stream_id, recipient: stream.recipient },
            );
        }

        Self::release_stream_lock(&env, stream_id);
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the full [`Stream`] record for the given ID.
    ///
    /// Also bumps the persistent storage TTL for the stream entry.
    ///
    /// # Errors
    /// * [`Error::StreamNotFound`] — no stream with this ID exists.
    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        match env.storage().persistent().get(&stream_id) {
            Some(stream) => {
                env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);
                stream
            }
            None => panic_with_error!(&env, Error::StreamNotFound),
        }
    }

    /// Return the current delegate address for the given stream, or `None`.
    ///
    /// # Errors
    /// * [`Error::StreamNotFound`] — no stream with this ID exists.
    pub fn get_delegate(env: Env, stream_id: u64) -> Option<Address> {
        Self::get_stream(env.clone(), stream_id);
        env.storage().persistent().get(&(stream_id, Symbol::new(&env, "delegate")))
    }

    /// Calculate the amount currently vested and available for withdrawal.
    ///
    /// Returns `0` for `Paused`, `Canceled`, or `Completed` streams, and
    /// before `start_time`.  Excludes the accumulated `total_paused_duration`
    /// from the elapsed time so pauses do not count as vested time.
    ///
    /// # Arguments
    /// * `stream_id` — Target stream.
    pub fn withdrawable_amount(env: Env, stream_id: u64) -> i128 {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);

        if stream.status == StreamStatus::Paused || stream.status != StreamStatus::Active {
            return 0;
        }

        let current_time = env.ledger().timestamp();

        if current_time <= stream.start_time {
            return 0;
        }

        let raw_elapsed = if current_time >= stream.end_time {
            stream.end_time - stream.start_time
        } else {
            current_time - stream.start_time
        };

        let elapsed = raw_elapsed.saturating_sub(stream.total_paused_duration);
        let duration = (stream.end_time - stream.start_time).saturating_sub(stream.total_paused_duration);

        if duration == 0 {
            return 0;
        }

        let vested = (stream.total_amount * elapsed as i128) / duration as i128;
        vested - stream.withdrawn_amount
    }

    /// Return per-stream activity and delegation metrics.
    ///
    /// Returns default-initialised metrics if none are stored yet.
    ///
    /// # Errors
    /// * [`Error::StreamNotFound`] — no stream with this ID exists.
    pub fn get_stream_metrics(env: Env, stream_id: u64) -> StreamMetrics {
        Self::get_stream(env.clone(), stream_id);
        env.storage()
            .persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env))
    }

    /// Return protocol-wide aggregate metrics.
    pub fn get_protocol_metrics(env: Env) -> ProtocolMetrics {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap_or(ProtocolMetrics {
                total_active_streams: 0,
                total_tokens_streamed: 0,
                total_streams_created: 0,
                total_delegations: 0,
            })
    }

    /// Return the current protocol fee rate in basis points.
    pub fn get_protocol_fee_rate(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "general_protocol_fee_rate"))
            .unwrap_or(0)
    }

    /// Return the current fee collector address.
    pub fn get_fee_collector(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "fee_collector"))
            .unwrap()
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// Update the protocol fee rate (basis points, max 500 = 5 %).
    ///
    /// Only the admin may call this.  A global reentrancy guard prevents
    /// concurrent mutation of the fee rate.
    ///
    /// # Arguments
    /// * `new_fee_rate` — New fee rate in basis points.
    ///
    /// # Errors
    /// * [`Error::FeeTooHigh`]      — `new_fee_rate > 500`.
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn set_protocol_fee_rate(env: Env, new_fee_rate: u32) {
        Self::acquire_global_lock(&env);

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        admin.require_auth();

        if new_fee_rate > MAX_FEE {
            Self::release_global_lock(&env);
            panic_with_error!(&env, Error::FeeTooHigh);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "general_protocol_fee_rate"), &new_fee_rate);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        Self::release_global_lock(&env);
    }

    /// Update the fee collector address.
    ///
    /// Only the admin may call this.  A global reentrancy guard prevents
    /// concurrent mutation of the fee collector.
    ///
    /// # Arguments
    /// * `new_fee_collector` — Address that will receive future protocol fees.
    ///
    /// # Errors
    /// * [`Error::ReentrancyGuard`] — reentrant call detected.
    pub fn set_fee_collector(env: Env, new_fee_collector: Address) {
        Self::acquire_global_lock(&env);

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        admin.require_auth();

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "fee_collector"), &new_fee_collector);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        Self::release_global_lock(&env);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Assert that the caller is authorised to withdraw — either the stream
    /// recipient or the current delegate.
    fn assert_is_recipient_or_delegate(env: &Env, stream_id: u64) {
        let stream: Stream = Self::get_stream(env.clone(), stream_id);
        let delegate_opt: Option<Address> =
            env.storage().persistent().get(&(stream_id, Symbol::new(env, "delegate")));

        if let Some(delegate) = delegate_opt {
            delegate.require_auth();
        } else {
            stream.recipient.require_auth();
        }
    }

    /// Return a zero-initialised [`StreamMetrics`] anchored to the current
    /// ledger timestamp.
    fn default_stream_metrics(env: &Env) -> StreamMetrics {
        StreamMetrics {
            last_activity: env.ledger().timestamp(),
            total_withdrawn: 0,
            withdrawal_count: 0,
            pause_count: 0,
            total_delegations: 0,
            current_delegate: None,
            last_delegation_time: 0,
        }
    }

    /// Compute the protocol fee for `amount` using the stored fee rate.
    ///
    /// Uses a split-calculation to preserve precision without overflow.
    fn calculate_protocol_fee(env: &Env, amount: i128) -> i128 {
        let fee_rate: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "general_protocol_fee_rate"))
            .unwrap_or(0);

        if fee_rate == 0 || amount <= 0 {
            return 0;
        }

        let rate = fee_rate as i128;
        let fee = (amount / 10_000) * rate + ((amount % 10_000) * rate) / 10_000;
        fee.max(0)
    }
}

mod test;

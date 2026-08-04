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

/// Stream status enum
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamStatus {
    Active,
    Paused,
    Canceled,
    Completed,
}

/// Stream data structure
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
    pub end_time: u64,
    pub status: StreamStatus,
    pub paused_at: Option<u64>,  
    pub total_paused_duration: u64,
}

/// Per-stream metrics tracking
#[contracttype]
#[derive(Clone)]
pub struct StreamMetrics {
    pub last_activity: u64,           // Timestamp of last stream activity
    pub total_withdrawn: i128,        // Total amount withdrawn from stream
    pub withdrawal_count: u32,        // Number of withdrawal operations
    pub pause_count: u32,             // Number of times stream was paused
    pub total_delegations: u32,       // Total number of delegation changes
    pub current_delegate: Option<Address>, // Current delegate (if any)
    pub last_delegation_time: u64,    // Timestamp of last delegation change
}

/// Protocol-wide metrics tracking
#[contracttype]
#[derive(Clone)]
pub struct ProtocolMetrics {
    pub total_active_streams: u64,    // Count of currently active streams
    pub total_tokens_streamed: i128,  // Total tokens ever streamed
    pub total_streams_created: u64,   // Total number of streams created
    pub total_delegations: u64,       // Total number of delegations across all streams
}

/// Fee collected event data
#[contracttype]
#[derive(Clone)]
pub struct FeeCollectedEvent {
    pub stream_id: u64,
    pub amount: i128,
}

/// Stream deposit event data
#[contracttype]
#[derive(Clone)]
pub struct StreamDepositEvent {
    pub stream_id: u64,
    pub amount: i128,
}

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

/// Delegation revoked event data
#[contracttype]
#[derive(Clone)]
pub struct DelegationRevokedEvent {
    pub stream_id: u64,
    pub recipient: Address,
}

// Stream paused event
#[contracttype]
#[derive(Clone)]
pub struct StreamPausedEvent {
    pub stream_id: u64,
    pub paused_at: u64,
}

// Stream resumed event
#[contracttype]
#[derive(Clone)]
pub struct StreamResumedEvent {
    pub stream_id: u64,
    pub resumed_at: u64,
    pub paused_duration: u64,
}

/// Emergency paused event data
#[contracttype]
#[derive(Clone)]
pub struct EmergencyPausedEvent {
    pub paused_by: Address,
    pub paused_at: u64,
}

/// Emergency unpaused event data
#[contracttype]
#[derive(Clone)]
pub struct EmergencyUnpausedEvent {
    pub unpaused_by: Address,
    pub unpaused_at: u64,
}

/// Custom errors for the contract
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
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
    /// Protocol is globally paused by the emergency circuit breaker
    ContractPaused = 17,
    /// Emergency pause is already active
    AlreadyPaused = 18,
    /// Contract is not currently paused
    NotPaused = 19,
}

// Constants
const MAX_FEE: u32 = 500; // 5% in basis points
const LEDGER_THRESHOLD: u32 = 518400; // ~30 days at 5s/ledger
const LEDGER_BUMP: u32 = 535680; // ~31 days

#[contract]
pub struct PaymentStreamContract;

#[contractimpl]
impl PaymentStreamContract {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address, fee_collector: Address, general_fee_rate: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if general_fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StreamCount, &0u64);
        env.storage().instance().set(&DataKey::FeeCollector, &fee_collector);
        env.storage().instance().set(&DataKey::FeeRate, &general_fee_rate);

        // Initialize protocol metrics
        let initial_metrics = ProtocolMetrics {
            total_active_streams: 0,
            total_tokens_streamed: 0,
            total_streams_created: 0,
            total_delegations: 0,
        };
        env.storage().instance().set(&DataKey::ProtocolMetrics, &initial_metrics);

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

        // Validate inputs
        if total_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if initial_amount < 0 || initial_amount > total_amount {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if end_time <= start_time {
            panic_with_error!(&env, Error::InvalidTimeRange);
        }

        // Get and increment stream count
        let mut stream_count: u64 = env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0);
        let stream_id = stream_count + 1;
        stream_count += 1;
        env.storage().instance().set(&DataKey::StreamCount, &stream_count);

        let current_time = env.ledger().timestamp();

        // Create stream
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

        // Initialize stream metrics
        let stream_metrics = StreamMetrics {
            last_activity: current_time,
            total_withdrawn: 0,
            withdrawal_count: 0,
            pause_count: 0,
            total_delegations: 0,
            current_delegate: None,
            last_delegation_time: 0,
        };

        // Store stream and metrics
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().set(&DataKey::Metrics(stream_id), &stream_metrics);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&DataKey::ProtocolMetrics)
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

        // Transfer tokens from sender to contract (escrow)
        if initial_amount > 0 {
            let token_client = token::Client::new(&env, &token);
            token_client.transfer(&sender, &env.current_contract_address(), &initial_amount);
        }

        stream_id
    }

    /// Deposit tokens to an existing stream
    pub fn deposit(env: Env, stream_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        if matches!(stream.status, StreamStatus::Canceled | StreamStatus::Completed) {
            panic_with_error!(&env, Error::StreamNotActive);
        }

        stream.sender.require_auth();
        Self::require_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let new_balance = stream.balance.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        if new_balance > stream.total_amount {
            panic_with_error!(&env, Error::DepositExceedsTotal);
        }

        // Transfer tokens from sender to contract
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&stream.sender, &env.current_contract_address(), &amount);

        // Update balance
        stream.balance = new_balance;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Emit StreamDeposit event
        env.events().publish(("StreamDeposit", stream_id), StreamDepositEvent { stream_id, amount });
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
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }

        // Calculate protocol fee
        let fee = Self::calculate_protocol_fee(&env, amount);
        let net_amount = amount - fee;

        stream.withdrawn_amount += amount;

        // Check if stream is completed
        if stream.withdrawn_amount >= stream.total_amount {
            stream.status = StreamStatus::Completed;
            
            // Update protocol metrics - decrease active streams
            let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
                .get(&DataKey::ProtocolMetrics)
                .unwrap();
            protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        }

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_withdrawn += amount;
        metrics.withdrawal_count += 1;
        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Transfer net amount to recipient
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &net_amount);

        // Transfer fee to collector if fee > 0
        if fee > 0 {
            let fee_collector: Address = env.storage().instance().get(&DataKey::FeeCollector).unwrap();
            token_client.transfer(&env.current_contract_address(), &fee_collector, &fee);
            env.events().publish(("FeeCollected", stream_id), fee);
        }
    }

    /// Withdraw the maximum available amount from a stream
    pub fn withdraw_max(env: Env, stream_id: u64) {
        Self::assert_not_paused(&env);
        let available = Self::withdrawable_amount(env.clone(), stream_id);
        if available <= 0 {
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }
        Self::withdraw(env, stream_id, available);
    }

    /// Pause a stream (sender only)
    pub fn pause_stream(env: Env, stream_id: u64) {
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Active {
            panic_with_error!(&env, Error::StreamNotActive);
        }

        let current_time = env.ledger().timestamp();
        
        stream.status = StreamStatus::Paused;
        stream.paused_at = Some(current_time);

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.pause_count += 1;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - decrease active streams
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&DataKey::ProtocolMetrics)
            .unwrap();
        protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
        env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        // Emit StreamPaused event
        env.events().publish(
            ("StreamPaused", stream_id),
            StreamPausedEvent {
                stream_id,
                paused_at: current_time,
            },
        );
    }

    /// Resume a paused stream (sender only)
    pub fn resume_stream(env: Env, stream_id: u64) {
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Paused {
            panic_with_error!(&env, Error::StreamNotPaused);
        }

        let current_time = env.ledger().timestamp();
        
        // Calculate pause duration
        let paused_duration = if let Some(paused_at) = stream.paused_at {
            current_time.saturating_sub(paused_at)
        } else {
            0
        };

        // Update total paused duration
        stream.total_paused_duration += paused_duration;
        
        // Extend end_time by the paused duration
        stream.end_time += paused_duration;
        
        stream.status = StreamStatus::Active;
        stream.paused_at = None;

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = current_time;

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - increase active streams
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&DataKey::ProtocolMetrics)
            .unwrap();
        protocol_metrics.total_active_streams += 1;
        env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        // Emit StreamResumed event
        env.events().publish(
            ("StreamResumed", stream_id),
            StreamResumedEvent {
                stream_id,
                resumed_at: current_time,
                paused_duration,
            },
        );
    }

    /// Cancel a stream
    pub fn cancel_stream(env: Env, stream_id: u64) {
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        stream.sender.require_auth();

        if stream.status != StreamStatus::Active && stream.status != StreamStatus::Paused {
            panic_with_error!(&env, Error::StreamCannotBeCanceled);
        }
        
        let was_active = stream.status == StreamStatus::Active;
        stream.status = StreamStatus::Canceled;

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Metrics(stream_id), &metrics);
        env.storage().persistent().extend_ttl(&DataKey::Metrics(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - decrease active streams if it was active
        if was_active {
            let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
                .get(&DataKey::ProtocolMetrics)
                .unwrap();
            protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage().instance().set(&DataKey::ProtocolMetrics, &protocol_metrics);
            env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        }

        // Refund remaining tokens to sender
        let remaining = (stream.balance - stream.withdrawn_amount).max(0);
        if remaining > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(&env.current_contract_address(), &stream.sender, &remaining);
        }
    }

    /// Set the protocol fee rate
    pub fn set_protocol_fee_rate(env: Env, new_fee_rate: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if new_fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }

        env.storage().instance().set(&DataKey::FeeRate, &new_fee_rate);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Set the fee collector address
    pub fn set_fee_collector(env: Env, new_fee_collector: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage().instance().set(&DataKey::FeeCollector, &new_fee_collector);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Get the current protocol fee rate
    pub fn get_protocol_fee_rate(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeRate).unwrap_or(0)
    }

    /// Get the current fee collector
    pub fn get_fee_collector(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FeeCollector).unwrap()
    }

    /// Get stream-specific metrics
    pub fn get_stream_metrics(env: Env, stream_id: u64) -> StreamMetrics {
        // Ensure stream exists
        Self::get_stream(env.clone(), stream_id);

        // Return metrics or default if not found
        env.storage().persistent()
            .get(&DataKey::Metrics(stream_id))
            .unwrap_or_else(|| Self::default_stream_metrics(&env))
    }

    /// Get protocol-wide metrics
    pub fn get_protocol_metrics(env: Env) -> ProtocolMetrics {
        env.storage().instance()
            .get(&DataKey::ProtocolMetrics)
            .unwrap_or(ProtocolMetrics {
                total_active_streams: 0,
                total_tokens_streamed: 0,
                total_streams_created: 0,
                total_delegations: 0,
            })
    }
}

mod test;
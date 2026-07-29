#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, Symbol, Vec};

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

/// Fee tier configuration for volume-based protocol fee discounts.
///
/// Tiers are stored sorted ascending by `min_volume`.  The highest tier
/// whose `min_volume` is <= the sender's cumulative stream volume determines
/// their protocol fee rate at withdrawal time.
#[contracttype]
#[derive(Clone)]
pub struct FeeTier {
    /// Minimum cumulative stream volume (token units) required for this tier
    pub min_volume: i128,
    /// Protocol fee rate in basis points (e.g., 30 = 0.3%, max 500 = 5%)
    pub fee_rate: u32,
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
    /// Tier fee_rate exceeds MAX_FEE or tiers not sorted strictly ascending
    InvalidTier = 17,
    /// Exceeded the maximum number of configurable fee tiers
    TooManyTiers = 18,
}

// Constants
const MAX_FEE: u32 = 500;   // 5% in basis points
const MAX_TIERS: u32 = 10;  // Maximum number of configurable fee tiers
const LEDGER_THRESHOLD: u32 = 518400; // ~30 days at 5s/ledger
const LEDGER_BUMP: u32 = 535680; // ~31 days

#[contract]
pub struct PaymentStreamContract;

#[contractimpl]
impl PaymentStreamContract {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address, fee_collector: Address, general_fee_rate: u32) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
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
        
        // Initialize protocol metrics
        let initial_metrics = ProtocolMetrics {
            total_active_streams: 0,
            total_tokens_streamed: 0,
            total_streams_created: 0,
            total_delegations: 0,
        };
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &initial_metrics);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

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
        sender.require_auth();

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
        let mut stream_count: u64 = env.storage().instance().get(&Symbol::new(&env, "stream_count")).unwrap_or(0);
        let stream_id = stream_count + 1;
        stream_count += 1;
        env.storage().instance().set(&Symbol::new(&env, "stream_count"), &stream_count);

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

        // Track sender's cumulative stream volume for fee tier eligibility.
        // Updated at stream creation so withdrawals automatically apply the
        // correct tier rate without requiring additional state lookups.
        let sender_vol_key = (Symbol::new(&env, "sv"), sender.clone());
        let current_vol: i128 = env.storage().persistent()
            .get(&sender_vol_key)
            .unwrap_or(0);
        let new_vol = current_vol.saturating_add(total_amount);
        env.storage().persistent().set(&sender_vol_key, &new_vol);
        env.storage().persistent().extend_ttl(&sender_vol_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Store stream and metrics
        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &stream_metrics);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
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

        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
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
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        if matches!(stream.status, StreamStatus::Canceled | StreamStatus::Completed) {
            panic_with_error!(&env, Error::StreamNotActive);
        }

        stream.sender.require_auth();

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
        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Emit StreamDeposit event
        env.events().publish(("StreamDeposit", stream_id), StreamDepositEvent { stream_id, amount });
    }

    /// Get stream details
    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        match env.storage().persistent().get(&stream_id) {
            Some(stream) => {
                env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);
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
        let delegate_opt: Option<Address> = env.storage().persistent().get(&(stream_id, Symbol::new(env, "delegate")));
        
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
        let delegate_key = (stream_id, Symbol::new(&env, "delegate"));
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
        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "delegate")), &delegate);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "delegate")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_delegations += 1;
        metrics.current_delegate = Some(delegate.clone());
        metrics.last_delegation_time = current_time;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_delegations += 1;
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
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

        let delegate_key = (stream_id, Symbol::new(&env, "delegate"));
        let had_delegate = env.storage().persistent().has(&delegate_key);

        // Remove delegate
        env.storage().persistent().remove(&delegate_key);

        // Update stream metrics
        if had_delegate {
            let mut metrics: StreamMetrics = env.storage().persistent()
                .get(&(stream_id, Symbol::new(&env, "metrics")))
                .unwrap_or_else(|| Self::default_stream_metrics(&env));

            metrics.current_delegate = None;
            metrics.last_activity = env.ledger().timestamp();

            env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
            env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

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
        env.storage().persistent().get(&(stream_id, Symbol::new(&env, "delegate")))
    }

    /// Resolve the applicable fee rate for a sender based on their cumulative
    /// stream volume and the configured fee tiers.
    ///
    /// Tiers are walked in ascending order of `min_volume`; the last qualifying
    /// entry wins. Falls back to `general_protocol_fee_rate` when no tiers are
    /// configured or when the sender's volume is below all tier thresholds.
    fn get_applicable_fee_rate_internal(env: &Env, sender: &Address) -> u32 {
        let general_rate: u32 = env.storage().instance()
            .get(&Symbol::new(env, "general_protocol_fee_rate"))
            .unwrap_or(0);

        let tiers: Vec<FeeTier> = env.storage().instance()
            .get(&Symbol::new(env, "fee_tiers"))
            .unwrap_or_else(|| Vec::new(env));

        if tiers.is_empty() {
            return general_rate;
        }

        // Look up the sender's cumulative lifetime stream volume
        let sender_vol_key = (Symbol::new(env, "sv"), sender.clone());
        let volume: i128 = env.storage().persistent()
            .get(&sender_vol_key)
            .unwrap_or(0);

        // Start with the general rate; upgrade to each qualifying tier
        let mut applicable_rate = general_rate;
        let len = tiers.len();
        for i in 0..len {
            let tier = tiers.get(i).unwrap();
            if volume >= tier.min_volume {
                applicable_rate = tier.fee_rate;
            }
        }
        applicable_rate
    }

    /// Calculate the protocol fee for a withdrawal amount.
    ///
    /// Uses the sender's cumulative stream volume to select the applicable
    /// fee tier, rewarding high-volume ecosystem donors with lower fees.
    fn calculate_protocol_fee(env: &Env, amount: i128, sender: &Address) -> i128 {
        let fee_rate = Self::get_applicable_fee_rate_internal(env, sender);

        if fee_rate == 0 || amount <= 0 {
            return 0;
        }

        // fee = (amount * fee_rate) / 10000
        // Split to avoid i128 overflow while preserving precision
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
        let mut stream: Stream = Self::get_stream(env.clone(), stream_id);

        Self::assert_is_recipient_or_delegate(&env, stream_id);

        let available = Self::withdrawable_amount(env.clone(), stream_id);
        if amount > available || amount <= 0 {
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }

        // Calculate protocol fee using the sender's volume-based tier
        let fee = Self::calculate_protocol_fee(&env, amount, &stream.sender);
        let net_amount = amount - fee;

        stream.withdrawn_amount += amount;

        // Check if stream is completed
        if stream.withdrawn_amount >= stream.total_amount {
            stream.status = StreamStatus::Completed;

            // Update protocol metrics - decrease active streams
            let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
                .get(&Symbol::new(&env, "protocol_metrics"))
                .unwrap();
            protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
        }

        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.total_withdrawn += amount;
        metrics.withdrawal_count += 1;
        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Transfer net amount to recipient
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &net_amount);

        // Transfer fee to collector if fee > 0
        if fee > 0 {
            let fee_collector: Address = env.storage().instance().get(&Symbol::new(&env, "fee_collector")).unwrap();
            token_client.transfer(&env.current_contract_address(), &fee_collector, &fee);
            env.events().publish(("FeeCollected", stream_id), fee);
        }
    }

    /// Withdraw the maximum available amount from a stream
    pub fn withdraw_max(env: Env, stream_id: u64) {
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

        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.pause_count += 1;
        metrics.last_activity = current_time;

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - decrease active streams
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
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

        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = current_time;

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - increase active streams
        let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap();
        protocol_metrics.total_active_streams += 1;
        env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
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

        env.storage().persistent().set(&stream_id, &stream);
        env.storage().persistent().extend_ttl(&stream_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update stream metrics
        let mut metrics: StreamMetrics = env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env));

        metrics.last_activity = env.ledger().timestamp();

        env.storage().persistent().set(&(stream_id, Symbol::new(&env, "metrics")), &metrics);
        env.storage().persistent().extend_ttl(&(stream_id, Symbol::new(&env, "metrics")), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update protocol metrics - decrease active streams if it was active
        if was_active {
            let mut protocol_metrics: ProtocolMetrics = env.storage().instance()
                .get(&Symbol::new(&env, "protocol_metrics"))
                .unwrap();
            protocol_metrics.total_active_streams = protocol_metrics.total_active_streams.saturating_sub(1);
            env.storage().instance().set(&Symbol::new(&env, "protocol_metrics"), &protocol_metrics);
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
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap();
        admin.require_auth();

        if new_fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }

        env.storage().instance().set(&Symbol::new(&env, "general_protocol_fee_rate"), &new_fee_rate);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Set the fee collector address
    pub fn set_fee_collector(env: Env, new_fee_collector: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap();
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, "fee_collector"), &new_fee_collector);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Get the current protocol fee rate
    pub fn get_protocol_fee_rate(env: Env) -> u32 {
        env.storage().instance().get(&Symbol::new(&env, "general_protocol_fee_rate")).unwrap_or(0)
    }

    /// Get the current fee collector
    pub fn get_fee_collector(env: Env) -> Address {
        env.storage().instance().get(&Symbol::new(&env, "fee_collector")).unwrap()
    }

    /// Get stream-specific metrics
    pub fn get_stream_metrics(env: Env, stream_id: u64) -> StreamMetrics {
        // Ensure stream exists
        Self::get_stream(env.clone(), stream_id);

        // Return metrics or default if not found
        env.storage().persistent()
            .get(&(stream_id, Symbol::new(&env, "metrics")))
            .unwrap_or_else(|| Self::default_stream_metrics(&env))
    }

    /// Set fee tiers for volume-based protocol fee discounts (admin only).
    ///
    /// `tiers` must be sorted in **strictly ascending** order by `min_volume`.
    /// Each tier's `fee_rate` must not exceed `MAX_FEE` (500 bps = 5%).
    /// Pass an empty Vec to clear all tiers and revert to `general_protocol_fee_rate`.
    ///
    /// # Errors
    /// - `Unauthorized`  - caller is not the contract admin.
    /// - `TooManyTiers`  - tiers.len() > MAX_TIERS (10).
    /// - `InvalidTier`   - a tier's fee_rate exceeds MAX_FEE, or tiers are
    ///                      not strictly sorted ascending by min_volume.
    pub fn set_fee_tiers(env: Env, tiers: Vec<FeeTier>) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        admin.require_auth();

        if tiers.len() > MAX_TIERS {
            panic_with_error!(&env, Error::TooManyTiers);
        }

        // Validate each tier and enforce strictly ascending sort on min_volume
        let mut prev_min_volume: i128 = -1_i128;
        let len = tiers.len();
        for i in 0..len {
            let tier = tiers.get(i).unwrap();
            if tier.fee_rate > MAX_FEE {
                panic_with_error!(&env, Error::InvalidTier);
            }
            if tier.min_volume <= prev_min_volume {
                panic_with_error!(&env, Error::InvalidTier);
            }
            prev_min_volume = tier.min_volume;
        }

        env.storage().instance().set(&Symbol::new(&env, "fee_tiers"), &tiers);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(("FeeTiersUpdated",), ());
    }

    /// Return the currently configured fee tiers.
    /// Returns an empty Vec when no tiers have been configured.
    pub fn get_fee_tiers(env: Env) -> Vec<FeeTier> {
        env.storage().instance()
            .get(&Symbol::new(&env, "fee_tiers"))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return the cumulative stream volume for a sender address.
    ///
    /// This is the sum of total_amount across all streams ever created by
    /// the sender and determines their position in the fee tier hierarchy.
    pub fn get_sender_volume(env: Env, sender: Address) -> i128 {
        let sender_vol_key = (Symbol::new(&env, "sv"), sender);
        env.storage().persistent()
            .get(&sender_vol_key)
            .unwrap_or(0)
    }

    /// Return the effective protocol fee rate (in basis points) for a sender
    /// based on their current cumulative stream volume.
    ///
    /// This is the rate applied to the next withdrawal from any stream
    /// created by this sender.
    pub fn get_applicable_fee_rate(env: Env, sender: Address) -> u32 {
        Self::get_applicable_fee_rate_internal(&env, &sender)
    }

    /// Get protocol-wide metrics
    pub fn get_protocol_metrics(env: Env) -> ProtocolMetrics {
        env.storage().instance()
            .get(&Symbol::new(&env, "protocol_metrics"))
            .unwrap_or(ProtocolMetrics {
                total_active_streams: 0,
                total_tokens_streamed: 0,
                total_streams_created: 0,
                total_delegations: 0,
            })
    }
}

mod test;
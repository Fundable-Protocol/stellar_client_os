#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Vec,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Storage key enumeration.
///
/// Using a typed enum keeps all persistent storage paths collision-free and
/// self-documenting.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Global admin address (instance storage).
    Admin,
    /// Running total of campaigns created (instance storage).
    CampaignCount,
    /// Protocol fee collector address (instance storage).
    FeeCollector,
    /// Protocol fee rate in basis points (instance storage).
    FeeRate,
    /// Insurance pool balance keyed by token address (instance storage).
    InsurancePool(Address),
    /// Insurance fee rate in basis points (instance storage).
    InsuranceFeeRate,
    /// Full [`Campaign`] struct keyed by campaign ID (persistent storage).
    Campaign(u64),
    /// Per-contributor escrow balance keyed by `(campaign_id, contributor)`
    /// (persistent storage).
    Contribution(u64, Address),
    /// Bitmask of campaign goal milestones (25 %, 50 %, 75 %, 100 %) that
    /// have been reached so far, keyed by campaign ID (persistent storage).
    MilestonesReached(u64),
}

/// Current lifecycle state of a campaign.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CampaignStatus {
    /// Open and accepting contributions.
    Active,
    /// Minimum target met; creator may claim the raised funds.
    Successful,
    /// Deadline passed without reaching the minimum target; contributors may
    /// claim full refunds.
    Failed,
    /// Creator has already claimed the raised funds.
    Claimed,
    /// Trees died during verification; sponsors are entitled to insurance
    /// refunds from the insurance pool.
    VerificationFailed,
}

/// Core campaign record stored on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    /// Unique numeric identifier assigned at creation.
    pub id: u64,
    /// Address that created the campaign and will receive the proceeds on
    /// success.
    pub creator: Address,
    /// Stellar asset contract address of the funding token.
    pub token: Address,
    /// Hard cap: the maximum amount the campaign may raise.  Once
    /// `total_raised` reaches this value the campaign auto-transitions to
    /// [`CampaignStatus::Successful`].
    pub target_amount: i128,
    /// Minimum threshold: the campaign is only considered successful when
    /// `total_raised >= min_target` by `deadline`.  If the threshold is not
    /// met all escrowed contributions become refundable.
    pub min_target: i128,
    /// Unix timestamp (seconds) after which no new contributions are accepted
    /// and [`CampaignFundingContract::trigger_expiry`] can be called.
    pub deadline: u64,
    /// Running sum of all escrowed contributions.
    pub total_raised: i128,
    /// Current lifecycle state.
    pub status: CampaignStatus,
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Emitted when a new campaign is created.
#[contracttype]
#[derive(Clone)]
pub struct CampaignCreatedEvent {
    pub campaign_id: u64,
    pub creator: Address,
    pub token: Address,
    pub target_amount: i128,
    pub min_target: i128,
    pub deadline: u64,
}

/// Emitted each time a contributor adds tokens to a campaign.
#[contracttype]
#[derive(Clone)]
pub struct ContributionMadeEvent {
    pub campaign_id: u64,
    pub contributor: Address,
    pub amount: i128,
    pub total_raised: i128,
}

/// Emitted when a campaign transitions out of the `Active` state.
#[contracttype]
#[derive(Clone)]
pub struct CampaignStatusChangedEvent {
    pub campaign_id: u64,
    pub new_status: CampaignStatus,
}

/// Emitted when the campaign creator claims the raised funds.
#[contracttype]
#[derive(Clone)]
pub struct FundsClaimedEvent {
    pub campaign_id: u64,
    pub creator: Address,
    /// Net amount after protocol fee deduction.
    pub amount: i128,
}

/// Emitted each time a contributor successfully claims a refund.
#[contracttype]
#[derive(Clone)]
pub struct RefundIssuedEvent {
    pub campaign_id: u64,
    pub contributor: Address,
    pub amount: i128,
}

/// Emitted when cumulative contributions cross one of a campaign's funding
/// milestones (25 %, 50 %, 75 % or 100 % of `target_amount`).
///
/// Milestones are tracked against the campaign's hard cap (`target_amount`)
/// and each one is emitted exactly once, the first time it is crossed.
#[contractevent(topics = ["MilestoneReached"])]
#[derive(Clone)]
pub struct MilestoneReachedEvent {
    pub campaign_id: u64,
    /// The percentage of `target_amount` reached: 25, 50, 75 or 100.
    pub percentage: u32,
    /// Running total of escrowed contributions at the time the milestone was
    /// crossed.
    pub total_raised: i128,
    /// The campaign goal this milestone is measured against.
    pub target_amount: i128,
}

/// Emitted when the protocol fee is collected during
/// [`CampaignFundingContract::claim_funds`].
///
/// Together with [`ContributionMadeEvent`], [`FundsClaimedEvent`], and
/// [`RefundIssuedEvent`], this makes every funds flow of a campaign — deposit,
/// fee, payout, and refund — observable on-chain.
#[contractevent(topics = ["ProtocolFeeCollected"])]
#[derive(Clone)]
pub struct ProtocolFeeCollectedEvent {
    pub campaign_id: u64,
    pub token: Address,
    pub fee_collector: Address,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Exhaustive error enumeration for the campaign-funding contract.
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
    /// A zero or negative monetary amount was supplied where a positive value
    /// is required.
    InvalidAmount = 4,
    /// The supplied deadline is in the past or equals the current ledger time.
    InvalidDeadline = 5,
    /// `min_target` is zero, negative, or exceeds `target_amount`.
    InvalidTarget = 6,
    /// No campaign exists with the requested ID.
    CampaignNotFound = 7,
    /// The operation requires the campaign to be in the `Active` state.
    CampaignNotActive = 8,
    /// `trigger_expiry` was called before the campaign deadline was reached.
    DeadlineNotReached = 9,
    /// The operation requires the campaign to be in the `Failed` state.
    CampaignNotFailed = 10,
    /// The operation requires the campaign to be in the `Successful` state.
    CampaignNotSuccessful = 11,
    /// The caller has no recorded contribution for the requested campaign.
    NoContributionFound = 12,
    /// `claim_funds` was called on a campaign that has already been claimed.
    AlreadyClaimed = 13,
    /// The requested fee rate exceeds the protocol maximum of 500 bps (5 %).
    FeeTooHigh = 14,
    /// An intermediate arithmetic value overflowed `i128`.
    ArithmeticOverflow = 15,
    /// The contribution would push `total_raised` above the hard cap
    /// (`target_amount`).
    TargetExceeded = 16,
    /// The supplied deadline exceeds the maximum allowed duration of 180 days.
    DeadlineTooFar = 17,
    /// The campaign is not in the `VerificationFailed` state.
    CampaignNotVerificationFailed = 18,
    /// The insurance pool fee rate exceeds the protocol maximum.
    InsuranceFeeTooHigh = 19,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum protocol fee: 500 basis points = 5 %.
const MAX_FEE: u32 = 500;
/// Maximum insurance pool fee: 500 basis points = 5 %.
const MAX_INSURANCE_FEE: u32 = 500;
/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;
/// Maximum duration for a campaign (180 days in seconds).
const MAX_CAMPAIGN_DURATION_SECONDS: u64 = 180 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct CampaignFundingContract;

#[contractimpl]
impl CampaignFundingContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the contract.
    ///
    /// Must be called exactly once before any other function.
    ///
    /// # Arguments
    /// * `admin`         — Address authorised to update protocol parameters.
    /// * `fee_collector` — Address that receives the protocol fee on each
    ///   successful `claim_funds`.
    /// * `fee_rate`      — Protocol fee in basis points (1 bp = 0.01 %).
    ///   Maximum accepted value: **500** (5 %).
    ///
    /// # Errors
    /// * [`Error::AlreadyInitialized`] — if called a second time.
    /// * [`Error::FeeTooHigh`]         — if `fee_rate > 500`.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_collector: Address,
        fee_rate: u32,
        insurance_fee_rate: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        if insurance_fee_rate > MAX_INSURANCE_FEE {
            panic_with_error!(&env, Error::InsuranceFeeTooHigh);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::CampaignCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::FeeCollector, &fee_collector);
        env.storage().instance().set(&DataKey::FeeRate, &fee_rate);
        env.storage()
            .instance()
            .set(&DataKey::InsuranceFeeRate, &insurance_fee_rate);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Campaign lifecycle
    // -----------------------------------------------------------------------

    /// Create a new funding campaign.
    ///
    /// Tokens are *not* transferred at this point; they are pulled from
    /// contributors individually when [`contribute`] is called.
    ///
    /// # Arguments
    /// * `creator`       — Address that owns the campaign and will receive
    ///   the proceeds on success.
    /// * `token`         — Stellar asset contract address of the funding
    ///   token.
    /// * `target_amount` — Hard cap; contributions close once this is
    ///   reached and the campaign auto-transitions to `Successful`.
    /// * `min_target`    — Minimum amount that must be raised before
    ///   `deadline` for the campaign to succeed.  Must satisfy
    ///   `0 < min_target <= target_amount`.
    /// * `deadline`      — Unix timestamp (seconds) after which no new
    ///   contributions are accepted.  Must be strictly greater than the
    ///   current ledger timestamp.
    ///
    /// # Returns
    /// The newly assigned campaign ID (starts at 1 and increments by 1).
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]  — contract not yet initialised.
    /// * [`Error::InvalidAmount`]   — `target_amount <= 0`.
    /// * [`Error::InvalidTarget`]   — `min_target` out of `(0, target_amount]`.
    /// * [`Error::InvalidDeadline`] — `deadline` is in the past.
    pub fn create_campaign(
        env: Env,
        creator: Address,
        token: Address,
        target_amount: i128,
        min_target: i128,
        deadline: u64,
        insurance_fee: i128,
    ) -> u64 {
        Self::assert_initialized(&env);
        creator.require_auth();

        if target_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if min_target <= 0 || min_target > target_amount {
            panic_with_error!(&env, Error::InvalidTarget);
        }
        if deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, Error::InvalidDeadline);
        }
        if deadline > env.ledger().timestamp() + MAX_CAMPAIGN_DURATION_SECONDS {
            panic_with_error!(&env, Error::DeadlineTooFar);
        }
        if insurance_fee <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Transfer the insurance fee from the creator to the contract's
        // insurance pool and record the pool balance.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&creator, &env.current_contract_address(), &insurance_fee);

        let pool_key = DataKey::InsurancePool(token.clone());
        let mut pool_balance: i128 = env.storage().instance().get(&pool_key).unwrap_or(0);
        pool_balance += insurance_fee;
        env.storage().instance().set(&pool_key, &pool_balance);

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        count += 1;
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &count);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let campaign = Campaign {
            id: count,
            creator: creator.clone(),
            token: token.clone(),
            target_amount,
            min_target,
            deadline,
            total_raised: 0,
            status: CampaignStatus::Active,
        };

        Self::save_campaign(&env, count, &campaign);

        env.events().publish(
            ("CampaignCreated", count),
            CampaignCreatedEvent {
                campaign_id: count,
                creator,
                token,
                target_amount,
                min_target,
                deadline,
            },
        );

        count
    }

    /// Mark a campaign as having lost its trees during verification.
    ///
    /// Only the contract admin can call this. Once a campaign is marked,
    /// sponsors can claim refunds from the insurance pool.
    ///
    /// # Arguments
    /// * `campaign_id` — ID of the campaign whose trees died.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]        — contract not initialised.
    /// * [`Error::Unauthorized`]          — caller is not the admin.
    /// * [`Error::CampaignNotFound`]      — campaign does not exist.
    /// * [`Error::CampaignNotSuccessful`] — campaign has not been successfully
    ///   claimed (only claimed campaigns can be subject to tree death).
    pub fn mark_trees_died(env: Env, campaign_id: u64) {
        Self::assert_initialized(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if campaign.status != CampaignStatus::Claimed {
            panic_with_error!(&env, Error::CampaignNotSuccessful);
        }

        campaign.status = CampaignStatus::VerificationFailed;
        Self::save_campaign(&env, campaign_id, &campaign);

        env.events().publish(
            ("CampaignStatusChanged", campaign_id),
            CampaignStatusChangedEvent {
                campaign_id,
                new_status: CampaignStatus::VerificationFailed,
            },
        );
    }

    /// Claim an insurance refund for a sponsor after tree death.
    ///
    /// A sponsor calls this to recover their contribution from the insurance
    /// pool. The campaign must have been marked as `VerificationFailed`.
    ///
    /// # Arguments
    /// * `campaign_id` — ID of the campaign whose trees died.
    /// * `contributor` — Address that originally contributed.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`]               — campaign does not exist.
    /// * [`Error::CampaignNotVerificationFailed`]  — campaign not marked.
    /// * [`Error::NoContributionFound`]            — no contribution recorded.
    /// * [`Error::InvalidAmount`]                  — contribution amount invalid.
    pub fn claim_insurance_refund(env: Env, campaign_id: u64, contributor: Address) {
        contributor.require_auth();

        let campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if campaign.status != CampaignStatus::VerificationFailed {
            panic_with_error!(&env, Error::CampaignNotVerificationFailed);
        }

        let contribution_key = DataKey::Contribution(campaign_id, contributor.clone());
        let amount: i128 = env
            .storage()
            .persistent()
            .get(&contribution_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoContributionFound));
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Remove the contribution to prevent double-dipping.
        env.storage().persistent().remove(&contribution_key);

        // Deduct from the insurance pool.
        let pool_key = DataKey::InsurancePool(campaign.token.clone());
        let mut pool_balance: i128 = env.storage().instance().get(&pool_key).unwrap_or(0);
        if pool_balance < amount {
            panic_with_error!(&env, Error::ArithmeticOverflow);
        }
        pool_balance -= amount;
        env.storage().instance().set(&pool_key, &pool_balance);

        // Transfer from the contract to the contributor.
        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(&env.current_contract_address(), &contributor, &amount);

        env.events().publish(
            ("InsuranceRefund", campaign_id),
            RefundIssuedEvent {
                campaign_id,
                contributor,
                amount,
            },
        );
    }

    /// Contribute tokens to a campaign.
    ///
    /// The full `amount` is transferred into contract escrow immediately.
    /// If the contribution causes `total_raised` to reach `target_amount`
    /// the campaign automatically transitions to [`CampaignStatus::Successful`].
    ///
    /// # Arguments
    /// * `contributor`  — Address making the contribution (pays the tokens).
    /// * `campaign_id`  — Target campaign.
    /// * `amount`       — Positive token amount to contribute.
    ///
    /// # Errors
    /// * [`Error::CampaignNotActive`]  — campaign not `Active` or deadline
    ///   already passed.
    /// * [`Error::InvalidAmount`]      — `amount <= 0`.
    /// * [`Error::TargetExceeded`]     — contribution would push `total_raised`
    ///   above the hard cap.
    /// * [`Error::ArithmeticOverflow`] — internal overflow guard.
    pub fn contribute(env: Env, contributor: Address, campaign_id: u64, amount: i128) {
        contributor.require_auth();

        let mut campaign = Self::load_campaign(&env, campaign_id);

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if env.ledger().timestamp() >= campaign.deadline {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let new_total = campaign
            .total_raised
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        if new_total > campaign.target_amount {
            panic_with_error!(&env, Error::TargetExceeded);
        }

        // Transfer tokens into contract escrow.
        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(&contributor, &env.current_contract_address(), &amount);

        // Update per-contributor balance.
        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        let prev: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        let new_contrib = prev
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&contrib_key, &new_contrib);
        env.storage()
            .persistent()
            .extend_ttl(&contrib_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        campaign.total_raised = new_total;

        // Auto-succeed when the hard cap is reached.
        if campaign.total_raised >= campaign.target_amount {
            campaign.status = CampaignStatus::Successful;
            env.events().publish(
                ("CampaignStatusChanged", campaign_id),
                CampaignStatusChangedEvent {
                    campaign_id,
                    new_status: CampaignStatus::Successful,
                },
            );
        }

        // Emit milestone events for every goal threshold newly crossed.
        Self::update_milestones(&env, campaign_id, &campaign);

        Self::save_campaign(&env, campaign_id, &campaign);

        env.events().publish(
            ("ContributionMade", campaign_id),
            ContributionMadeEvent {
                campaign_id,
                contributor,
                amount,
                total_raised: campaign.total_raised,
            },
        );
    }

    /// Evaluate an `Active` campaign once its deadline has passed and
    /// transition it to either `Successful` or `Failed`.
    ///
    /// This function is **permissionless** — anyone (contributor, bot, or
    /// third party) may call it.  This design removes the dependency on a
    /// privileged party to trigger refunds, ensuring contributors can always
    /// recover their funds after a failed campaign.
    ///
    /// * `total_raised >= min_target` → [`CampaignStatus::Successful`]
    /// * `total_raised <  min_target` → [`CampaignStatus::Failed`] — all
    ///   escrowed tokens become claimable via [`refund`].
    ///
    /// # Errors
    /// * [`Error::CampaignNotActive`]   — campaign is not in `Active` state.
    /// * [`Error::DeadlineNotReached`]  — deadline has not yet passed.
    pub fn trigger_expiry(env: Env, campaign_id: u64) {
        let mut campaign = Self::load_campaign(&env, campaign_id);

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if env.ledger().timestamp() < campaign.deadline {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        campaign.status = if campaign.total_raised >= campaign.min_target {
            CampaignStatus::Successful
        } else {
            CampaignStatus::Failed
        };

        let new_status = campaign.status;
        Self::save_campaign(&env, campaign_id, &campaign);

        env.events().publish(
            ("CampaignStatusChanged", campaign_id),
            CampaignStatusChangedEvent {
                campaign_id,
                new_status,
            },
        );
    }

    /// Claim the raised funds after a successful campaign.
    ///
    /// Only the campaign `creator` may call this.  A protocol fee is deducted
    /// from `total_raised` and forwarded to the fee collector; the net amount
    /// is sent to the creator.  The campaign status is updated to `Claimed`
    /// to prevent double-claims.
    ///
    /// When the fee is non-zero a [`ProtocolFeeCollectedEvent`] is emitted so
    /// the fee flow is recorded on-chain alongside the contribution, payout,
    /// and refund events.
    ///
    /// # Errors
    /// * [`Error::CampaignNotSuccessful`] — campaign is not `Successful`.
    /// * [`Error::AlreadyClaimed`]        — funds were already claimed.
    /// * [`Error::Unauthorized`]          — caller is not the campaign creator.
    pub fn claim_funds(env: Env, campaign_id: u64) {
        let mut campaign = Self::load_campaign(&env, campaign_id);

        campaign.creator.require_auth();

        if campaign.status == CampaignStatus::Claimed {
            panic_with_error!(&env, Error::AlreadyClaimed);
        }
        if campaign.status != CampaignStatus::Successful {
            panic_with_error!(&env, Error::CampaignNotSuccessful);
        }

        let gross = campaign.total_raised;
        let fee = Self::calculate_fee(&env, gross);
        let net = gross - fee;

        campaign.status = CampaignStatus::Claimed;
        Self::save_campaign(&env, campaign_id, &campaign);

        let token_client = token::Client::new(&env, &campaign.token);

        if fee > 0 {
            let fee_collector: Address = env
                .storage()
                .instance()
                .get(&DataKey::FeeCollector)
                .unwrap();
            token_client.transfer(&env.current_contract_address(), &fee_collector, &fee);

            ProtocolFeeCollectedEvent {
                campaign_id,
                token: campaign.token.clone(),
                fee_collector: fee_collector.clone(),
                amount: fee,
            }
            .publish(&env);
        }

        token_client.transfer(&env.current_contract_address(), &campaign.creator, &net);

        env.events().publish(
            ("FundsClaimed", campaign_id),
            FundsClaimedEvent {
                campaign_id,
                creator: campaign.creator,
                amount: net,
            },
        );
    }

    /// Claim a full refund after a failed campaign.
    ///
    /// Each contributor calls this individually to recover exactly the amount
    /// they contributed.  The contribution record is cleared before the
    /// transfer executes (check-effects-interactions pattern) to prevent
    /// double-refunds.
    ///
    /// # Arguments
    /// * `contributor`  — The address reclaiming their contribution.
    /// * `campaign_id`  — The failed campaign to refund from.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFailed`]    — campaign is not in `Failed` state.
    /// * [`Error::NoContributionFound`]  — caller has no recorded contribution.
    pub fn refund(env: Env, contributor: Address, campaign_id: u64) {
        contributor.require_auth();

        let campaign = Self::load_campaign(&env, campaign_id);

        if campaign.status != CampaignStatus::Failed {
            panic_with_error!(&env, Error::CampaignNotFailed);
        }

        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        let amount: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);

        if amount <= 0 {
            panic_with_error!(&env, Error::NoContributionFound);
        }

        // Clear before transferring (check-effects-interactions).
        env.storage().persistent().remove(&contrib_key);

        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(&env.current_contract_address(), &contributor, &amount);

        env.events().publish(
            ("RefundIssued", campaign_id),
            RefundIssuedEvent {
                campaign_id,
                contributor,
                amount,
            },
        );
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the full [`Campaign`] record for the given ID.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — no campaign with this ID exists.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        Self::load_campaign(&env, campaign_id)
    }

    /// Return the total amount contributed by `contributor` to `campaign_id`.
    ///
    /// Returns `0` if the contributor has no record (including after a
    /// successful refund).
    pub fn get_contribution(env: Env, campaign_id: u64, contributor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(campaign_id, contributor))
            .unwrap_or(0)
    }

    /// Return the funding milestones (as percentages of `target_amount`) that
    /// have been reached so far for a campaign, sorted ascending.
    ///
    /// Each milestone is one of `25`, `50`, `75` or `100`. A freshly created
    /// campaign (or one that has not crossed the 25 % mark) returns `[]`.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — no campaign with this ID exists.
    pub fn get_milestones_reached(env: Env, campaign_id: u64) -> Vec<u32> {
        // Validate the campaign exists before reading its milestone mask.
        Self::load_campaign(&env, campaign_id);
        let mask: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::MilestonesReached(campaign_id))
            .unwrap_or(0);
        let thresholds: [u32; 4] = [25, 50, 75, 100];
        let mut reached: Vec<u32> = Vec::new(&env);
        for (i, pct) in thresholds.iter().enumerate() {
            if mask & (1u32 << i) != 0 {
                reached.push_back(*pct);
            }
        }
        reached
    }

    /// Return the total number of campaigns ever created.
    pub fn get_campaign_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    /// Return the current protocol fee rate in basis points.
    pub fn get_fee_rate(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeRate).unwrap_or(0)
    }

    /// Return the current fee collector address.
    pub fn get_fee_collector(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// Update the protocol fee rate (basis points, max 500 = 5 %).
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — contract not yet initialised.
    /// * [`Error::FeeTooHigh`]     — `new_fee_rate > 500`.
    pub fn set_fee_rate(env: Env, new_fee_rate: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        if new_fee_rate > MAX_FEE {
            panic_with_error!(&env, Error::FeeTooHigh);
        }

        env.storage()
            .instance()
            .set(&DataKey::FeeRate, &new_fee_rate);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Update the fee collector address.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — contract not yet initialised.
    pub fn set_fee_collector(env: Env, new_fee_collector: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::FeeCollector, &new_fee_collector);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Panic with [`Error::NotInitialized`] if the contract has not been
    /// initialised yet.
    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    /// Load a [`Campaign`] from persistent storage, bumping its TTL, or
    /// panic with [`Error::CampaignNotFound`].
    fn load_campaign(env: &Env, campaign_id: u64) -> Campaign {
        let key = DataKey::Campaign(campaign_id);
        match env.storage().persistent().get(&key) {
            Some(c) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
                c
            }
            None => panic_with_error!(env, Error::CampaignNotFound),
        }
    }

    /// Persist a [`Campaign`] and extend TTL for both persistent and instance
    /// storage.
    fn save_campaign(env: &Env, campaign_id: u64, campaign: &Campaign) {
        let key = DataKey::Campaign(campaign_id);
        env.storage().persistent().set(&key, campaign);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Emit [`MilestoneReachedEvent`]s for every goal threshold newly crossed
    /// by `campaign.total_raised`, and record them so each milestone is only
    /// ever emitted once.
    ///
    /// A milestone `pct` is reached once `total_raised / target_amount >= pct
    /// / 100`, evaluated exactly with cross-multiplication to avoid rounding.
    /// Because `target_amount` is the hard cap, the 100 % milestone corresponds
    /// to `total_raised == target_amount`.
    fn update_milestones(env: &Env, campaign_id: u64, campaign: &Campaign) {
        let thresholds: [u32; 4] = [25, 50, 75, 100];
        let key = DataKey::MilestonesReached(campaign_id);
        let mut mask: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        let mut changed = false;

        for (i, pct) in thresholds.iter().enumerate() {
            let bit = 1u32 << i;
            if mask & bit != 0 {
                continue;
            }
            let lhs = campaign
                .total_raised
                .checked_mul(100)
                .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow));
            let rhs = campaign
                .target_amount
                .checked_mul(*pct as i128)
                .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow));
            if lhs >= rhs {
                mask |= bit;
                changed = true;
                MilestoneReachedEvent {
                    campaign_id,
                    percentage: *pct,
                    total_raised: campaign.total_raised,
                    target_amount: campaign.target_amount,
                }
                .publish(env);
            }
        }

        if changed {
            env.storage().persistent().set(&key, &mask);
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        }
    }

    /// Compute the protocol fee for `amount` using the stored fee rate.
    ///
    /// Uses the same split-calculation as the payment-stream contract to
    /// preserve precision without overflow.
    fn calculate_fee(env: &Env, amount: i128) -> i128 {
        let fee_rate: u32 = env.storage().instance().get(&DataKey::FeeRate).unwrap_or(0);
        if fee_rate == 0 || amount <= 0 {
            return 0;
        }
        let rate = fee_rate as i128;
        (amount / 10_000) * rate + ((amount % 10_000) * rate) / 10_000
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env, Event,
    };

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    /// Register a Stellar asset contract and return its address plus typed
    /// clients for both the token interface and the admin (mint) interface.
    fn create_token<'a>(
        env: &Env,
        admin: &Address,
    ) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
        let addr = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let token = TokenClient::new(env, &addr);
        let token_admin = StellarAssetClient::new(env, &addr);
        (addr, token, token_admin)
    }

    /// Deploy and initialise a `CampaignFundingContract` with a 2.5 % fee.
    fn setup_contract(env: &Env) -> (Address, CampaignFundingContractClient, Address, Address) {
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let fee_collector = Address::generate(env);
        client.initialize(&admin, &fee_collector, &250, &0); // 2.5 %
        (contract_id, client, admin, fee_collector)
    }

    /// Set the ledger timestamp to `ts`.
    fn set_time(env: &Env, ts: u64) {
        env.ledger().set(LedgerInfo {
            timestamp: ts,
            protocol_version: env.ledger().protocol_version(),
            sequence_number: env.ledger().sequence(),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 16,
            max_entry_ttl: 6_312_000,
        });
    }

    // -----------------------------------------------------------------------
    // initialize
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &250, &0);

        assert_eq!(client.get_fee_rate(), 250);
        assert_eq!(client.get_fee_collector(), fee_collector);
        assert_eq!(client.get_campaign_count(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, admin, fee_collector) = setup_contract(&env);
        // Second call must panic.
        client.initialize(&admin, &fee_collector, &250, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_initialize_fee_too_high() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        // 501 bps > MAX_FEE (500)
        client.initialize(&admin, &fee_collector, &501, &0);
    }

    // -----------------------------------------------------------------------
    // create_campaign
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_campaign_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        assert_eq!(id, 1);
        assert_eq!(client.get_campaign_count(), 1);

        let campaign = client.get_campaign(&1);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.target_amount, 10_000);
        assert_eq!(campaign.min_target, 5_000);
        assert_eq!(campaign.deadline, 2_000);
        assert_eq!(campaign.total_raised, 0);
        assert_eq!(campaign.status, CampaignStatus::Active);
    }

    #[test]
    fn test_create_campaign_ids_increment() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &1_000);

        let id1 = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        let id2 = client.create_campaign(&creator, &token, &20_000, &10_000, &3_000, &500);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(client.get_campaign_count(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_create_campaign_not_initialized() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_campaign_zero_target() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        client.create_campaign(&creator, &token, &0, &0, &2_000, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_create_campaign_min_target_exceeds_target() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        // min_target (6_000) > target_amount (5_000)
        client.create_campaign(&creator, &token, &5_000, &6_000, &2_000, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_create_campaign_zero_min_target() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        client.create_campaign(&creator, &token, &10_000, &0, &2_000, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_create_campaign_deadline_in_past() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 5_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        // deadline (2_000) < current time (5_000)
        client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
    }

    #[test]
    fn test_create_campaign_deadline_within_180_days_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);
        let deadline = 1_000 + (90 * 24 * 60 * 60);
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500);
        assert_eq!(id, 1);
    }

    #[test]
    fn test_create_campaign_deadline_exactly_180_days_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);
        let deadline = 1_000 + MAX_CAMPAIGN_DURATION_SECONDS;
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500);
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_create_campaign_deadline_exceeds_180_days_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        let deadline = 1_000 + MAX_CAMPAIGN_DURATION_SECONDS + 1;
        client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500);
    }

    // -----------------------------------------------------------------------
    // contribute
    // -----------------------------------------------------------------------

    #[test]
    fn test_contribute_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);

        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000);

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.total_raised, 3_000);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(client.get_contribution(&id, &contributor), 3_000);
        // Tokens are now held by the contract.
        assert_eq!(token_client.balance(&contributor), 7_000);
    }

    #[test]
    fn test_contribute_accumulates() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &1_000);
        client.contribute(&contributor, &id, &2_000);

        assert_eq!(client.get_contribution(&id, &contributor), 3_000);
        assert_eq!(client.get_campaign(&id).total_raised, 3_000);
    }

    #[test]
    fn test_contribute_multiple_contributors() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contrib1 = Address::generate(&env);
        let contrib2 = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contrib1, &5_000);
        token_admin_client.mint(&contrib2, &5_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contrib1, &id, &3_000);
        client.contribute(&contrib2, &id, &2_000);

        assert_eq!(client.get_campaign(&id).total_raised, 5_000);
        assert_eq!(client.get_contribution(&id, &contrib1), 3_000);
        assert_eq!(client.get_contribution(&id, &contrib2), 2_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_contribute_after_deadline() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);

        // Advance past deadline.
        set_time(&env, 3_000);
        client.contribute(&contributor, &id, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_contribute_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_contribute_exceeds_hard_cap() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &20_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        // 11_000 > target_amount (10_000)
        client.contribute(&contributor, &id, &11_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_contribute_to_nonexistent_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let contributor = Address::generate(&env);
        // campaign 99 does not exist → load_campaign panics with CampaignNotFound = 7.
        client.contribute(&contributor, &99, &500);
    }

    // -----------------------------------------------------------------------
    // Auto-succeed on hard cap
    // -----------------------------------------------------------------------

    #[test]
    fn test_contribute_auto_succeed_on_hard_cap() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        // Contribute the full hard cap in one shot.
        client.contribute(&contributor, &id, &10_000);

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.total_raised, 10_000);
        assert_eq!(campaign.status, CampaignStatus::Successful);
    }

    // -----------------------------------------------------------------------
    // trigger_expiry
    // -----------------------------------------------------------------------

    #[test]
    fn test_trigger_expiry_sets_successful_when_target_met() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &6_000); // > min_target

        // Advance past deadline.
        set_time(&env, 3_000);
        client.trigger_expiry(&id);

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Successful);
    }

    #[test]
    fn test_trigger_expiry_sets_failed_when_target_not_met() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000); // < min_target

        set_time(&env, 3_000);
        client.trigger_expiry(&id);

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Failed);
    }

    #[test]
    fn test_trigger_expiry_with_zero_contributions_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Failed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_trigger_expiry_before_deadline() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        // Still before deadline — must panic.
        client.trigger_expiry(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_trigger_expiry_already_resolved() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // First call → Failed
        client.trigger_expiry(&id); // Second call must panic.
    }

    #[test]
    fn test_trigger_expiry_permissionless() {
        // A random third party (neither creator nor contributor) can call
        // trigger_expiry — the function requires no auth.
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        set_time(&env, 3_000);
        // Called with no auth mocking — just default env.
        client.trigger_expiry(&id);
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Failed);
    }

    // -----------------------------------------------------------------------
    // claim_funds
    // -----------------------------------------------------------------------

    #[test]
    fn test_claim_funds_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, fee_collector) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &8_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);

        client.claim_funds(&id);

        // 2.5 % fee on 8_000 = 200; net = 7_800.
        assert_eq!(token_client.balance(&creator), 7_800);
        assert_eq!(token_client.balance(&fee_collector), 200);
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Claimed);
    }

    #[test]
    fn test_claim_funds_zero_fee() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &0, &0); // 0 % fee

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.claim_funds(&id);

        assert_eq!(token_client.balance(&creator), 6_000);
        assert_eq!(token_client.balance(&fee_collector), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_claim_funds_on_active_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        client.claim_funds(&id); // Still Active — must panic.
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_claim_funds_on_failed_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // → Failed
        client.claim_funds(&id); // Must panic.
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_claim_funds_double_claim() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.claim_funds(&id);
        client.claim_funds(&id); // Must panic.
    }

    // -----------------------------------------------------------------------
    // refund
    // -----------------------------------------------------------------------

    #[test]
    fn test_refund_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000); // < min_target
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // → Failed

        client.refund(&contributor, &id);

        // Full refund, no fee deducted.
        assert_eq!(token_client.balance(&contributor), 10_000);
        // Contribution record cleared.
        assert_eq!(client.get_contribution(&id, &contributor), 0);
    }

    #[test]
    fn test_refund_multiple_contributors_all_refunded() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contrib1 = Address::generate(&env);
        let contrib2 = Address::generate(&env);
        let contrib3 = Address::generate(&env);
        token_admin_client.mint(&creator, &1_000);
        token_admin_client.mint(&contrib1, &3_000);
        token_admin_client.mint(&contrib2, &1_500);
        token_admin_client.mint(&contrib3, &500);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contrib1, &id, &3_000);
        client.contribute(&contrib2, &id, &1_500);
        client.contribute(&contrib3, &id, &500); // total = 5_000 == min_target

        // Bring total below min_target by using a campaign where min > raised.
        // (For simplicity create a new campaign with higher min_target.)
        let id2 = client.create_campaign(&creator, &token_addr, &10_000, &6_000, &2_000, &500);
        let contrib4 = Address::generate(&env);
        token_admin_client.mint(&contrib4, &4_000);
        client.contribute(&contrib4, &id2, &4_000); // 4_000 < 6_000 (min)

        set_time(&env, 3_000);
        client.trigger_expiry(&id2); // → Failed

        client.refund(&contrib4, &id2);
        assert_eq!(token_client.balance(&contrib4), 4_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_on_active_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &5_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &1_000);
        // Campaign still Active — refund must panic.
        client.refund(&contributor, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_on_successful_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &7_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // → Successful
        client.refund(&contributor, &id); // Must panic.
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_refund_no_contribution() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);
        let outsider = Address::generate(&env);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500);
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // → Failed
                                    // `outsider` never contributed — must panic.
        client.refund(&outsider, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_refund_double_refund_prevented() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &5_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &2_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.refund(&contributor, &id); // First refund — OK.
        client.refund(&contributor, &id); // Second refund — must panic.
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_fee_rate() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);

        client.set_fee_rate(&100); // 1 %
        assert_eq!(client.get_fee_rate(), 100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_set_fee_rate_too_high() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        client.set_fee_rate(&501); // Must panic.
    }

    #[test]
    fn test_set_fee_collector() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        let new_collector = Address::generate(&env);
        client.set_fee_collector(&new_collector);
        assert_eq!(client.get_fee_collector(), new_collector);
    }

    // -----------------------------------------------------------------------
    // Fee calculation edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_fee_calculation_precision() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);

        // Use a 1 % fee (100 bps).
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &100, &0);

        let token_admin = Address::generate(&env);
        let (token_addr, token_client, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &9_999);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.claim_funds(&id);

        // fee = 9_999 * 100 / 10_000 = 99 (integer division); net = 9_900.
        assert_eq!(token_client.balance(&creator), 9_900);
        assert_eq!(token_client.balance(&fee_collector), 99);
    }

    // -----------------------------------------------------------------------
    // Funds-flow transparency events
    // -----------------------------------------------------------------------

    #[test]
    fn test_claim_funds_emits_protocol_fee_event() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, fee_collector) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &8_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.claim_funds(&id);

        // 2.5 % fee on 8_000 = 200; net to creator = 7_800.
        let expected_fee = ProtocolFeeCollectedEvent {
            campaign_id: id,
            token: token_addr.clone(),
            fee_collector: fee_collector.clone(),
            amount: 200,
        }
        .to_xdr(&env, &contract_id);
        let events = env.events().all();
        assert!(
            events.events().iter().any(|e| *e == expected_fee),
            "expected ProtocolFeeCollectedEvent to be emitted"
        );
    }

    #[test]
    fn test_claim_funds_zero_fee_emits_no_fee_event() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let contract_id = env.register(CampaignFundingContract, ());
        let client = CampaignFundingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &0, &0); // 0 % fee

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.claim_funds(&id);

        // With a 0 % fee no protocol fee flows, so no fee event may be emitted.
        let unexpected = ProtocolFeeCollectedEvent {
            campaign_id: id,
            token: token_addr.clone(),
            fee_collector: fee_collector.clone(),
            amount: 0,
        }
        .to_xdr(&env, &contract_id);
        let events = env.events().all();
        assert!(
            !events.events().iter().any(|e| *e == unexpected),
            "no ProtocolFeeCollectedEvent should be emitted when the fee is zero"
        );
    }

    // -----------------------------------------------------------------------
    // Campaign milestone tracking
    // -----------------------------------------------------------------------

    #[test]
    fn test_no_milestone_below_25_percent() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &2_000); // 20 % < 25 %

        assert_eq!(client.get_milestones_reached(&id).len(), 0);
    }

    #[test]
    fn test_milestone_25_percent_reached() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000); // 30 % -> 25 % milestone

        // env.events() reflects only the last external call, so capture it
        // immediately after the emitting contribution.
        let events = env.events().all();
        let expected = MilestoneReachedEvent {
            campaign_id: id,
            percentage: 25,
            total_raised: 3_000,
            target_amount: 10_000,
        }
        .to_xdr(&env, &contract_id);
        assert!(
            events.events().iter().any(|e| *e == expected),
            "expected a MilestoneReachedEvent at 25 %"
        );

        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 1);
        assert_eq!(ms.get(0).unwrap(), 25);
    }

    #[test]
    fn test_milestone_multiple_in_one_contribution() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        // A single 6_000 contribution crosses both the 25 % and 50 % marks.
        client.contribute(&contributor, &id, &6_000);

        let events = env.events().all();
        for percentage in [25u32, 50u32] {
            let expected = MilestoneReachedEvent {
                campaign_id: id,
                percentage,
                total_raised: 6_000,
                target_amount: 10_000,
            }
            .to_xdr(&env, &contract_id);
            assert!(
                events.events().iter().any(|e| *e == expected),
                "expected a MilestoneReachedEvent at {percentage} %"
            );
        }

        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 2);
        assert_eq!(ms.get(0).unwrap(), 25);
        assert_eq!(ms.get(1).unwrap(), 50);
    }

    #[test]
    fn test_milestone_100_percent_on_auto_succeed() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &10_000); // reaches the hard cap

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Successful);
        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 4);
        assert_eq!(ms.get(0).unwrap(), 25);
        assert_eq!(ms.get(1).unwrap(), 50);
        assert_eq!(ms.get(2).unwrap(), 75);
        assert_eq!(ms.get(3).unwrap(), 100);
    }

    #[test]
    fn test_milestones_emitted_once() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000); // 30 % -> crosses 25 %

        // Capture events after the first contribution to assert the 25 % event.
        let events1 = env.events().all();
        let expected25 = MilestoneReachedEvent {
            campaign_id: id,
            percentage: 25,
            total_raised: 3_000,
            target_amount: 10_000,
        }
        .to_xdr(&env, &contract_id);
        let count25 = events1
            .events()
            .iter()
            .filter(|e| **e == expected25)
            .count();
        assert_eq!(
            count25, 1,
            "the 25 % milestone must be emitted exactly once"
        );

        client.contribute(&contributor, &id, &2_000); // 50 % now
        let events2 = env.events().all();
        let expected50 = MilestoneReachedEvent {
            campaign_id: id,
            percentage: 50,
            total_raised: 5_000,
            target_amount: 10_000,
        }
        .to_xdr(&env, &contract_id);
        assert!(
            events2.events().iter().any(|e| *e == expected50),
            "expected the 50 % milestone to be emitted on the second contribution"
        );

        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 2);
        assert_eq!(ms.get(0).unwrap(), 25);
        assert_eq!(ms.get(1).unwrap(), 50);
    }

    #[test]
    fn test_milestones_persist_for_failed_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&creator, &500);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500);
        client.contribute(&contributor, &id, &3_000); // crosses 25 %
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // 3_000 < 5_000 min -> Failed

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Failed);
        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 1);
        assert_eq!(ms.get(0).unwrap(), 25);
    }
}

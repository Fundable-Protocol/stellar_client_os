#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Bytes, BytesN, Env, String, Vec,
};

/// Optional `Address` wrapper suitable for use inside `#[contracttype]` structs.
///
/// Soroban's `#[contracttype]` macro does not support generic type parameters,
/// so we cannot use `Option<Address>` directly.  This enum provides the same
/// semantics.
#[contracttype]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum OptionalAddress {
    None,
    Some(Address),
}

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
    /// (persistent storage). This remains the sponsor's gross contribution,
    /// independent of protocol fees and matching funds.
    Contribution(u64, Address),
    /// Campaign metadata IPFS CID or hex hash keyed by campaign ID.
    CampaignIpfsHash(u64),
    /// Total count of tree planting records. A non-zero count also serves as
    /// the "trees planted" marker for the tiered refund policy.
    PlantingCount(u64),
    /// Tree planting verification SLA record keyed by `(campaign_id, planting_id)`.
    PlantingSla(u64, u64),
    /// Status history entry keyed by `(campaign_id, entry_index)` (persistent storage).
    StatusHistory(u64, u32),
    /// Total number of status history entries for a campaign (persistent storage).
    StatusHistoryCount(u64),
    /// Bitmask of campaign goal milestones (25 %, 50 %, 75 %, 100 %) that
    /// have been reached so far, keyed by campaign ID (persistent storage).
    MilestonesReached(u64),
    /// Verified tree count aggregate for campaign reward eligibility.
    VerifiedTreeCount(u64),
    /// Bitmask of one-time tree reward unlocks (1k, 5k, 10k).
    RewardsUnlocked(u64),
    /// Reserve pool balance for tree replacement, keyed by campaign ID
    /// (persistent storage). Holds 10% of raised funds for dead tree replacement.
    Reserve(u64),
    /// Team members configuration keyed by campaign ID (persistent storage).
    TeamMembers(u64),
    /// Gross contribution stored separately so refunds are always exact.
    OriginalContribution(u64, Address),
    /// Admin-funded matching cap for a campaign (persistent storage).
    MatchingCap(u64),
    /// Running total of matching funds already consumed (persistent storage).
    MatchingUsed(u64),
    /// Remaining matching pool balance (persistent storage).
    MatchingBalance(u64),
    /// Payment-stream contract address (instance storage).
    StreamContract,
    /// Flag indicating a reward stream has been started for a contributor.
    RewardStreamed(u64, Address),
    /// ERC-20–compatible carbon credit token contract address per campaign.
    CarbonToken(u64),
    /// Flag indicating carbon credit tokens have been minted for a campaign.
    CarbonCreditsMinted(u64),
    /// Stored CO₂ multiplier for a campaign (1 = dry season, 2 = rainy season).
    Co2Multiplier(u64),
    /// Number of group sponsorships created for a campaign.
    GroupSponsorshipCount(u64),
    /// Group sponsorship details keyed by campaign and group ID.
    GroupSponsorship(u64, u64),
}

/// Current lifecycle state of a campaign.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CampaignStatus {
    /// Open and accepting contributions.
    Active,
    /// Minimum target met; creator may claim the raised funds.
    Successful,
    /// Verifier has approved trees are planted.
    Verified,
    /// Deadline passed without reaching the minimum target; contributors may
    /// claim full refunds.
    Failed,
    /// Creator has already claimed the raised funds.
    Claimed,
    /// Trees died during verification; sponsors are entitled to insurance
    /// refunds from the insurance pool.
    VerificationFailed,
    /// Campaign has been temporarily halted by the admin.
    Paused,
}

/// Single entry in a campaign's status history.
#[contracttype]
#[derive(Clone)]
pub struct StatusHistoryEntry {
    /// The status that was set at this point in time.
    pub status: CampaignStatus,
    /// Unix timestamp (seconds) when this status change occurred.
    pub timestamp: u64,
}

/// Core campaign record stored on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    /// Unique numeric identifier assigned at creation.
    pub id: u64,
    /// Address that created the campaign and remains the primary owner.
    pub creator: Address,
    /// All campaign owners in payout order.
    pub creators: Vec<Address>,
    /// Revenue shares in basis points, aligned with `creators`.
    pub revenue_shares: Vec<u32>,
    /// Stellar asset contract address of the funding token.
    pub token: Address,
    /// Hard cap: the maximum amount the campaign may raise. Once
    /// `total_raised` reaches this value the campaign auto-transitions to
    /// [`CampaignStatus::Successful`].
    pub target_amount: i128,
    /// Minimum threshold: the campaign is only considered successful when
    /// `total_raised >= min_target` by `deadline`. If the threshold is not
    /// met all escrowed contributions become refundable.
    pub min_target: i128,
    /// Unix timestamp (seconds) after which no new contributions are accepted
    /// and [`CampaignFundingContract::trigger_expiry`] can be called.
    pub deadline: u64,
    /// Running sum of all escrowed contributions.
    pub total_raised: i128,
    /// Current lifecycle state.
    pub status: CampaignStatus,
    /// Unix timestamp (seconds) when the campaign was created.
    /// Used to enforce the 90-day planter-assignment window.
    pub created_at: u64,
    /// Address of the planter assigned to this campaign, if any.
    /// `OptionalAddress::None` means no planter has been assigned yet.
    pub planter: OptionalAddress,
    /// CO₂ sequestration multiplier captured at creation time.
    /// 1 = dry season (standard rate), 2 = rainy season (2× enhanced rate).
    /// Used by `mint_carbon_credits` to compute per-sponsor token amounts.
    pub co2_multiplier: u32,
}

/// A single co-creator on a campaign team and the share of the proceeds they
/// are entitled to.
///
/// `percentage_bps` is expressed in basis points relative to the campaign's
/// net proceeds (after the protocol fee). The percentages of all team members
/// must sum to exactly `10_000` (that is, 100 %).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TeamMember {
    /// Wallet that receives this member's share on a successful claim.
    pub address: Address,
    /// Share of the net proceeds, in basis points (1 bp = 0.01 %).
    pub percentage_bps: u32,
}

/// A named group of sponsors funding a campaign together.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GroupSponsorship {
    /// Campaign receiving the group's contributions.
    pub campaign_id: u64,
    /// Unique identifier within the campaign.
    pub group_id: u64,
    /// Public recognition name for the group.
    pub name: soroban_sdk::String,
    /// Address that created the group.
    pub organizer: Address,
    /// Sum of direct contributions made by the group's members.
    pub total_contributed: i128,
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Emitted when a new campaign is created.
#[contracttype]
#[derive(Clone)]
pub struct CampaignCreatedEvent {
    /// Unique identifier for the created campaign.
    pub campaign_id: u64,
    /// Address of the campaign creator.
    pub creator: Address,
    /// Token contract address accepted for funding.
    pub token: Address,
    /// Maximum funding limit in token stroops.
    pub target_amount: i128,
    /// Minimum required funding threshold.
    pub min_target: i128,
    /// Unix timestamp deadline for contributions.
    pub deadline: u64,
    pub co2_multiplier: u32,
    pub tree_species: soroban_sdk::String,
}

/// Emitted when a group sponsorship is created.
#[contracttype]
#[derive(Clone)]
pub struct GroupSponsorshipCreatedEvent {
    pub campaign_id: u64,
    pub group_id: u64,
    pub name: soroban_sdk::String,
    pub organizer: Address,
}

/// Emitted when a sponsor contributes through a group sponsorship.
#[contracttype]
#[derive(Clone)]
pub struct GroupContributionMadeEvent {
    pub campaign_id: u64,
    pub group_id: u64,
    pub contributor: Address,
    pub amount: i128,
    pub group_total: i128,
}

/// Emitted each time a contributor adds tokens to a campaign.
#[contracttype]
#[derive(Clone)]
pub struct ContributionMadeEvent {
    /// Identifier of the target campaign.
    pub campaign_id: u64,
    /// Address of the contributing donor.
    pub contributor: Address,
    /// Amount of tokens contributed in stroops.
    pub amount: i128,
    /// Updated total amount raised after this contribution.
    pub total_raised: i128,
}

/// Contribution event used when a sponsor chooses anonymity on public surfaces.
///
/// The contributor address is deliberately omitted. Soroban ledger data and the
/// transaction signer remain public, so this hides the sponsor from event-based
/// campaign displays but is not cryptographic on-chain privacy.
#[contracttype]
#[derive(Clone)]
pub struct AnonymousContributionMadeEvent {
    pub campaign_id: u64,
    pub amount: i128,
    pub total_raised: i128,
}

/// Emitted when a campaign transitions lifecycle states.
#[contracttype]
#[derive(Clone)]
pub struct CampaignStatusChangedEvent {
    /// Identifier of the campaign whose status changed.
    pub campaign_id: u64,
    /// New lifecycle state assigned to the campaign.
    pub new_status: CampaignStatus,
}

/// Emitted when a planter is assigned to a campaign, marking the campaign as
/// started for the tiered refund policy (issue #889).
#[contracttype]
#[derive(Clone)]
pub struct PlanterAssignedEvent {
    /// Identifier of the campaign the planter was assigned to.
    pub campaign_id: u64,
    /// Address of the assigned planter.
    pub planter: Address,
    /// Unix timestamp (seconds) when the assignment happened.
    pub assigned_at: u64,
}

/// Emitted when the campaign creator claims the raised funds.
#[contracttype]
#[derive(Clone)]
pub struct FundsClaimedEvent {
    /// Identifier of the claimed campaign.
    pub campaign_id: u64,
    /// Creator address receiving net funds.
    pub creator: Address,
    /// Net amount transferred to creator after protocol fee deduction.
    pub amount: i128,
}

/// Emitted when the verifier approves a campaign's escrow for payout.
#[contracttype]
#[derive(Clone)]
pub struct CampaignVerificationApprovedEvent {
    /// Identifier of the approved campaign.
    pub campaign_id: u64,
    /// Unix timestamp when the approval was recorded.
    pub approved_at: u64,
}

/// Emitted each time a contributor successfully claims a refund.
#[contracttype]
#[derive(Clone)]
pub struct RefundIssuedEvent {
    /// Identifier of the failed campaign refunded from.
    pub campaign_id: u64,
    /// Contributor receiving the refund.
    pub contributor: Address,
    /// Total refunded token amount.
    pub amount: i128,
}

/// Emitted when campaign IPFS metadata hash is updated.
#[contracttype]
#[derive(Clone)]
pub struct CampaignIpfsHashUpdatedEvent {
    pub campaign_id: u64,
    pub ipfs_hash: soroban_sdk::String,
}

/// Tree planting verification SLA record.
#[contracttype]
#[derive(Clone)]
pub struct PlantingSlaRecord {
    pub planting_id: u64,
    pub campaign_id: u64,
    pub planter: Address,
    pub tree_count: u32,
    pub planted_at: u64,
    pub verification_deadline: u64,
    pub is_verified: bool,
    pub verified_at: u64,
    pub is_refunded: bool,
}

/// Emitted when a tree planting batch is recorded with 30-day SLA window.
#[contracttype]
#[derive(Clone)]
pub struct TreePlantingRecordedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub planter: Address,
    pub tree_count: u32,
    pub verification_deadline: u64,
}

/// Emitted when tree planting is verified on-chain.
#[contracttype]
#[derive(Clone)]
pub struct TreePlantingVerifiedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub verified_at: u64,
}

/// Proof of tree species planted, linking uploaded photo hash to declared species.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpeciesPhotoProof {
    /// SHA-256 or IPFS digest of the uploaded proof photo.
    pub photo_hash: BytesN<32>,
    /// Declared tree species shown in the photo.
    pub species: String,
    /// Tree count verified by this photo.
    pub tree_count: u32,
}

/// Emitted when campaign creator specifies or declares tree species.
#[contracttype]
#[derive(Clone)]
pub struct SpeciesDeclaredEvent {
    pub campaign_id: u64,
    pub species: Vec<String>,
}

/// Emitted when tree planting photo proof matching declared species is verified.
#[contracttype]
#[derive(Clone)]
pub struct SpeciesProofVerifiedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub photo_hash: BytesN<32>,
    pub species: String,
    pub tree_count: u32,
}

/// Entitlement unlocked by a campaign's verified tree count.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RewardTier {
    /// Unlocked at 1,000 verified trees.
    CustomBranding,
    /// Unlocked at 5,000 verified trees.
    WhiteLabel,
    /// Unlocked at 10,000 verified trees.
    ApiAccess,
}

/// Emitted once when a campaign crosses a verified-tree reward threshold.
#[contractevent(topics = ["RewardUnlocked"])]
#[derive(Clone)]
pub struct RewardUnlockedEvent {
    pub campaign_id: u64,
    pub tier: RewardTier,
    pub threshold: u64,
    pub verified_tree_count: u64,
}

/// Emitted when SLA verification refund is issued for unverified tree planting.
#[contracttype]
#[derive(Clone)]
pub struct SlaRefundIssuedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub contributor: Address,
    pub amount: i128,
}

/// Emitted when dynamic supply/demand pricing is evaluated for a campaign.
#[contractevent(topics = ["DynamicPricingEvaluated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DynamicPricingEvaluatedEvent {
    pub campaign_id: u64,
    pub base_cost: i128,
    pub dynamic_cost: i128,
    pub demand_multiplier_bps: u32,
    pub funding_percentage: u32,
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

/// Emitted when 10% of campaign funds are reserved for tree replacement.
#[contractevent(topics = ["ReserveAllocated"])]
#[derive(Clone)]
pub struct ReserveAllocatedEvent {
    pub campaign_id: u64,
    pub amount: i128,
}

/// Emitted when a team member receives their share of campaign proceeds.
#[contractevent(topics = ["TeamPayoutIssued"])]
#[derive(Clone)]
pub struct TeamPayoutIssuedEvent {
    pub campaign_id: u64,
    pub member: Address,
    pub amount: i128,
}

/// Emitted when ContractFull error occurs.
#[contracttype]
#[derive(Clone)]
pub struct ContractFullEvent {
    pub timestamp: u64,
}

/// Emitted once when carbon credit tokens are minted for a verified campaign.
///
/// One token (in stroops of the carbon credit token) is minted per tonne of
/// CO₂ equivalent. The total minted equals `verified_tree_count × co2_multiplier`
/// tokens (where each tree sequesters exactly 1 tonne CO₂ equivalent).
#[contracttype]
#[derive(Clone)]
pub struct CarbonCreditsMintedEvent {
    /// Campaign whose verified trees generated the credits.
    pub campaign_id: u64,
    /// Total carbon credit tokens minted in stroops.
    pub total_minted: i128,
    /// CO₂ multiplier applied (1 = dry season, 2 = rainy season).
    pub co2_multiplier: u32,
    /// Verified tree count at the time of minting.
    pub verified_tree_count: u64,
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
    /// Verification SLA period has not expired yet.
    SlaNotBreached = 18,
    /// Requested tree planting record was not found.
    PlantingNotFound = 19,
    /// Tree planting is already verified.
    AlreadyVerified = 20,
    /// The campaign is not in the `VerificationFailed` state.
    CampaignNotVerificationFailed = 21,
    /// The insurance pool fee rate exceeds the protocol maximum.
    InsuranceFeeTooHigh = 22,
    /// `set_team_rewards` was called with an empty team.
    TeamEmpty = 23,
    /// The team's `percentage_bps` values do not sum to exactly 100 %
    /// (`10_000`), or a member has a zero / out-of-range percentage.
    TeamInvalidSplit = 24,
    /// The team contains two members with the same payout address.
    TeamDuplicateMember = 25,
    /// Campaign ID space exhausted (u64::MAX reached).
    ContractFull = 26,
    /// Campaign is not verified.
    CampaignNotVerified = 27,
    /// The campaign is currently paused and cannot accept contributions.
    CampaignPaused = 28,
    /// The operation requires the campaign to be in the `Claimed` state.
    CampaignNotClaimed = 29,
    /// A reward stream already exists for this contributor on this campaign.
    RewardsAlreadyStreamed = 30,
    /// `set_stream_contract` has not been called yet.
    StreamContractNotSet = 31,
    /// Creators list is empty, mismatched in length, or shares do not sum to
    /// 10 000 bps, or a duplicate creator address was supplied.
    InvalidCreators = 32,
    /// No carbon credit token contract has been configured for this campaign.
    CarbonTokenNotSet = 33,
    /// Carbon credit tokens have already been minted for this campaign.
    CarbonCreditsAlreadyMinted = 34,
    /// The requested group sponsorship does not exist.
    GroupSponsorshipNotFound = 35,
    /// A group sponsorship name must not be empty.
    GroupNameEmpty = 36,
    /// A group sponsorship name exceeds the 64-byte limit.
    GroupNameTooLong = 37,
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
/// 30-day Tree Verification SLA duration in seconds (30 * 24 * 60 * 60).
const VERIFICATION_SLA_SECONDS: u64 = 2_592_000;
/// Refund tier 1 window: a campaign must start (planter assigned) within 60
/// days of creation (60 * 24 * 60 * 60 seconds) or sponsors are entitled to a
/// full refund.
const REFUND_TIER_START_SECONDS: u64 = 60 * 24 * 60 * 60;
/// Refund tier 2 window: trees must be planted within 90 days of creation
/// (90 * 24 * 60 * 60 seconds) or sponsors are entitled to a half refund.
const REFUND_TIER_PLANTING_SECONDS: u64 = 90 * 24 * 60 * 60;
/// Full refund percentage: the campaign never started within 60 days.
const REFUND_PERCENT_FULL: u32 = 100;
/// Partial refund percentage: the campaign started but no trees were planted
/// within 90 days.
const REFUND_PERCENT_PARTIAL: u32 = 50;
/// No refund percentage: the campaign completed (funds claimed) or trees were
/// planted within the 90-day window.
const REFUND_PERCENT_NONE: u32 = 0;

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
    /// * `creator`       — Address that owns the campaign and, unless a team
    ///   split is configured via [`set_team_rewards`], receives the proceeds
    ///   on success.
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
        tree_species: soroban_sdk::String,
    ) -> u64 {
        let mut creators = Vec::new(&env);
        creators.push_back(creator);
        let mut revenue_shares = Vec::new(&env);
        revenue_shares.push_back(10_000);
        Self::create_campaign_with_creators(
            env,
            creators,
            revenue_shares,
            token,
            target_amount,
            min_target,
            deadline,
            insurance_fee,
            tree_species,
        )
    }

    /// Create a campaign with multiple owners and proportional revenue shares.
    /// Every creator authorises the transaction; shares are basis points totaling 10,000.
    pub fn create_campaign_with_creators(
        env: Env,
        creators: Vec<Address>,
        revenue_shares: Vec<u32>,
        token: Address,
        target_amount: i128,
        min_target: i128,
        deadline: u64,
        insurance_fee: i128,
        tree_species: soroban_sdk::String,
    ) -> u64 {
        Self::assert_initialized(&env);
        Self::validate_creators(&env, &creators, &revenue_shares);
        for owner in creators.iter() {
            owner.require_auth();
        }

        if target_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if min_target <= 0 || min_target > target_amount {
            panic_with_error!(&env, Error::InvalidTarget);
        }
        let now = env.ledger().timestamp();
        if deadline <= now {
            panic_with_error!(&env, Error::InvalidDeadline);
        }
        if deadline > env.ledger().timestamp() + MAX_CAMPAIGN_DURATION_SECONDS {
            panic_with_error!(&env, Error::DeadlineTooFar);
        }
        if insurance_fee <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let primary_creator = creators.get(0).unwrap();

        // Compute CO₂ sequestration multiplier based on the current month.
        // Trees planted during the rainy season (April–October) sequester CO₂
        // at 2× the dry-season rate due to accelerated biomass growth.
        // The ledger timestamp is Unix seconds; we derive the calendar month
        // using the known epoch start (Jan 1 1970).
        let seconds_per_day: u64 = 86_400;
        let days_since_epoch = now / seconds_per_day;
        // Approximate the day-of-year without leap-year precision (sufficient for
        // a seasonal determination).
        let day_of_year = (days_since_epoch % 365) as u32;
        // Rainy season: day 90 (Apr 1) – day 303 (Oct 31) inclusive.
        let co2_multiplier: u32 = if day_of_year >= 90 && day_of_year <= 119 { 15 } else if day_of_year >= 120 && day_of_year <= 303 { 20 } else { 10 };

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        if count == u64::MAX {
            // Campaign ID space exhausted: reject gracefully instead of overflowing.
            env.events().publish(
                ("ContractFull",),
                ContractFullEvent {
                    timestamp: env.ledger().timestamp(),
                },
            );
            panic_with_error!(&env, Error::ContractFull);
        }
        count += 1;

        // Transfer the insurance fee from the primary creator to the contract's
        // insurance pool and record the pool balance.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(
            &primary_creator,
            &env.current_contract_address(),
            &insurance_fee,
        );

        let pool_key = DataKey::InsurancePool(token.clone());
        let mut pool_balance: i128 = env.storage().instance().get(&pool_key).unwrap_or(0);
        pool_balance += insurance_fee;
        env.storage().instance().set(&pool_key, &pool_balance);
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &count);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let creator = creators.get(0).unwrap();
        let campaign = Campaign {
            id: count,
            creator: creator.clone(),
            creators: creators.clone(),
            revenue_shares: revenue_shares.clone(),
            token: token.clone(),
            target_amount,
            min_target,
            deadline,
            total_raised: 0,
            status: CampaignStatus::Active,
            created_at: now,
            planter: OptionalAddress::None,
            co2_multiplier,
        };

        Self::save_campaign(&env, count, &campaign);
        Self::record_status_change(&env, count, CampaignStatus::Active);

        
        let co2_multiplier: u32 = 1;
        env.events().publish(
            ("CampaignCreated", count),
            CampaignCreatedEvent {
                campaign_id: count,
                creator,
                token,
                target_amount,
                min_target,
                deadline,
                co2_multiplier,
                tree_species,
            },
        );

        count
    }

    /// Verify a campaign after trees are planted.
    ///
    /// Only the contract admin can call this. Transitions campaign from Successful to Verified.
    ///
    /// # Arguments
    /// * `campaign_id` — ID of the campaign to verify.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]        — contract not initialised.
    /// * [`Error::Unauthorized`]          — caller is not the admin.
    /// * [`Error::CampaignNotFound`]      — campaign does not exist.
    /// * [`Error::CampaignNotSuccessful`] — campaign is not in `Successful` state.
    pub fn verify_campaign(env: Env, campaign_id: u64) {
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

        if campaign.status != CampaignStatus::Successful {
            panic_with_error!(&env, Error::CampaignNotSuccessful);
        }

        campaign.status = CampaignStatus::Verified;
        Self::save_campaign(&env, campaign_id, &campaign);
        Self::record_status_change(&env, campaign_id, CampaignStatus::Verified);

        env.events().publish(
            ("CampaignStatusChanged", campaign_id),
            CampaignStatusChangedEvent {
                campaign_id,
                new_status: CampaignStatus::Verified,
            },
        );
    }

    /// Assign a planter to a campaign, marking it as started.
    ///
    /// This anchors the tiered refund policy to an explicit on-chain action:
    /// the 60-day full-refund window only applies while no planter has been
    /// assigned. Assignment is permanent — the first assignment wins and any
    /// later attempt fails with [`Error::PlanterAlreadyAssigned`], so the
    /// refund outcome can never be changed retroactively.
    ///
    /// Only the contract admin can call this.
    ///
    /// # Arguments
    /// * `campaign_id` — ID of the campaign to assign the planter to.
    /// * `planter`     — Address of the planter responsible for planting.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]        — contract not initialised.
    /// * [`Error::Unauthorized`]          — caller is not the admin.
    /// * [`Error::CampaignNotFound`]      — campaign does not exist.
    /// * [`Error::PlanterAlreadyAssigned`] — campaign already has a planter.
    pub fn assign_planter(env: Env, campaign_id: u64, planter: Address) {
        Self::assert_initialized(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let mut campaign = Self::load_campaign(&env, campaign_id);

        if campaign.planter != OptionalAddress::None {
            panic_with_error!(&env, Error::PlanterAlreadyAssigned);
        }

        campaign.planter = OptionalAddress::Some(planter.clone());
        Self::save_campaign(&env, campaign_id, &campaign);

        env.events().publish(
            ("PlanterAssigned", campaign_id),
            PlanterAssignedEvent {
                campaign_id,
                planter,
                assigned_at: env.ledger().timestamp(),
            },
        );
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

    /// Create a named group sponsorship for an active campaign.
    ///
    /// Members contribute individually through [`contribute_to_group`], so
    /// their existing refund and reward records remain tied to their wallets.
    /// Names are limited to 64 UTF-8 bytes and need not be unique.
    pub fn create_group_sponsorship(
        env: Env,
        organizer: Address,
        campaign_id: u64,
        name: soroban_sdk::String,
    ) -> u64 {
        organizer.require_auth();
        let campaign = Self::load_campaign(&env, campaign_id);
        if campaign.status == CampaignStatus::Paused {
            panic_with_error!(&env, Error::CampaignPaused);
        }
        if campaign.status != CampaignStatus::Active
            || env.ledger().timestamp() >= campaign.deadline
        {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if name.len() == 0 {
            panic_with_error!(&env, Error::GroupNameEmpty);
        }
        if name.len() > 64 {
            panic_with_error!(&env, Error::GroupNameTooLong);
        }

        let count_key = DataKey::GroupSponsorshipCount(campaign_id);
        let previous_count: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let group_id = previous_count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ContractFull));
        let group = GroupSponsorship {
            campaign_id,
            group_id,
            name: name.clone(),
            organizer: organizer.clone(),
            total_contributed: 0,
        };
        let group_key = DataKey::GroupSponsorship(campaign_id, group_id);
        env.storage().persistent().set(&group_key, &group);
        env.storage().persistent().set(&count_key, &group_id);
        env.storage()
            .persistent()
            .extend_ttl(&group_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .persistent()
            .extend_ttl(&count_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events().publish(
            ("GroupSponsorshipCreated", campaign_id),
            GroupSponsorshipCreatedEvent {
                campaign_id,
                group_id,
                name,
                organizer,
            },
        );
        group_id
    }

    /// Contribute individually to a campaign through a named group.
    pub fn contribute_to_group(
        env: Env,
        contributor: Address,
        campaign_id: u64,
        group_id: u64,
        amount: i128,
    ) {
        contributor.require_auth();
        let group_key = DataKey::GroupSponsorship(campaign_id, group_id);
        let mut group: GroupSponsorship = env
            .storage()
            .persistent()
            .get(&group_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::GroupSponsorshipNotFound));

        Self::contribute(env.clone(), contributor.clone(), campaign_id, amount);

        group.total_contributed = group
            .total_contributed
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&group_key, &group);
        env.storage()
            .persistent()
            .extend_ttl(&group_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events().publish(
            ("GroupContributionMade", campaign_id),
            GroupContributionMadeEvent {
                campaign_id,
                group_id,
                contributor,
                amount,
                group_total: group.total_contributed,
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
        Self::contribute_internal(env, contributor, campaign_id, amount, false);
    }

    /// Contribute to a campaign without publishing the sponsor address in the
    /// contribution event. The transaction signer and ledger storage remain
    /// publicly inspectable; this only supports anonymous display in campaign
    /// interfaces.
    pub fn contribute_anonymously(
        env: Env,
        contributor: Address,
        campaign_id: u64,
        amount: i128,
    ) {
        Self::contribute_internal(env, contributor, campaign_id, amount, true);
    }

    fn contribute_internal(
        env: Env,
        contributor: Address,
        campaign_id: u64,
        amount: i128,
        anonymous: bool,
    ) {
        contributor.require_auth();

        let mut campaign = Self::load_campaign(&env, campaign_id);

        if campaign.status == CampaignStatus::Paused {
            panic_with_error!(&env, Error::CampaignPaused);
        }
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

        // Update per-contributor balance. This is always the sponsor's gross
        // amount, so a later refund returns the original contribution rather
        // than any fee-adjusted net amount.
        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        let prev: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        let new_contrib = prev
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&contrib_key, &new_contrib);
        // Keep the gross sponsor amount separate from any future fee or
        // matching accounting so refunds always return the original deposit.
        let original_key = DataKey::OriginalContribution(campaign_id, contributor.clone());
        let original = prev.checked_add(amount).unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&original_key, &original);
        env.storage().persistent().extend_ttl(&contrib_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().persistent().extend_ttl(&original_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        // Apply available admin-funded matching dollar-for-dollar. Matching
        // is bounded by both the remaining campaign target and its budget.
        let matching_cap: i128 = env.storage().persistent().get(&DataKey::MatchingCap(campaign_id)).unwrap_or(0);
        let matching_used: i128 = env.storage().persistent().get(&DataKey::MatchingUsed(campaign_id)).unwrap_or(0);
        let matching_balance: i128 = env.storage().persistent().get(&DataKey::MatchingBalance(campaign_id)).unwrap_or(0);
        let remaining_budget = matching_cap.saturating_sub(matching_used);
        let remaining_target = campaign.target_amount.saturating_sub(new_total);
        let matched = amount.min(remaining_budget).min(matching_balance).min(remaining_target);
        if matched > 0 {
            let updated_matching = matching_used.checked_add(matched).unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
            env.storage().persistent().set(&DataKey::MatchingUsed(campaign_id), &updated_matching);
            env.storage().persistent().set(&DataKey::MatchingBalance(campaign_id), &(matching_balance - matched));
        }
        campaign.total_raised = new_total.checked_add(matched).unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        // Auto-succeed when the hard cap is reached.
        if campaign.total_raised >= campaign.target_amount {
            campaign.status = CampaignStatus::Successful;
            Self::record_status_change(&env, campaign_id, CampaignStatus::Successful);
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

        if anonymous {
            env.events().publish(
                ("AnonymousContributionMade", campaign_id),
                AnonymousContributionMadeEvent {
                    campaign_id,
                    amount,
                    total_raised: campaign.total_raised,
                },
            );
        } else {
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

        if campaign.status != CampaignStatus::Active && campaign.status != CampaignStatus::Paused {
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
        Self::record_status_change(&env, campaign_id, new_status);
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
    /// from `total_raised`, then 10% of the remaining amount is reserved for
    /// tree replacement during verification. The final 90% is distributed:
    /// if the creator previously configured a team split via [`set_team_rewards`],
    /// the proceeds are paid out to each co-creator proportionally, otherwise
    /// the full amount is sent to the sole `creator`. The campaign status is
    /// updated to `Claimed` to prevent double-claims.
    ///
    /// When the fee is non-zero a [`ProtocolFeeCollectedEvent`] is emitted so
    /// the fee flow is recorded on-chain alongside the contribution, payout,
    /// and refund events; every team payout is published as a
    /// [`TeamPayoutIssuedEvent`].
    ///
    /// # Errors
    /// * [`Error::CampaignNotSuccessful`] — campaign is not `Successful`.
    /// * [`Error::AlreadyClaimed`]        — funds were already claimed.
    /// * [`Error::Unauthorized`]          — the creator group did not authorise.
    /// * [`Error::VerificationNotApproved`] — the verifier has not approved
    ///   the campaign's planting records.
    pub fn claim_funds(env: Env, campaign_id: u64) {
        let mut campaign = Self::load_campaign(&env, campaign_id);

        for owner in campaign.creators.iter() {
            owner.require_auth();
        }
        if campaign.status == CampaignStatus::Claimed {
            panic_with_error!(&env, Error::AlreadyClaimed);
        }
        if campaign.status != CampaignStatus::Verified {
            panic_with_error!(&env, Error::CampaignNotVerified);
        }
        if !env
            .storage()
            .persistent()
            .get(&DataKey::VerificationApproved(campaign_id))
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::VerificationNotApproved);
        }

        let gross = campaign.total_raised;
        let fee = Self::calculate_fee(&env, gross);
        let after_fee = gross - fee;

        // Calculate 10% reserve for tree replacement (1000 bps = 10%)
        let reserve = Self::calculate_reserve(&env, after_fee);
        let distributable = after_fee - reserve;

        campaign.status = CampaignStatus::Claimed;
        Self::record_status_change(&env, campaign_id, CampaignStatus::Claimed);
        Self::save_campaign(&env, campaign_id, &campaign);

        let token_client = token::Client::new(&env, &campaign.token);

        // Transfer protocol fee
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

        // Store reserve in contract storage
        if reserve > 0 {
            let reserve_key = DataKey::Reserve(campaign_id);
            env.storage().persistent().set(&reserve_key, &reserve);
            env.storage()
                .persistent()
                .extend_ttl(&reserve_key, LEDGER_THRESHOLD, LEDGER_BUMP);

            ReserveAllocatedEvent {
                campaign_id,
                amount: reserve,
            }
            .publish(&env);
        }

        // Distribute remaining 90% to creator or team
        Self::distribute_proceeds(&env, &campaign, campaign_id, distributable);

        env.events().publish(
            ("FundsClaimed", campaign_id),
            FundsClaimedEvent {
                campaign_id,
                creator: campaign.creator,
                amount: distributable,
            },
        );
    }

    /// Approve a successful campaign for payout after all recorded planting
    /// batches have been verified by the contract admin.
    pub fn approve_campaign_verification(env: Env, campaign_id: u64) {
        Self::assert_initialized(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let campaign = Self::load_campaign(&env, campaign_id);
        if campaign.status != CampaignStatus::Successful {
            panic_with_error!(&env, Error::CampaignNotSuccessful);
        }

        let planting_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PlantingCount(campaign_id))
            .unwrap_or(0);
        if planting_count == 0 {
            panic_with_error!(&env, Error::PlantingNotFound);
        }

        for planting_id in 1..=planting_count {
            let record: PlantingSlaRecord = env
                .storage()
                .persistent()
                .get(&DataKey::PlantingSla(campaign_id, planting_id))
                .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));
            if !record.is_verified {
                panic_with_error!(&env, Error::VerificationNotApproved);
            }
        }

        let approval_key = DataKey::VerificationApproved(campaign_id);
        env.storage().persistent().set(&approval_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&approval_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        let approved_at = env.ledger().timestamp();
        env.events().publish(
            ("CampaignVerificationApproved", campaign_id),
            CampaignVerificationApprovedEvent {
                campaign_id,
                approved_at,
            },
        );
    }

    /// Configure how a successful campaign's proceeds are split amongst a
    /// team of co-creators.
    ///
    /// Only the campaign `creator` may call this, and only while the campaign
    /// is still [`CampaignStatus::Active`] (before funds are claimed). Once
    /// set, `claim_funds` divides the net proceeds (after the protocol fee)
    /// among the team members according to their `percentage_bps`, rather than
    /// sending everything to the single `creator`.
    ///
    /// # Arguments
    /// * `campaign_id` — The campaign to configure.
    /// * `team`        — Non-empty list of [`TeamMember`]s whose
    ///   `percentage_bps` values sum to exactly `10_000` (100 %).
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`]       — campaign does not exist.
    /// * [`Error::Unauthorized`]           — caller is not the campaign creator.
    /// * [`Error::CampaignNotActive`]      — campaign is not `Active`.
    /// * [`Error::TeamEmpty`]              — `team` is empty.
    /// * [`Error::TeamDuplicateMember`]    — a payout address appears twice.
    /// * [`Error::TeamInvalidSplit`]       — percentages do not sum to 100 % or
    ///   a member percentage is zero / out of range.
    pub fn set_team_rewards(env: Env, campaign_id: u64, team: Vec<TeamMember>) {
        let mut campaign = Self::load_campaign(&env, campaign_id);
        campaign.creator.require_auth();

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if team.is_empty() {
            panic_with_error!(&env, Error::TeamEmpty);
        }

        let mut total: u32 = 0;
        for i in 0..team.len() {
            let member = team.get(i).unwrap();
            if member.percentage_bps == 0 || member.percentage_bps > 10_000u32 {
                panic_with_error!(&env, Error::TeamInvalidSplit);
            }
            for j in (i + 1)..team.len() {
                if team.get(j).unwrap().address == member.address {
                    panic_with_error!(&env, Error::TeamDuplicateMember);
                }
            }
            total = total
                .checked_add(member.percentage_bps)
                .unwrap_or_else(|| panic_with_error!(&env, Error::TeamInvalidSplit));
        }
        if total != 10_000u32 {
            panic_with_error!(&env, Error::TeamInvalidSplit);
        }

        let key = DataKey::TeamMembers(campaign_id);
        env.storage().persistent().set(&key, &team);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        Self::save_campaign(&env, campaign_id, &campaign);
    }

    /// Return the configured team rewards for a campaign.
    ///
    /// Returns `[]` when no team split has been set up for `campaign_id`
    /// (in which case the proceeds go entirely to the single `creator`).
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — campaign does not exist.
    pub fn get_team_rewards(env: Env, campaign_id: u64) -> Vec<TeamMember> {
        let key = DataKey::TeamMembers(campaign_id);
        // Validate the campaign exists before reading its (absent) team.
        Self::load_campaign(&env, campaign_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Compute the refund percentage a contributor is entitled to.
    ///
    /// Implements the tiered refund policy (issue #889):
    ///
    /// | Tier | Condition | Refund |
    /// |------|-----------|--------|
    /// | 1 | Campaign never started (no planter assigned) within 60 days of creation | 100 % |
    /// | 2 | Campaign started but no trees planted within 90 days of creation | 50 % |
    /// | 3 | Campaign completed (`Claimed` / `VerificationFailed`) or trees planted within the 90-day window | 0 % |
    ///
    /// A campaign that reached its deadline without meeting `min_target`
    /// (`Failed` status) always refunds in full regardless of these windows.
    ///
    /// # Arguments
    /// * `campaign`    — The campaign to evaluate.
    /// * `campaign_id` — ID of the campaign (used to look up planting state).
    ///
    /// # Returns
    /// The refund percentage: 100, 50, or 0.
    fn compute_refund_percent(env: &Env, campaign: &Campaign, campaign_id: u64) -> u32 {
        let now = env.ledger().timestamp();

        // Completed campaigns (funds claimed) and insurance-refund states are
        // terminal: nothing is refundable through this entry point.
        if campaign.status == CampaignStatus::Claimed
            || campaign.status == CampaignStatus::VerificationFailed
        {
            return REFUND_PERCENT_NONE;
        }

        // A campaign that failed its funding target refunds in full.
        if campaign.status == CampaignStatus::Failed {
            return REFUND_PERCENT_FULL;
        }

        // Tier 1 — the campaign never started within 60 days.
        if campaign.planter == OptionalAddress::None
            && now > campaign.created_at + REFUND_TIER_START_SECONDS
        {
            return REFUND_PERCENT_FULL;
        }

        // Tier 2 — started but no trees planted within 90 days.
        let planting_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PlantingCount(campaign_id))
            .unwrap_or(0);
        if planting_count == 0 && now > campaign.created_at + REFUND_TIER_PLANTING_SECONDS {
            return REFUND_PERCENT_PARTIAL;
        }

        REFUND_PERCENT_NONE
    }

    /// Return the refund tier a contributor currently falls into.
    ///
    /// * `100` — full refund (campaign failed, or never started within 60 days)
    /// * `50`  — partial refund (started but no trees planted within 90 days)
    /// * `0`   — no refund (completed campaign, or trees planted in time)
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — campaign does not exist.
    pub fn get_refund_percent(env: Env, campaign_id: u64) -> u32 {
        let campaign = Self::load_campaign(&env, campaign_id);
        Self::compute_refund_percent(&env, &campaign, campaign_id)
    }

    /// Claim a refund according to the tiered refund policy (issue #889).
    ///
    /// Each contributor calls this individually to recover their share of the
    /// escrowed contribution:
    ///
    /// * **100 %** — campaign failed its funding target, or never started
    ///   (no planter assigned) within 60 days of creation.
    /// * **50 %** — campaign started but no trees were planted within 90 days
    ///   of creation. The remaining 50 % stays escrowed for the planter who
    ///   ultimately fulfils the commitment.
    /// * **0 %** — the campaign completed (`Claimed`) or entered
    ///   `VerificationFailed`; refunds are handled by the insurance flow
    ///   instead.
    ///
    /// The refunded portion of the contribution record is cleared before the
    /// transfer executes (check-effects-interactions pattern) to prevent
    /// double-refunds. A 50 % refund clears the record entirely — the
    /// contributor cannot claim the remaining half later.
    ///
    /// # Arguments
    /// * `contributor`  — The address reclaiming their contribution.
    /// * `campaign_id`  — The campaign to refund from.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFailed`]    — refund percentage is 0 % (campaign
    ///   completed or still within all refund windows).
    /// * [`Error::NoContributionFound`]  — caller has no recorded contribution.
    pub fn refund(env: Env, contributor: Address, campaign_id: u64) {
        contributor.require_auth();

        let campaign = Self::load_campaign(&env, campaign_id);

        let refund_percent = Self::compute_refund_percent(&env, &campaign, campaign_id);
        if refund_percent == 0 {
            panic_with_error!(&env, Error::CampaignNotFailed);
        }

        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        // Prefer the gross ledger. The fallback lets pre-upgrade records
        // continue to refund correctly because Contribution was historically
        // the gross sponsor amount.
        let original_key = DataKey::OriginalContribution(campaign_id, contributor.clone());
        let amount: i128 = env.storage().persistent().get(&original_key)
            .or_else(|| env.storage().persistent().get(&contrib_key))
            .unwrap_or(0);

        if amount <= 0 {
            panic_with_error!(&env, Error::NoContributionFound);
        }

        let refund_amount = (amount * refund_percent as i128) / 100;

        // Clear before transferring (check-effects-interactions).
        env.storage().persistent().remove(&contrib_key);
        env.storage().persistent().remove(&original_key);

        let token_client = token::Client::new(&env, &campaign.token);
        if refund_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &contributor, &refund_amount);
        }

        env.events().publish(
            ("RefundIssued", campaign_id),
            RefundIssuedEvent {
                campaign_id,
                contributor,
                amount: refund_amount,
            },
        );
    }

    // -----------------------------------------------------------------------
    // Reward streaming
    // -----------------------------------------------------------------------

    /// Stream a sponsor's reward back to them over 12 months after campaign
    /// completion.
    ///
    /// Instead of a lump-sum distribution at campaign end, sponsors (i.e.
    /// contributors) receive their reward via a linear payment stream that
    /// vests continuously over the 12 months following the current ledger
    /// time.  The campaign contract acts as the stream `sender`, transferring
    /// the sponsor's pro-rata contribution amount through the configured
    /// payment-stream contract.
    ///
    /// This function is **permissionless** after `claim_funds` has been
    /// called — anyone may initiate the reward stream for any contributor.
    /// This ensures sponsors are not dependent on a centralised party to
    /// trigger their stream.
    ///
    /// # How the reward amount is determined
    ///
    /// The reward equals the contributor's recorded escrow balance for the
    /// campaign (`Contribution(campaign_id, contributor)`).  These tokens
    /// have already been transferred to the contract during `contribute`, so
    /// the contract holds the funds and can approve a transfer to the stream.
    ///
    /// > Note: `claim_funds` sends the *creator's net proceeds* out of the
    /// > contract, **not** the contributors' balances.  The contributor
    /// > escrow entries remain intact and are used here.
    ///
    /// # Arguments
    /// * `campaign_id`  — The completed (Claimed) campaign.
    /// * `contributor`  — Sponsor address to receive the reward stream.
    ///
    /// # Returns
    /// The `u64` stream ID assigned by the payment-stream contract.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`]       — no campaign with this ID.
    /// * [`Error::CampaignNotClaimed`]     — campaign has not yet been claimed
    ///   by the creator.
    /// * [`Error::NoContributionFound`]    — contributor has no escrow balance.
    /// * [`Error::StreamContractNotSet`]   — admin has not called
    ///   `set_stream_contract`.
    /// * [`Error::RewardsAlreadyStreamed`]  — a stream was already created for
    ///   this contributor on this campaign.
    pub fn stream_sponsor_rewards(
        env: Env,
        campaign_id: u64,
        contributor: Address,
    ) -> u64 {
        let campaign = Self::load_campaign(&env, campaign_id);

        // Reward streams are only valid after the creator has claimed funds.
        if campaign.status != CampaignStatus::Claimed {
            panic_with_error!(&env, Error::CampaignNotClaimed);
        }

        // Retrieve the contributor's escrowed balance (reward amount).
        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        let reward_amount: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        if reward_amount <= 0 {
            panic_with_error!(&env, Error::NoContributionFound);
        }

        // Guard against duplicate reward streams.
        let streamed_key = DataKey::RewardStreamed(campaign_id, contributor.clone());
        if env.storage().persistent().get(&streamed_key).unwrap_or(false) {
            panic_with_error!(&env, Error::RewardsAlreadyStreamed);
        }

        // Ensure the stream contract has been configured.
        let stream_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::StreamContract)
            .unwrap_or_else(|| panic_with_error!(&env, Error::StreamContractNotSet));

        // Build the 12-month stream window starting now.
        let start_time: u64 = env.ledger().timestamp();
        let end_time: u64 = start_time
            .checked_add(TWELVE_MONTHS_SECS)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        // The campaign contract is the stream sender; it must approve the
        // payment-stream contract to pull `reward_amount` of the campaign
        // token.
        let token_client = token::Client::new(&env, &campaign.token);
        token_client.approve(
            &env.current_contract_address(),
            &stream_contract,
            &reward_amount,
            &(env.ledger().sequence() + LEDGER_BUMP),
        );

        // Cross-contract call: invoke `create_stream` on the payment-stream
        // contract.  The campaign contract address is the sender so that the
        // stream contract pulls from this contract's token allowance.
        let stream_id: u64 = env.invoke_contract(
            &stream_contract,
            &Symbol::new(&env, "create_stream"),
            soroban_sdk::vec![
                &env,
                env.current_contract_address().into_val(&env),
                contributor.clone().into_val(&env),
                campaign.token.clone().into_val(&env),
                reward_amount.into_val(&env),
                0i128.into_val(&env),
                start_time.into_val(&env),
                end_time.into_val(&env),
            ],
        );

        // Mark the reward as streamed before returning (check-effects).
        env.storage().persistent().set(&streamed_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&streamed_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("SponsorRewardStreamed", campaign_id),
            SponsorRewardStreamedEvent {
                campaign_id,
                contributor,
                amount: reward_amount,
                stream_id,
                start_time,
                end_time,
            },
        );

        stream_id
    }

    /// Check whether a reward stream has already been created for a given
    /// sponsor on a specific campaign.
    ///
    /// Returns `true` if `stream_sponsor_rewards` was previously called and
    /// succeeded for this `(campaign_id, contributor)` pair.
    pub fn is_reward_streamed(env: Env, campaign_id: u64, contributor: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::RewardStreamed(campaign_id, contributor))
            .unwrap_or(false)
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

    /// Add a co-creator before a campaign succeeds. All current creators and
    /// the new owner must authorise the change.
    pub fn add_creator(env: Env, campaign_id: u64, creator: Address, share: u32) {
        let mut campaign = Self::load_campaign(&env, campaign_id);
        for owner in campaign.creators.iter() {
            owner.require_auth();
        }
        if campaign.status != CampaignStatus::Active || share == 0 {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if campaign.creators.iter().any(|item| item == creator) {
            panic_with_error!(&env, Error::CreatorAlreadyExists);
        }
        creator.require_auth();
        let total = campaign
            .revenue_shares
            .iter()
            .fold(0u32, |sum, value| sum + value);
        if total + share > 10_000 {
            panic_with_error!(&env, Error::InvalidCreators);
        }
        campaign.creators.push_back(creator);
        campaign.revenue_shares.push_back(share);
        Self::save_campaign(&env, campaign_id, &campaign);
    }

    /// Return all campaign owners in payout order.
    pub fn get_campaign_creators(env: Env, campaign_id: u64) -> Vec<Address> {
        Self::load_campaign(&env, campaign_id).creators
    }

    /// Return revenue shares in basis points and payout order.
    pub fn get_campaign_revenue_shares(env: Env, campaign_id: u64) -> Vec<u32> {
        Self::load_campaign(&env, campaign_id).revenue_shares
    }

    /// Return one group's sponsorship record and cumulative contribution.
    pub fn get_group_sponsorship(
        env: Env,
        campaign_id: u64,
        group_id: u64,
    ) -> GroupSponsorship {
        Self::load_campaign(&env, campaign_id);
        env.storage()
            .persistent()
            .get(&DataKey::GroupSponsorship(campaign_id, group_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::GroupSponsorshipNotFound))
    }

    /// Return all group sponsorships for a campaign in creation order.
    pub fn get_group_sponsorships(env: Env, campaign_id: u64) -> Vec<GroupSponsorship> {
        Self::load_campaign(&env, campaign_id);
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GroupSponsorshipCount(campaign_id))
            .unwrap_or(0);
        let mut groups = Vec::new(&env);
        let mut group_id = 1;
        while group_id <= count {
            if let Some(group) = env
                .storage()
                .persistent()
                .get(&DataKey::GroupSponsorship(campaign_id, group_id))
            {
                groups.push_back(group);
            }
            group_id += 1;
        }
        groups
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

    /// Return the full status history for a campaign.
    ///
    /// Returns a vector of `(status, timestamp)` tuples representing all
    /// status changes in chronological order, starting from the initial
    /// `Active` status at campaign creation.
    ///
    /// # Arguments
    /// * `campaign_id` — The campaign to query.
    ///
    /// # Returns
    /// A vector of status history entries ordered from oldest to newest.
    pub fn get_status_history(env: Env, campaign_id: u64) -> Vec<StatusHistoryEntry> {
        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::StatusHistoryCount(campaign_id))
            .unwrap_or(0);

        let mut history = Vec::new(&env);
        for i in 0..count {
            if let Some(entry) = env
                .storage()
                .persistent()
                .get(&DataKey::StatusHistory(campaign_id, i))
            {
                history.push_back(entry);
            }
        }
        history
    }

    /// Return the configured payment-stream contract address, if any.
    pub fn get_stream_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::StreamContract)
    }

    /// Return the CO₂ multiplier that was active when this campaign was created.
    ///
    /// Returns `1` for dry-season campaigns and `2` for rainy-season campaigns.
    /// Defaults to `1` if the campaign pre-dates the multiplier feature or if no
    /// override was recorded.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — campaign does not exist.
    pub fn get_co2_multiplier(env: Env, campaign_id: u64) -> u32 {
        let campaign = Self::load_campaign(&env, campaign_id);
        let stored = campaign.co2_multiplier.max(1);
        if stored <= 2 { stored * 10 } else { stored }
    }

    /// Configure the ERC-20–compatible carbon credit token contract for a campaign.
    ///
    /// Must be called by the admin before `mint_carbon_credits` can be invoked.
    /// The carbon credit token contract must implement the Soroban token interface
    /// (SEP-0041) and grant this contract address minting authority.
    ///
    /// # Arguments
    /// * `campaign_id`    — Target campaign.
    /// * `carbon_token`   — Address of the SEP-0041 Stellar asset contract that
    ///   will be used to mint carbon credit tokens.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]   — contract not yet initialised.
    /// * [`Error::Unauthorized`]     — caller is not the admin.
    /// * [`Error::CampaignNotFound`] — campaign does not exist.
    pub fn set_carbon_token(env: Env, campaign_id: u64, carbon_token: Address) {
        Self::assert_initialized(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        // Validate campaign exists.
        let _ = Self::load_campaign(&env, campaign_id);

        let key = DataKey::CarbonToken(campaign_id);
        env.storage().persistent().set(&key, &carbon_token);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Mint ERC-20–compatible carbon credit tokens for all sponsors of a verified campaign.
    ///
    /// Carbon credits represent verified CO₂ removal: each verified tree sequesters
    /// 1 tonne of CO₂ equivalent, multiplied by the campaign's CO₂ multiplier
    /// (1× for dry season, 2× for rainy season).  Tokens are distributed to sponsors
    /// proportional to their original contribution amount.
    ///
    /// Minting is idempotent-guarded: it can only succeed once per campaign.  The
    /// carbon credit token contract (`carbon_token`) must implement the Soroban
    /// token admin interface (`StellarAssetClient`) and this contract must hold
    /// minting authority over it.
    ///
    /// # Arguments
    /// * `campaign_id`    — ID of the verified campaign.
    /// * `contributors`   — Ordered list of contributor addresses that funded
    ///   the campaign.  Each address must have a recorded contribution.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`]             — contract not yet initialised.
    /// * [`Error::Unauthorized`]               — caller is not the admin.
    /// * [`Error::CampaignNotFound`]           — campaign does not exist.
    /// * [`Error::CampaignNotVerified`]        — campaign has not been verified.
    /// * [`Error::CarbonTokenNotSet`]          — carbon credit token not configured.
    /// * [`Error::CarbonCreditsAlreadyMinted`] — credits have already been minted.
    pub fn mint_carbon_credits(env: Env, campaign_id: u64, contributors: Vec<Address>) {
        Self::assert_initialized(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        let campaign = Self::load_campaign(&env, campaign_id);

        // Only mint after trees are verified.
        if campaign.status != CampaignStatus::Verified && campaign.status != CampaignStatus::Claimed {
            panic_with_error!(&env, Error::CampaignNotVerified);
        }

        // Guard against double-minting.
        let minted_key = DataKey::CarbonCreditsMinted(campaign_id);
        if env.storage().persistent().get(&minted_key).unwrap_or(false) {
            panic_with_error!(&env, Error::CarbonCreditsAlreadyMinted);
        }

        // Retrieve the carbon credit token contract address.
        let token_key = DataKey::CarbonToken(campaign_id);
        let carbon_token: Address = env
            .storage()
            .persistent()
            .get(&token_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CarbonTokenNotSet));

        // Total credits = verified_trees × co2_multiplier (1 credit = 1 tonne CO₂).
        let verified_trees: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::VerifiedTreeCount(campaign_id))
            .unwrap_or(0);

        let stored = campaign.co2_multiplier.max(1);
        let actual_multiplier = if stored <= 2 { stored * 10 } else { stored } as i128;
        let total_credits: i128 = (verified_trees as i128)
            .checked_mul(actual_multiplier)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
            / 10;

        if total_credits <= 0 || contributors.is_empty() {
            // Nothing to mint — mark as done and return.
            env.storage().persistent().set(&minted_key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&minted_key, LEDGER_THRESHOLD, LEDGER_BUMP);
            return;
        }

        // Sum all original contributions to compute each sponsor's pro-rata share.
        let mut total_contributed: i128 = 0;
        for contributor in contributors.iter() {
            let original_key = DataKey::OriginalContribution(campaign_id, contributor.clone());
            let contrib: i128 = env
                .storage()
                .persistent()
                .get(&original_key)
                .unwrap_or_else(|| {
                    // Fall back to the current contribution key for older records.
                    env.storage()
                        .persistent()
                        .get(&DataKey::Contribution(campaign_id, contributor.clone()))
                        .unwrap_or(0)
                });
            total_contributed = total_contributed
                .checked_add(contrib)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        }

        if total_contributed <= 0 {
            env.storage().persistent().set(&minted_key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&minted_key, LEDGER_THRESHOLD, LEDGER_BUMP);
            return;
        }

        // Mint tokens via the SEP-0041 StellarAssetClient (admin mint interface).
        let carbon_token_admin = token::StellarAssetClient::new(&env, &carbon_token);

        let n = contributors.len();
        let mut already_minted: i128 = 0;
        for i in 0..n {
            let contributor = contributors.get(i).unwrap();
            let original_key = DataKey::OriginalContribution(campaign_id, contributor.clone());
            let contrib: i128 = env
                .storage()
                .persistent()
                .get(&original_key)
                .unwrap_or_else(|| {
                    env.storage()
                        .persistent()
                        .get(&DataKey::Contribution(campaign_id, contributor.clone()))
                        .unwrap_or(0)
                });
            if contrib <= 0 {
                continue;
            }

            // Last contributor receives the exact remainder to ensure the sum
            // equals `total_credits` exactly (no rounding dust left in contract).
            let sponsor_credits = if i + 1 == n {
                total_credits - already_minted
            } else {
                // Proportional share with ceiling division on the remainder.
                let q = total_credits / total_contributed;
                let r = total_credits % total_contributed;
                let remainder_share = r
                    .checked_mul(contrib)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
                    .checked_add(total_contributed - 1)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
                    / total_contributed;
                q.checked_mul(contrib)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
                    .checked_add(remainder_share)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
            };

            if sponsor_credits > 0 {
                carbon_token_admin.mint(&contributor, &sponsor_credits);
                already_minted = already_minted
                    .checked_add(sponsor_credits)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
            }
        }

        // Mark as minted (check-effects pattern).
        env.storage().persistent().set(&minted_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&minted_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("CarbonCreditsMinted", campaign_id),
            CarbonCreditsMintedEvent {
                campaign_id,
                total_minted: already_minted,
                co2_multiplier: if campaign.co2_multiplier.max(1) <= 2 { campaign.co2_multiplier.max(1) * 10 } else { campaign.co2_multiplier.max(1) },
                verified_tree_count: verified_trees,
            },
        );
    }

    /// Retrieve the configured carbon credit token contract address for a campaign.
    pub fn get_carbon_token(env: Env, campaign_id: u64) -> Option<Address> {
        let key = DataKey::CarbonToken(campaign_id);
        env.storage().persistent().get(&key)
    }

    /// Check if carbon credit tokens have already been minted for a campaign.
    pub fn is_carbon_credit_minted(env: Env, campaign_id: u64) -> bool {
        let minted_key = DataKey::CarbonCreditsMinted(campaign_id);
        env.storage().persistent().get(&minted_key).unwrap_or(false)
    }

    /// Calculate the carbon credit token allocation (1 token = 1 ton CO2 eq) for a sponsor.
    pub fn get_sponsor_carbon_credit_allocation(
        env: Env,
        campaign_id: u64,
        sponsor: Address,
    ) -> i128 {
        let campaign = Self::load_campaign(&env, campaign_id);
        if campaign.total_raised == 0 {
            return 0;
        }

        let contribution_key = DataKey::Contribution(campaign_id, sponsor);
        let sponsor_contrib: i128 = env.storage().persistent().get(&contribution_key).unwrap_or(0);
        if sponsor_contrib <= 0 {
            return 0;
        }

        let verified_trees = Self::get_verified_tree_count(env.clone(), campaign_id);
        let multiplier = Self::get_co2_multiplier(env.clone(), campaign_id);
        let total_credits = (verified_trees as i128).saturating_mul(multiplier as i128) / 10;

        // Sponsor credits = (sponsor_contrib * total_credits) / total_raised
        (sponsor_contrib.saturating_mul(total_credits)) / campaign.total_raised
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

    /// Set the payment-stream contract address used by `stream_sponsor_rewards`.
    ///
    /// Requires admin authorisation.  This must be called once after
    /// deployment to enable the reward-streaming feature.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — contract not yet initialised.
    pub fn set_stream_contract(env: Env, stream_contract: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::StreamContract, &stream_contract);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // IPFS Metadata Storage (issue #743)
    // -----------------------------------------------------------------------

    /// Set or update the decentralized IPFS metadata hash for a campaign.
    pub fn set_campaign_ipfs_hash(env: Env, campaign_id: u64, ipfs_hash: soroban_sdk::String) {
        let campaign = Self::load_campaign(&env, campaign_id);
        campaign.creator.require_auth();

        let key = DataKey::CampaignIpfsHash(campaign_id);
        env.storage().persistent().set(&key, &ipfs_hash);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("CampaignIpfsHashUpdated", campaign_id),
            CampaignIpfsHashUpdatedEvent {
                campaign_id,
                ipfs_hash,
            },
        );
    }

    /// Retrieve the IPFS metadata hash associated with a campaign.
    pub fn get_campaign_ipfs_hash(env: Env, campaign_id: u64) -> soroban_sdk::String {
        let key = DataKey::CampaignIpfsHash(campaign_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| soroban_sdk::String::from_str(&env, ""))
    }

    // -----------------------------------------------------------------------
    // Tree Verification SLA (issue #742)
    // -----------------------------------------------------------------------

    /// Record a tree planting batch with a strict 30-day verification SLA.
    pub fn record_tree_planting(
        env: Env,
        campaign_id: u64,
        planter: Address,
        tree_count: u32,
    ) -> u64 {
        planter.require_auth();
        let mut campaign = Self::load_campaign(&env, campaign_id);

        // The first recorded planting permanently marks the campaign as
        // started and anchors the refund tiers to real on-chain activity
        // (issue #889). Later plantings are attributed to the same planter.
        if campaign.planter == OptionalAddress::None {
            campaign.planter = OptionalAddress::Some(planter.clone());
            Self::save_campaign(&env, campaign_id, &campaign);

            env.events().publish(
                ("PlanterAssigned", campaign_id),
                PlanterAssignedEvent {
                    campaign_id,
                    planter: planter.clone(),
                    assigned_at: env.ledger().timestamp(),
                },
            );
        }

        let count_key = DataKey::PlantingCount(campaign_id);
        let mut planting_count: u64 = env
            .storage()
            .instance()
            .get(&count_key)
            .unwrap_or(0);
        planting_count += 1;

        let planted_at = env.ledger().timestamp();
        let verification_deadline = planted_at + VERIFICATION_SLA_SECONDS;

        let record = PlantingSlaRecord {
            planting_id: planting_count,
            campaign_id,
            planter: planter.clone(),
            tree_count,
            planted_at,
            verification_deadline,
            is_verified: false,
            verified_at: 0,
            is_refunded: false,
        };

        let key = DataKey::PlantingSla(campaign_id, planting_count);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.storage().instance().set(&count_key, &planting_count);

        env.events().publish(
            ("TreePlantingRecorded", campaign_id),
            TreePlantingRecordedEvent {
                campaign_id,
                planting_id: planting_count,
                planter,
                tree_count,
                verification_deadline,
            },
        );

        planting_count
    }

    /// Mark a tree planting batch as verified on-chain.
    pub fn verify_tree_planting(env: Env, campaign_id: u64, planting_id: u64, photo_species: soroban_sdk::String) {
        Self::assert_initialized(&env);
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let campaign = Self::load_campaign(&env, campaign_id);
        if campaign.tree_species != photo_species {
            panic_with_error!(&env, Error::SpeciesMismatch);
        }

        let key = DataKey::PlantingSla(campaign_id, planting_id);
        let mut record: PlantingSlaRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));

        if record.is_verified {
            panic_with_error!(&env, Error::AlreadyVerified);
        }

        record.is_verified = true;
        record.verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &record);
        Self::update_tree_rewards(&env, campaign_id, record.tree_count);

        env.events().publish(
            ("TreePlantingVerified", campaign_id),
            TreePlantingVerifiedEvent {
                campaign_id,
                planting_id,
                verified_at: record.verified_at,
            },
        );
    }

    // -----------------------------------------------------------------------
    // Tree Species Declaration & Verification (Issue #906)
    // -----------------------------------------------------------------------

    /// Specify and declare tree species for a campaign.
    ///
    /// Requires the campaign creator's authorization. Prevents fraud by binding
    /// the campaign to specific tree species that must be proven during verification.
    pub fn declare_tree_species(env: Env, campaign_id: u64, species: Vec<String>) {
        Self::assert_initialized(&env);
        let campaign = Self::load_campaign(&env, campaign_id);
        campaign.creator.require_auth();

        if species.len() == 0 {
            panic_with_error!(&env, Error::EmptySpeciesList);
        }

        // Validate each species name
        for s in species.iter() {
            let len = s.len();
            if len == 0 || len > 64 {
                panic_with_error!(&env, Error::InvalidSpeciesName);
            }
        }

        let key = DataKey::CampaignSpecies(campaign_id);
        env.storage().persistent().set(&key, &species);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("SpeciesDeclared", campaign_id),
            SpeciesDeclaredEvent {
                campaign_id,
                species,
            },
        );
    }

    /// Retrieve the declared tree species for a campaign.
    pub fn get_declared_species(env: Env, campaign_id: u64) -> Vec<String> {
        let key = DataKey::CampaignSpecies(campaign_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Create a campaign with required tree species declaration in a single call.
    pub fn create_campaign_with_species(
        env: Env,
        creator: Address,
        token: Address,
        target_amount: i128,
        min_target: i128,
        deadline: u64,
        insurance_fee: i128,
        species: Vec<String>,
    ) -> u64 {
        let campaign_id = Self::create_campaign(
            env.clone(),
            creator,
            token,
            target_amount,
            min_target,
            deadline,
            insurance_fee,
        );
        Self::declare_tree_species(env, campaign_id, species);
        campaign_id
    }

    /// Verify a tree planting batch requiring uploaded photo proof to match declared species.
    ///
    /// Fraud prevention: Verifies that uploaded proof photos strictly match the tree
    /// species specified by the campaign creator. Rejects any proof whose species does
    /// not match the declared list.
    pub fn verify_tree_planting_with_species_proof(
        env: Env,
        campaign_id: u64,
        planting_id: u64,
        proofs: Vec<SpeciesPhotoProof>,
    ) {
        Self::assert_initialized(&env);
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if proofs.len() == 0 {
            panic_with_error!(&env, Error::SpeciesProofRequired);
        }

        let declared_species = Self::get_declared_species(env.clone(), campaign_id);
        if declared_species.len() == 0 {
            panic_with_error!(&env, Error::SpeciesNotDeclared);
        }

        // Validate that every photo proof matches one of the declared species
        for proof in proofs.iter() {
            let mut matched = false;
            for declared in declared_species.iter() {
                if Self::species_matches(&declared, &proof.species) {
                    matched = true;
                    break;
                }
            }
            if !matched {
                // Fraud detected: photo species does not match declared campaign species!
                panic_with_error!(&env, Error::SpeciesMismatch);
            }
        }

        // Proceed to verify the planting SLA record
        let sla_key = DataKey::PlantingSla(campaign_id, planting_id);
        let mut record: PlantingSlaRecord = env
            .storage()
            .persistent()
            .get(&sla_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));

        if record.is_verified {
            panic_with_error!(&env, Error::AlreadyVerified);
        }

        record.is_verified = true;
        record.verified_at = env.ledger().timestamp();
        env.storage().persistent().set(&sla_key, &record);

        // Store verified photo proofs for audit trail
        let proof_key = DataKey::PlantingSpeciesProof(campaign_id, planting_id);
        env.storage().persistent().set(&proof_key, &proofs);
        env.storage().persistent().extend_ttl(&proof_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        Self::update_tree_rewards(&env, campaign_id, record.tree_count);

        for proof in proofs.iter() {
            env.events().publish(
                ("SpeciesProofVerified", campaign_id),
                SpeciesProofVerifiedEvent {
                    campaign_id,
                    planting_id,
                    photo_hash: proof.photo_hash,
                    species: proof.species,
                    tree_count: proof.tree_count,
                },
            );
        }

        env.events().publish(
            ("TreePlantingVerified", campaign_id),
            TreePlantingVerifiedEvent {
                campaign_id,
                planting_id,
                verified_at: record.verified_at,
            },
        );
    }

    /// Retrieve verified species photo proofs for a planting batch.
    pub fn get_planting_species_proofs(
        env: Env,
        campaign_id: u64,
        planting_id: u64,
    ) -> Vec<SpeciesPhotoProof> {
        let key = DataKey::PlantingSpeciesProof(campaign_id, planting_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Case-insensitive ASCII comparison between two Soroban strings.
    fn species_matches(s1: &String, s2: &String) -> bool {
        let len1 = s1.len();
        let len2 = s2.len();
        if len1 != len2 {
            return false;
        }
        let b1 = s1.to_bytes();
        let b2 = s2.to_bytes();
        let mut i = 0u32;
        while i < len1 {
            let mut byte1 = b1.get_unchecked(i);
            let mut byte2 = b2.get_unchecked(i);
            if byte1 >= b'A' && byte1 <= b'Z' {
                byte1 += b'a' - b'A';
            }
            if byte2 >= b'A' && byte2 <= b'Z' {
                byte2 += b'a' - b'A';
            }
            if byte1 != byte2 {
                return false;
            }
            i += 1;
        }
        true
    }

    /// Claim SLA auto-refund if 30-day verification deadline passes without proof verification.
    pub fn claim_sla_refund(
        env: Env,
        campaign_id: u64,
        planting_id: u64,
        contributor: Address,
    ) {
        contributor.require_auth();

        let key = DataKey::PlantingSla(campaign_id, planting_id);
        let record: PlantingSlaRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));

        if record.is_verified {
            panic_with_error!(&env, Error::AlreadyVerified);
        }
        if env.ledger().timestamp() <= record.verification_deadline {
            panic_with_error!(&env, Error::SlaNotBreached);
        }

        let contrib_key = DataKey::Contribution(campaign_id, contributor.clone());
        let amount: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        if amount <= 0 {
            panic_with_error!(&env, Error::NoContributionFound);
        }

        env.storage().persistent().remove(&contrib_key);

        let campaign = Self::load_campaign(&env, campaign_id);
        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(&env.current_contract_address(), &contributor, &amount);

        env.events().publish(
            ("SlaRefundIssued", campaign_id),
            SlaRefundIssuedEvent {
                campaign_id,
                planting_id,
                contributor,
                amount,
            },
        );
    }

    /// Retrieve tree planting SLA record.
    pub fn get_planting_sla(env: Env, campaign_id: u64, planting_id: u64) -> PlantingSlaRecord {
        let key = DataKey::PlantingSla(campaign_id, planting_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound))
    }

    /// Return the number of trees in verified planting batches for a campaign.
    pub fn get_verified_tree_count(env: Env, campaign_id: u64) -> u64 {
        let _ = Self::load_campaign(&env, campaign_id);
        env.storage().persistent().get(&DataKey::VerifiedTreeCount(campaign_id)).unwrap_or(0)
    }

    /// Return the service reward tiers unlocked by verified trees.
    pub fn get_rewards_unlocked(env: Env, campaign_id: u64) -> Vec<RewardTier> {
        let _ = Self::load_campaign(&env, campaign_id);
        let mask: u32 = env.storage().persistent().get(&DataKey::RewardsUnlocked(campaign_id)).unwrap_or(0);
        let mut tiers = Vec::new(&env);
        if mask & 1 != 0 { tiers.push_back(RewardTier::CustomBranding); }
        if mask & 2 != 0 { tiers.push_back(RewardTier::WhiteLabel); }
        if mask & 4 != 0 { tiers.push_back(RewardTier::ApiAccess); }
        tiers
    }


    // -----------------------------------------------------------------------
    // Campaign Milestone Rewards (Issue #869)
    // -----------------------------------------------------------------------

    /// Check if a specific feature reward tier is unlocked for a campaign.
    /// - `RewardTier::CustomBranding`: Unlocked at 1,000 verified trees
    /// - `RewardTier::WhiteLabel`: Unlocked at 5,000 verified trees
    /// - `RewardTier::ApiAccess`: Unlocked at 10,000 verified trees
    pub fn is_feature_unlocked(env: Env, campaign_id: u64, tier: RewardTier) -> bool {
        let _ = Self::load_campaign(&env, campaign_id);
        let mask: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::RewardsUnlocked(campaign_id))
            .unwrap_or(0);
        match tier {
            RewardTier::CustomBranding => mask & 1 != 0,
            RewardTier::WhiteLabel => mask & 2 != 0,
            RewardTier::ApiAccess => mask & 4 != 0,
        }
    }

    /// Retrieve the current verified tree count, the next milestone threshold,
    /// and the completion progress in basis points (10,000 bps = 100%).
    /// Returns: `(current_trees, next_threshold, progress_bps)`.
    pub fn get_next_milestone_progress(env: Env, campaign_id: u64) -> (u64, u64, u32) {
        let current_trees = Self::get_verified_tree_count(env.clone(), campaign_id);
        let next_threshold = if current_trees < 1_000 {
            1_000
        } else if current_trees < 5_000 {
            5_000
        } else if current_trees < 10_000 {
            10_000
        } else {
            10_000
        };

        let progress_bps = if current_trees >= next_threshold {
            10_000
        } else {
            ((current_trees as u128 * 10_000) / (next_threshold as u128)) as u32
        };

        (current_trees, next_threshold, progress_bps)
    // Dynamic Pricing (Issue #884)
    // -----------------------------------------------------------------------

    /// Calculate dynamic cost per tree based on campaign sponsorship demand.
    /// Popular campaigns reaching or exceeding 90% funding become more expensive
    /// (1.5x / 15,000 bps) to balance load across less-funded campaigns.
    pub fn get_campaign_cost_per_tree(env: Env, campaign_id: u64, base_cost: i128) -> i128 {
        if base_cost <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let campaign = Self::load_campaign(&env, campaign_id);
        let multiplier_bps = Self::get_campaign_demand_multiplier_bps(env.clone(), campaign_id);
        let dynamic_cost = base_cost
            .checked_mul(multiplier_bps as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
            / 10_000;

        let funding_percentage = if campaign.target_amount > 0 {
            ((campaign.total_raised * 100) / campaign.target_amount) as u32
        } else {
            0
        };

        DynamicPricingEvaluatedEvent {
            campaign_id,
            base_cost,
            dynamic_cost,
            demand_multiplier_bps: multiplier_bps,
            funding_percentage,
        }
        .publish(&env);

        dynamic_cost
    }

    /// Retrieve the demand multiplier in basis points for a campaign.
    /// - >= 90% funded: 15,000 bps (1.5x surge pricing to balance load)
    /// - < 90% funded: 10,000 bps (1.0x baseline cost)
    pub fn get_campaign_demand_multiplier_bps(env: Env, campaign_id: u64) -> u32 {
        let campaign = Self::load_campaign(&env, campaign_id);
        if campaign.target_amount <= 0 {
            return 10_000;
        }

        let is_popular = campaign
            .total_raised
            .checked_mul(100)
            .map(|r| r >= campaign.target_amount.saturating_mul(90))
            .unwrap_or(false);

        if is_popular {
            15_000 // 1.5x multiplier for popular campaigns (>= 90% funded)
        } else {
            10_000 // 1.0x standard baseline
        }
    }

    /// Calculate how many trees a given contribution amount can sponsor
    /// under current dynamic supply/demand pricing.
    pub fn calculate_trees_for_contribution(
        env: Env,
        campaign_id: u64,
        contribution_amount: i128,
        base_cost: i128,
    ) -> u32 {
        if contribution_amount <= 0 || base_cost <= 0 {
            return 0;
        }
        let dynamic_cost = Self::get_campaign_cost_per_tree(env, campaign_id, base_cost);
        if dynamic_cost <= 0 {
            return 0;
        }
        (contribution_amount / dynamic_cost) as u32
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn validate_creators(env: &Env, creators: &Vec<Address>, shares: &Vec<u32>) {
        if creators.len() == 0 || creators.len() != shares.len() {
            panic_with_error!(env, Error::InvalidCreators);
        }
        let mut total = 0u32;
        for i in 0..creators.len() {
            let share = shares.get(i).unwrap();
            if share == 0
                || creators
                    .iter()
                    .skip((i + 1) as usize)
                    .any(|item| item == creators.get(i).unwrap())
            {
                panic_with_error!(env, Error::InvalidCreators);
            }
            total = total.checked_add(share).unwrap_or(0);
        }
        if total != 10_000 {
            panic_with_error!(env, Error::InvalidCreators);
        }
    }

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

    fn update_tree_rewards(env: &Env, campaign_id: u64, batch_count: u32) {
        let count_key = DataKey::VerifiedTreeCount(campaign_id);
        let previous: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let count = previous.checked_add(batch_count as u64)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&count_key, &count);
        env.storage().persistent().extend_ttl(&count_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        let reward_key = DataKey::RewardsUnlocked(campaign_id);
        let mut mask: u32 = env.storage().persistent().get(&reward_key).unwrap_or(0);
        let rewards = [
            (1u32, 1_000u64, RewardTier::CustomBranding),
            (2u32, 5_000u64, RewardTier::WhiteLabel),
            (4u32, 10_000u64, RewardTier::ApiAccess),
        ];
        for (bit, threshold, tier) in rewards.iter() {
            if mask & bit == 0 && count >= *threshold {
                mask |= *bit;
                env.events().publish(
                    ("RewardUnlocked", campaign_id),
                    RewardUnlockedEvent { campaign_id, tier: *tier, threshold: *threshold, verified_tree_count: count },
                );
            }
        }
        env.storage().persistent().set(&reward_key, &mask);
        env.storage().persistent().extend_ttl(&reward_key, LEDGER_THRESHOLD, LEDGER_BUMP);
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

    /// Record a status change in the campaign's status history.
    fn record_status_change(env: &Env, campaign_id: u64, status: CampaignStatus) {
        let count_key = DataKey::StatusHistoryCount(campaign_id);
        let mut count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);

        let entry = StatusHistoryEntry {
            status,
            timestamp: env.ledger().timestamp(),
        };

        let entry_key = DataKey::StatusHistory(campaign_id, count);
        env.storage().persistent().set(&entry_key, &entry);
        env.storage()
            .persistent()
            .extend_ttl(&entry_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        count += 1;
        env.storage().persistent().set(&count_key, &count);
        env.storage()
            .persistent()
            .extend_ttl(&count_key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Compute the protocol fee for `amount` using the stored fee rate.
    ///
    /// The fee is rounded **up** (ceiling division) so that the full
    /// fractional entitlement goes to the fee collector rather than being
    /// silently discarded.  Without ceiling rounding the remainder term
    /// `(r * rate) / 10_000` (where `r = amount % 10_000`) would floor,
    /// causing the fee collector to lose up to 1 base-unit per claim while
    /// the creator keeps the dust instead.
    ///
    /// Formula: `ceil(amount * rate / 10_000)`
    /// Implemented without overflow via the split identity:
    ///   `amount = q * 10_000 + r`
    ///   `ceil(r * rate / 10_000) = (r * rate + 9_999) / 10_000`
    fn calculate_fee(env: &Env, amount: i128) -> i128 {
        let fee_rate: u32 = env.storage().instance().get(&DataKey::FeeRate).unwrap_or(0);
        if fee_rate == 0 || amount <= 0 {
            return 0;
        }
        let rate = fee_rate as i128;
        let q = amount / 10_000;
        let r = amount % 10_000;
        // Ceiling division for the remainder term: ceil(r * rate / 10_000)
        let remainder_fee = r
            .checked_mul(rate)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            .checked_add(9_999)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            / 10_000;
        q.checked_mul(rate)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            .checked_add(remainder_fee)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
    }

    /// Compute the 10% reserve for tree replacement.
    ///
    /// Uses ceiling division (same technique as `calculate_fee`) so that the
    /// remainder term is rounded **up** instead of floored.  Without ceiling
    /// rounding the remainder term `(r * 1000) / 10_000` (where
    /// `r = amount % 10_000`) can floor to zero even when non-zero, leaving
    /// up to 1 base unit in the distributable amount instead of the reserve.
    ///
    /// Formula: `ceil(amount * 1000 / 10_000)`
    /// Implemented as:
    ///   `amount = q * 10_000 + r`
    ///   `ceil(r * 1000 / 10_000) = (r * 1000 + 9_999) / 10_000`
    fn calculate_reserve(env: &Env, amount: i128) -> i128 {
        if amount <= 0 {
            return 0;
        }
        // 1000 basis points = 10%
        let rate: i128 = 1000;
        let q = amount / 10_000;
        let r = amount % 10_000;
        // Ceiling division for the remainder term: ceil(r * rate / 10_000)
        let remainder_reserve = r
            .checked_mul(rate)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            .checked_add(9_999)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            / 10_000;
        q.checked_mul(rate)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            .checked_add(remainder_reserve)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
    }

    /// Distribute proceeds to the campaign creator or team members.
    ///
    /// If a team configuration exists via [`set_team_rewards`], the proceeds
    /// are split proportionally among team members. Otherwise, the full
    /// amount goes to the sole creator.
    ///
    /// Each member's share is computed with ceiling division on the remainder
    /// term so no dust is silently discarded.  To guarantee that the sum of
    /// all shares equals `amount` exactly, the last team member receives
    /// whatever is left after the preceding members have been paid.
    fn distribute_proceeds(env: &Env, campaign: &Campaign, campaign_id: u64, amount: i128) {
        let token_client = token::Client::new(env, &campaign.token);
        let team_key = DataKey::TeamMembers(campaign_id);

        // Check if team rewards are configured
        let team: Option<Vec<TeamMember>> = env.storage().persistent().get(&team_key);

        match team {
            Some(members) if !members.is_empty() => {
                let n = members.len();
                let mut distributed: i128 = 0;

                // Distribute to team members proportionally
                for i in 0..n {
                    let member = members.get(i).unwrap();

                    // The last member receives the exact remainder so the
                    // total always sums to `amount` with no dust locked in
                    // the contract.
                    let member_share = if i + 1 == n {
                        amount - distributed
                    } else {
                        // Ceiling division on the remainder term: no base unit
                        // is silently discarded when the split is not exact.
                        let bps = member.percentage_bps as i128;
                        let q = amount / 10_000;
                        let r = amount % 10_000;
                        let remainder_share = r
                            .checked_mul(bps)
                            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
                            .checked_add(9_999)
                            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
                            / 10_000;
                        q.checked_mul(bps)
                            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
                            .checked_add(remainder_share)
                            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
                    };

                    if member_share > 0 {
                        distributed = distributed
                            .checked_add(member_share)
                            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow));
                        token_client.transfer(
                            &env.current_contract_address(),
                            &member.address,
                            &member_share,
                        );

                        TeamPayoutIssuedEvent {
                            campaign_id,
                            member: member.address.clone(),
                            amount: member_share,
                        }
                        .publish(env);
                    }
                }
            }
            _ => {
                // No team configured: send entire amount to creator
                if amount > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &campaign.creator,
                        &amount,
                    );
                }
            }
        }
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

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        assert_eq!(id, 1);
        assert_eq!(client.get_campaign_count(), 1);

        let campaign = client.get_campaign(&1);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.target_amount, 10_000);
        assert_eq!(campaign.min_target, 5_000);
        assert_eq!(campaign.deadline, 2_000);
        assert_eq!(campaign.total_raised, 0);
        assert_eq!(campaign.status, CampaignStatus::Active);
        // New fields: created_at should be set to ledger time; planter should be None.
        assert_eq!(campaign.created_at, 1_000);
        assert_eq!(campaign.planter, OptionalAddress::None);
    }

    #[test]
    fn test_create_campaign_allows_optional_zero_insurance_fee() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &0);
        assert_eq!(id, 1);
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Active);
        assert_eq!(client.get_campaign_count(), 1);
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

        let id1 = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        let id2 = client.create_campaign(&creator, &token, &20_000, &10_000, &3_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(client.get_campaign_count(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_create_campaign_rejected_when_counter_full() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);

        // Exhaust the campaign ID space: the next create must be rejected with
        // Error::ContractFull instead of panicking on arithmetic overflow.
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::CampaignCount, &u64::MAX);
        });

        client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        client.create_campaign(&creator, &token, &0, &0, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        client.create_campaign(&creator, &token, &5_000, &6_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        client.create_campaign(&creator, &token, &10_000, &0, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_create_campaign_deadline_exceeds_180_days_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        let deadline = 1_000 + MAX_CAMPAIGN_DURATION_SECONDS + 1;
        client.create_campaign(&creator, &token, &10_000, &5_000, &deadline, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &3_000);

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.total_raised, 3_000);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(client.get_contribution(&id, &contributor), 3_000);
        // Tokens are now held by the contract.
        assert_eq!(token_client.balance(&contributor), 7_000);
    }

    #[test]
    fn test_contribute_anonymously_hides_address_from_contribution_event() {
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
        client.contribute_anonymously(&contributor, &id, &3_000);
        let events = env.events().all();

        assert_eq!(client.get_contribution(&id, &contributor), 3_000);
        assert_eq!(client.get_campaign(&id).total_raised, 3_000);

        let anonymous_event = AnonymousContributionMadeEvent {
            campaign_id: id,
            amount: 3_000,
            total_raised: 3_000,
        }
        .to_xdr(&env, &contract_id);
        let public_event = ContributionMadeEvent {
            campaign_id: id,
            contributor,
            amount: 3_000,
            total_raised: 3_000,
        }
        .to_xdr(&env, &contract_id);
        assert!(events.events().iter().any(|event| *event == anonymous_event));
        assert!(!events.events().iter().any(|event| *event == public_event));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));

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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &8_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);

        client.verify_campaign(&id);
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.verify_campaign(&id);
        client.claim_funds(&id);

        assert_eq!(token_client.balance(&creator), 6_000);
        assert_eq!(token_client.balance(&fee_collector), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn test_claim_funds_on_active_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.claim_funds(&id); // Still Active — must panic.
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn test_claim_funds_on_failed_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let (token, _, token_admin_client) = create_token(&env, &token_admin);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.verify_campaign(&id);
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contrib1, &id, &3_000);
        client.contribute(&contrib2, &id, &1_500);
        client.contribute(&contrib3, &id, &500); // total = 5_000 == min_target

        // Bring total below min_target by using a campaign where min > raised.
        // (For simplicity create a new campaign with higher min_target.)
        let id2 = client.create_campaign(&creator, &token_addr, &10_000, &6_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &2_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.refund(&contributor, &id); // First refund — OK.
        client.refund(&contributor, &id); // Second refund — must panic.
    }

    // -----------------------------------------------------------------------
    // Tiered refund policy (issue #889)
    //
    // 100 % — campaign never started (no planter) within 60 days of creation
    //  50 % — started but no trees planted within 90 days of creation
    //   0 % — completed campaign, or trees planted within the 90-day window
    // -----------------------------------------------------------------------

    const DAY: u64 = 24 * 60 * 60;

    #[test]
    fn test_refund_tier1_full_refund_after_60_days_no_planter() {
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

        // Far-future deadline so the campaign stays Active past the 60-day
        // tier boundary.
        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        // Before 60 days: no refund available yet.
        set_time(&env, 1_000 + 60 * DAY);
        assert_eq!(client.get_refund_percent(&id), 0);

        // After 60 days with no planter assigned: full refund.
        set_time(&env, 1_000 + 60 * DAY + 1);
        assert_eq!(client.get_refund_percent(&id), 100);
        client.refund(&contributor, &id);
        assert_eq!(token_client.balance(&contributor), 10_000);
        assert_eq!(client.get_contribution(&id, &contributor), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_no_refund_within_60_days_active() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        // Still within the 60-day window — refund must panic.
        set_time(&env, 1_000 + 60 * DAY);
        client.refund(&contributor, &id);
    }

    #[test]
    fn test_refund_tier2_partial_refund_after_90_days() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        // Campaign starts within 60 days (planter assigned), so tier 1 no
        // longer applies at any later time.
        let planter = Address::generate(&env);
        set_time(&env, 1_000 + 30 * DAY);
        client.assign_planter(&id, &planter);

        // Between 60 and 90 days: started but nothing planted — no refund yet.
        set_time(&env, 1_000 + 75 * DAY);
        assert_eq!(client.get_refund_percent(&id), 0);

        // After 90 days with no planting: 50 % partial refund.
        set_time(&env, 1_000 + 90 * DAY + 1);
        assert_eq!(client.get_refund_percent(&id), 50);
        client.refund(&contributor, &id);
        assert_eq!(token_client.balance(&contributor), 10_000 - 1_500);
        assert_eq!(client.get_contribution(&id, &contributor), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_tier2_not_before_90_days() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        let planter = Address::generate(&env);
        set_time(&env, 1_000 + 30 * DAY);
        client.assign_planter(&id, &planter);

        // Started, past 60 days, but within the 90-day planting window —
        // refund must panic.
        set_time(&env, 1_000 + 89 * DAY);
        client.refund(&contributor, &id);
    }

    #[test]
    fn test_refund_assign_planter_blocks_tier1() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        // Assign the planter within the 60-day window.
        let planter = Address::generate(&env);
        set_time(&env, 1_000 + 59 * DAY);
        client.assign_planter(&id, &planter);
        assert_eq!(
            client.get_campaign(&id).planter,
            OptionalAddress::Some(planter.clone())
        );

        // Past 60 days tier 1 no longer fires (planter assigned in time);
        // past 90 days tier 2 fires instead (no trees planted).
        set_time(&env, 1_000 + 61 * DAY);
        assert_eq!(client.get_refund_percent(&id), 0);
        set_time(&env, 1_000 + 91 * DAY);
        assert_eq!(client.get_refund_percent(&id), 50);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #28)")]
    fn test_assign_planter_duplicate_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        token_admin_client.mint(&creator, &500);

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );

        let planter = Address::generate(&env);
        client.assign_planter(&id, &planter);

        // A second assignment must fail — the first assignment wins so the
        // refund outcome cannot be changed retroactively.
        let other = Address::generate(&env);
        client.assign_planter(&id, &other);
    }

    #[test]
    fn test_refund_zero_after_planting_recorded() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        let planter = Address::generate(&env);
        set_time(&env, 1_000 + 30 * DAY);
        client.assign_planter(&id, &planter);

        // Trees planted within the 90-day window.
        set_time(&env, 1_000 + 80 * DAY);
        client.record_tree_planting(&id, &planter, &100);

        // Past 90 days: no refund — trees were planted in time.
        set_time(&env, 1_000 + 95 * DAY);
        assert_eq!(client.get_refund_percent(&id), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_zero_after_claimed() {
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
        client.verify_campaign(&id); // → Verified
        client.claim_funds(&id); // → Claimed

        // Completed campaign — 0 % refund, must panic.
        set_time(&env, 1_000 + 120 * DAY);
        client.refund(&contributor, &id);
    }

    #[test]
    fn test_get_refund_percent_tier_transitions() {
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

        let id = client.create_campaign(
            &creator,
            &token_addr,
            &10_000,
            &5_000,
            &(1_000 + 180 * DAY),
            &500,
        );
        client.contribute(&contributor, &id, &3_000);

        // Tier timeline without planter assignment:
        // day 59 → 0 %, day 61 → 100 % (tier 1).
        set_time(&env, 1_000 + 59 * DAY);
        assert_eq!(client.get_refund_percent(&id), 0);
        set_time(&env, 1_000 + 61 * DAY);
        assert_eq!(client.get_refund_percent(&id), 100);

        // A late planter assignment cannot retroactively shrink tier 1, but
        // it does enable tier 2 from the 90-day boundary onward.
        let planter = Address::generate(&env);
        client.assign_planter(&id, &planter);
        assert_eq!(client.get_refund_percent(&id), 100); // tier 1 already breached

        set_time(&env, 1_000 + 90 * DAY + 1);
        assert_eq!(client.get_refund_percent(&id), 50); // tier 2 now applies
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &9_999);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.verify_campaign(&id);
        client.claim_funds(&id);

        // fee = ceil(9_999 * 100 / 10_000) = ceil(99.99) = 100; net = 9_899.
        assert_eq!(token_client.balance(&creator), 9_899);
        assert_eq!(token_client.balance(&fee_collector), 100);
    }

    // -----------------------------------------------------------------------
    // Status history
    // -----------------------------------------------------------------------

    #[test]
    fn test_status_history_records_initial_active() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));

        let history = client.get_status_history(&id);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().status, CampaignStatus::Active);
        assert_eq!(history.get(0).unwrap().timestamp, 1_000);
    }

    #[test]
    fn test_status_history_records_successful_transition() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000);
        let history = client.get_status_history(&id);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().status, CampaignStatus::Active);
    }

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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));
        set_time(&env, 1_500);
        client.contribute(&contributor, &id, &10_000); // Auto-succeed

        let history = client.get_status_history(&id);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().status, CampaignStatus::Active);
        assert_eq!(history.get(0).unwrap().timestamp, 1_000);
        assert_eq!(history.get(1).unwrap().status, CampaignStatus::Successful);
        assert_eq!(history.get(1).unwrap().timestamp, 1_500);
    }

    #[test]
    fn test_status_history_records_failed_transition() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&contributor, &3_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &3_000); // Below min_target
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // → Failed

        let history = client.get_status_history(&id);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().status, CampaignStatus::Active);
        assert_eq!(history.get(0).unwrap().timestamp, 1_000);
        assert_eq!(history.get(1).unwrap().status, CampaignStatus::Failed);
        assert_eq!(history.get(1).unwrap().timestamp, 3_000);
    }

    #[test]
    fn test_status_history_records_claimed_transition() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&contributor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &10_000); // Auto-succeed
        set_time(&env, 3_000);
        client.verify_campaign(&id);
        client.claim_funds(&id);

        let history = client.get_status_history(&id);
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap().status, CampaignStatus::Active);
        assert_eq!(history.get(1).unwrap().status, CampaignStatus::Successful);
        assert_eq!(history.get(2).unwrap().status, CampaignStatus::Claimed);
    }

    #[test]
    fn test_status_history_empty_for_nonexistent_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);

        let history = client.get_status_history(&99);
        assert_eq!(history.len(), 0);
        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &8_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.verify_campaign(&id);
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &6_000);
        set_time(&env, 3_000);
        client.trigger_expiry(&id);
        client.verify_campaign(&id);
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
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

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &500, &soroban_sdk::String::from_str(&env, "Oak"));
        client.contribute(&contributor, &id, &3_000); // crosses 25 %
        set_time(&env, 3_000);
        client.trigger_expiry(&id); // 3_000 < 5_000 min -> Failed

        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Failed);
        let ms = client.get_milestones_reached(&id);
        assert_eq!(ms.len(), 1);
        assert_eq!(ms.get(0).unwrap(), 25);
    }

    // -----------------------------------------------------------------------
    // pause / resume
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_and_resume_campaign_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Active);

        // Pause campaign
        client.pause_campaign(&id);
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Paused);

        // Resume campaign
        client.resume_campaign(&id);
        assert_eq!(client.get_campaign(&id).status, CampaignStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_contribute_while_paused_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);

        let (_, client, _, _) = setup_contract(&env);
        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&contributor, &5_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000, &soroban_sdk::String::from_str(&env, "Oak"));
        client.pause_campaign(&id);

        // Must panic with CampaignPaused (#18)
        client.contribute(&contributor, &id, &1_000);
        // May 15, 2026 (rainy season -> 2x multiplier)
        set_time(&env, 1_778_800_000);
        let id_rainy = client.create_campaign(&creator, &token, &10_000, &5_000, &1_778_900_000);
        assert_eq!(client.get_co2_multiplier(&id_rainy), 20);

        // January 15, 2026 (non-rainy season -> 1x multiplier)
        set_time(&env, 1_768_400_000);
        let id_dry = client.create_campaign(&creator, &token, &10_000, &5_000, &1_768_500_000);
        assert_eq!(client.get_co2_multiplier(&id_dry), 10);
    }

    #[test]
    fn test_set_and_get_reward_token() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        let reward_token = Address::generate(&env);

        assert_eq!(client.get_reward_token(), None);
        client.set_reward_token(&reward_token);
        assert_eq!(client.get_reward_token(), Some(reward_token));
    }

    // -----------------------------------------------------------------------
    // Campaign Milestone Rewards Tests (Issue #869)
    // -----------------------------------------------------------------------

    #[test]
    fn test_milestone_rewards_feature_unlock_progression() {
    // Dynamic Pricing Tests (Issue #884)
    // -----------------------------------------------------------------------

    #[test]
    fn test_dynamic_pricing_below_90_percent_uses_base_cost() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&contributor, &10_000);

        // Target: 10,000 stroops
        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000);
        
        // 50% funded (5,000 / 10,000)
        client.contribute(&contributor, &id, &5_000);

        let base_cost = 100i128;
        let cost = client.get_campaign_cost_per_tree(&id, &base_cost);
        let multiplier = client.get_campaign_demand_multiplier_bps(&id);

        assert_eq!(cost, 100);
        assert_eq!(multiplier, 10_000); // 1.0x baseline

        let trees = client.calculate_trees_for_contribution(&id, &500, &base_cost);
        assert_eq!(trees, 5); // 500 / 100 = 5 trees
    }

    #[test]
    fn test_dynamic_pricing_at_or_above_90_percent_applies_surge_multiplier() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        token_admin_client.mint(&contributor, &10_000);

        // Target: 10,000 stroops
        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000);

        // 90% funded (9,000 / 10,000) -> Popular campaign!
        client.contribute(&contributor, &id, &9_000);

        let base_cost = 100i128;
        let cost = client.get_campaign_cost_per_tree(&id, &base_cost);
        let multiplier = client.get_campaign_demand_multiplier_bps(&id);

        // 1.5x surge pricing to balance load
        assert_eq!(cost, 150);
        assert_eq!(multiplier, 15_000); // 1.5x multiplier

        // At 150 per tree, 600 tokens yields 4 trees instead of 6
        let trees = client.calculate_trees_for_contribution(&id, &600, &base_cost);
        assert_eq!(trees, 4); // 600 / 150 = 4 trees
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_dynamic_pricing_zero_base_cost_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        let planter = Address::generate(&env);

        let id = client.create_campaign(&creator, &token, &100_000, &50_000, &10_000);

        // Initially no features unlocked
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::CustomBranding), false);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::WhiteLabel), false);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::ApiAccess), false);

        let (trees0, next0, prog0) = client.get_next_milestone_progress(&id);
        assert_eq!(trees0, 0);
        assert_eq!(next0, 1_000);
        assert_eq!(prog0, 0);

        // Milestone 1: Record and verify 1,000 trees -> Unlocks Custom Branding
        client.record_tree_planting(&id, &planter, &1_000);
        client.verify_tree_planting(&id, &0);

        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::CustomBranding), true);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::WhiteLabel), false);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::ApiAccess), false);

        let (trees1, next1, prog1) = client.get_next_milestone_progress(&id);
        assert_eq!(trees1, 1_000);
        assert_eq!(next1, 5_000);
        assert_eq!(prog1, 2_000); // 1,000 / 5,000 = 20% (2,000 bps)

        // Milestone 2: Record and verify 4,000 more trees (5,000 total) -> Unlocks White Label
        client.record_tree_planting(&id, &planter, &4_000);
        client.verify_tree_planting(&id, &1);

        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::CustomBranding), true);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::WhiteLabel), true);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::ApiAccess), false);

        let (trees2, next2, prog2) = client.get_next_milestone_progress(&id);
        assert_eq!(trees2, 5_000);
        assert_eq!(next2, 10_000);
        assert_eq!(prog2, 5_000); // 5,000 / 10,000 = 50% (5,000 bps)

        // Milestone 3: Record and verify 5,000 more trees (10,000 total) -> Unlocks API Access
        client.record_tree_planting(&id, &planter, &5_000);
        client.verify_tree_planting(&id, &2);

        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::CustomBranding), true);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::WhiteLabel), true);
        assert_eq!(client.is_feature_unlocked(&id, &RewardTier::ApiAccess), true);

        let (trees3, next3, prog3) = client.get_next_milestone_progress(&id);
        assert_eq!(trees3, 10_000);
        assert_eq!(next3, 10_000);
        assert_eq!(prog3, 10_000); // 100% achieved
    }

    // -----------------------------------------------------------------------
    // Carbon Credit Token Minting Tests (Issue #845)
    // -----------------------------------------------------------------------

    #[test]
    fn test_carbon_credit_getters_and_sponsor_allocation() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let creator = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let token = Address::generate(&env);
        let carbon_token = Address::generate(&env);

        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000);

        // Initially no carbon token configured
        assert_eq!(client.get_carbon_token(&id), None);
        assert_eq!(client.is_carbon_credit_minted(&id), false);

        // Configure carbon token
        client.set_carbon_token(&id, &carbon_token);
        assert_eq!(client.get_carbon_token(&id), Some(carbon_token));

        // Sponsor contributes 5,000 out of 10,000 (50%)
        client.contribute(&sponsor, &id, &5_000);

        // Plant and verify 1,000 trees
        let planter = Address::generate(&env);
        client.record_tree_planting(&id, &planter, &1_000);
        client.verify_tree_planting(&id, &0);

        // Allocation: 50% of 1,000 trees * 1x multiplier = 500 carbon credit tokens
        let allocation = client.get_sponsor_carbon_credit_allocation(&id, &sponsor);
        assert_eq!(allocation, 500);
        let id = client.create_campaign(&creator, &token, &10_000, &5_000, &2_000);

        client.get_campaign_cost_per_tree(&id, &0);
    }
}









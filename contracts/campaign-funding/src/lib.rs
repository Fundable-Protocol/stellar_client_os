#![no_std]
pub mod checked_math;
pub use checked_math::CheckedMath;

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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpeciesPlantingRecordedEvent {
    pub campaign_id: u64,
    pub species_code: BytesN<32>,
    pub count: u64,
    pub new_diversity_score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiversityScoreUpdatedEvent {
    pub campaign_id: u64,
    pub diversity_score: u32,
    pub distinct_species: u32,
}


#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Held = 0,
    Verified = 1,
    Released = 2,
    Disputed = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowAccount {
    pub campaign_id: u64,
    pub verifier: Address,
    pub total_escrowed: i128,
    pub released_amount: i128,
    pub status: EscrowStatus,
    pub is_verified: bool,
    pub trees_planted: u64,
    pub target_trees: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowAccountCreatedEvent {
    pub campaign_id: u64,
    pub verifier: Address,
    pub target_trees: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowDepositEvent {
    pub campaign_id: u64,
    pub depositor: Address,
    pub amount: i128,
    pub total_escrowed: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowVerifiedEvent {
    pub campaign_id: u64,
    pub verifier: Address,
    pub trees_planted: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowFundsReleasedEvent {
    pub campaign_id: u64,
    pub creator: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowDisputedEvent {
    pub campaign_id: u64,
    pub reason: Symbol,
}

pub enum DataKey {
    CampaignEscrow(u64),
    CampaignSpeciesList(u64),
    CampaignSpeciesCount(u64, BytesN<32>),
    CampaignDiversityScore(u64),
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
    /// Declared tree species list required for campaign verification.
    DeclaredSpeciesList(u64),
    /// Species verification proof keyed by (campaign_id, planting_id).
    SpeciesProof(u64, u64),
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


#[contracttype]
#[derive(Clone)]
pub struct BonusParams {
    pub target_co2: i128,
    pub actual_co2: i128,
    pub trees_planted: u32,
    pub trees_survived: u32,
    pub treasury: Address,
    pub planter: Address,
    pub carbon_token: Address,
    pub bonus_token: Address,
    pub co2_bonus_amount: i128,
    pub planter_bonus_amount: i128,
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
#[contractevent]
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
#[contractevent]
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

/// Declared species configuration for a campaign (Issue #838).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeclaredSpecies {
    pub species_name: soroban_sdk::String,
    pub species_code: BytesN<32>,
    pub target_count: u64,
}

/// Photographic species proof record for a planting batch.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpeciesVerificationProof {
    pub planting_id: u64,
    pub species_code: BytesN<32>,
    pub photo_ipfs_cid: soroban_sdk::String,
    pub photo_hash: BytesN<32>,
    pub is_verified: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpeciesDeclaredEvent {
    pub campaign_id: u64,
    pub species_code: BytesN<32>,
    pub target_count: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpeciesProofSubmittedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub species_code: BytesN<32>,
    pub photo_ipfs_cid: soroban_sdk::String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpeciesProofVerifiedEvent {
    pub campaign_id: u64,
    pub planting_id: u64,
    pub species_code: BytesN<32>,
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InsurancePoolFundedEvent {
    pub campaign_id: u64,
    pub token: Address,
    pub amount: i128,
    pub pool_balance: i128,
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
#[contractevent]
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
#[contractevent]
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
#[contractevent]
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
    /// Uploaded photo proof does not match declared tree species.
    SpeciesMismatch = 38,
    /// Tree species proof has not been submitted for this planting batch.
    ProofNotFound = 39,
    /// Tree mortality occurred outside the 2-year insurance coverage window.
    InsuranceWindowExpired = 38,
    /// The non-profit partner has not been registered for this campaign.
    NonProfitPartnerNotFound = 28,
    /// Tax certificate has already been issued for this sponsor and campaign.
    CertificateAlreadyIssued = 29,
    /// Escrow account has not been initialized for this campaign.
    EscrowNotInitialized = 38,
    /// Escrow account has already been initialized for this campaign.
    EscrowAlreadyInitialized = 39,
    /// Escrow funds cannot be released before trees are verified planted.
    EscrowNotVerified = 40,
    /// Escrow funds have already been released.
    EscrowAlreadyReleased = 41,
    /// Caller is not the authorized verifier for this campaign escrow.
    UnauthorizedVerifier = 42,
    /// Escrow account is currently disputed.
    EscrowDisputed = 43,

    // -----------------------------------------------------------------------
    // Campaign Escrow Tests (Issue #864)
    // -----------------------------------------------------------------------

    #[test]
    fn test_escrow_hold_and_release_upon_verifier_approval() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);

        token_admin_client.mint(&sponsor, &10_000);

        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000);

        // 1. Initialize escrow holding account
        client.initialize_campaign_escrow(&id, &verifier, &500);
        let escrow = client.get_campaign_escrow(&id);
        assert_eq!(escrow.status, EscrowStatus::Held);
        assert_eq!(escrow.is_verified, false);
        assert_eq!(escrow.total_escrowed, 0);

        // 2. Deposit sponsor funds into escrow
        client.deposit_to_campaign_escrow(&id, &sponsor, &5_000);
        let escrow_after = client.get_campaign_escrow(&id);
        assert_eq!(escrow_after.total_escrowed, 5_000);
        assert_eq!(escrow_after.released_amount, 0);

        // 3. Verifier approves tree planting verification
        client.approve_tree_verification(&id, &500);
        let escrow_verified = client.get_campaign_escrow(&id);
        assert_eq!(escrow_verified.is_verified, true);
        assert_eq!(escrow_verified.status, EscrowStatus::Verified);
        assert_eq!(escrow_verified.trees_planted, 500);

        // 4. Release escrow funds to creator
        let released = client.release_escrow_to_creator(&id);
        assert_eq!(released, 5_000);

        let escrow_released = client.get_campaign_escrow(&id);
        assert_eq!(escrow_released.status, EscrowStatus::Released);
        assert_eq!(escrow_released.released_amount, 5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #40)")]
    fn test_escrow_release_fails_if_unverified() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);
        let token_admin = Address::generate(&env);
        let (token_addr, _, token_admin_client) = create_token(&env, &token_admin);
        let creator = Address::generate(&env);
        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);

        token_admin_client.mint(&sponsor, &10_000);
        let id = client.create_campaign(&creator, &token_addr, &10_000, &5_000, &2_000);
        client.initialize_campaign_escrow(&id, &verifier, &500);
        client.deposit_to_campaign_escrow(&id, &sponsor, &5_000);

        // Cannot release funds before verification! (Panics with EscrowNotVerified #40)
        client.release_escrow_to_creator(&id);
    }
}

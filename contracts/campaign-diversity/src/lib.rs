#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Bytes, BytesN, Env, String, Vec,
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
    /// Address authorised to register campaigns and record tree plantings
    /// (instance storage).  In production this is the campaign funding
    /// contract, so that planting data is written as part of the campaign
    /// escrow flow rather than by an arbitrary third party.
    Registrar,
    /// Number of campaigns registered with the diversity registry
    /// (instance storage).
    CampaignCount,
    /// Aggregate [`DiversityCampaign`] record keyed by campaign ID
    /// (persistent storage).
    Campaign(u64),
    /// Per-species aggregate keyed by `(campaign_id, species_code)`
    /// (persistent storage).
    Species(u64, BytesN<32>),
    /// Insertion-ordered species codes belonging to a campaign
    /// (persistent storage).  Recomputing the diversity score walks this list
    /// instead of scanning the whole key space, which bounds the per-record
    /// cost of a planting by [`MAX_SPECIES_PER_CAMPAIGN`] storage reads.
    SpeciesIndex(u64),
    /// Tree planting batch keyed by `(campaign_id, planting_id)`
    /// (persistent storage).
    Planting(u64, u32),
    /// Number of planting batches recorded for a campaign
    /// (persistent storage).
    PlantingCount(u64),
}

/// Verification state of a single planting batch.
///
/// Only [`PlantingStatus::Verified`] batches contribute to the diversity
/// score, so that unproven plantings cannot inflate a campaign's environmental
/// value.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PlantingStatus {
    /// Recorded by the registrar but not yet checked by a verifier.
    Pending,
    /// Checked and accepted; counts towards the diversity score.
    Verified,
    /// Rejected by the admin; excluded from the diversity score.
    Rejected,
}

/// Coarse environmental-value band derived from [`DiversityCampaign::diversity_score`].
///
/// The bands give front-ends and carbon-credit tooling a stable, human-readable
/// label without re-implementing the scoring formula off-chain.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BiodiversityTier {
    /// Score below [`TIER_MEDIUM_MIN`]: dominated by one or two species.
    Low,
    /// Score from [`TIER_MEDIUM_MIN`] up to (but excluding) [`TIER_HIGH_MIN`].
    Medium,
    /// Score of [`TIER_HIGH_MIN`] or more: a genuinely biodiverse planting.
    High,
}

/// A single batch of trees of one species, reported by the registrar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlantingRecord {
    /// Campaign the batch belongs to.
    pub campaign_id: u64,
    /// Position of this batch within the campaign, starting at 1.
    pub planting_id: u32,
    /// SHA-256 digest of the lower-cased species name.  This is the stable
    /// identity of the species: `Oak` and `oak` resolve to the same code.
    pub species_code: BytesN<32>,
    /// Human readable species name as submitted by the registrar.
    pub species_name: String,
    /// Number of trees in the batch.
    pub tree_count: u64,
    /// Address that reported the batch (the planter or the campaign contract).
    pub reporter: Address,
    /// Unix timestamp (seconds) when the batch was recorded.
    pub recorded_at: u64,
    /// Unix timestamp (seconds) when the batch was verified, `0` while pending.
    pub verified_at: u64,
    /// Unix timestamp (seconds) when the batch was rejected, `0` otherwise.
    pub rejected_at: u64,
    /// Current verification state.
    pub status: PlantingStatus,
}

/// Aggregated planting and verification totals for one species in one campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpeciesRecord {
    /// Campaign the species was planted in.
    pub campaign_id: u64,
    /// SHA-256 digest of the lower-cased species name.
    pub code: BytesN<32>,
    /// Human readable species name.
    pub name: String,
    /// Trees of this species across all batches, verified or not.
    pub planted_tree_count: u64,
    /// Trees of this species in batches that passed verification.
    pub verified_tree_count: u64,
    /// Unix timestamp (seconds) of the first batch for this species.
    pub first_planted_at: u64,
    /// Unix timestamp (seconds) of the most recent batch for this species.
    pub last_planted_at: u64,
}

/// Aggregate biodiversity record for a single campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiversityCampaign {
    /// Campaign identifier, supplied by the registrar so that it matches the
    /// identifier used by the campaign funding contract.
    pub campaign_id: u64,
    /// Address that registered the campaign.
    pub registrar: Address,
    /// Trees reported across all batches, verified or not.
    pub planted_tree_count: u64,
    /// Trees in batches that passed verification.  This is the figure the
    /// diversity score is computed from.
    pub verified_tree_count: u64,
    /// Distinct species with at least one verified tree.
    pub verified_species_count: u32,
    /// Biodiversity score in basis points, `0` to `10_000`, where `10_000` is
    /// the maximum attainable value.  See the module-level documentation of
    /// [`CampaignDiversityContract::diversity_score_formula`] for the exact
    /// derivation.
    pub diversity_score: u32,
    /// Environmental-value band implied by `diversity_score`.
    pub tier: BiodiversityTier,
    /// `true` once the campaign has been sealed and no further plantings can
    /// be recorded.
    pub is_sealed: bool,
    /// Unix timestamp (seconds) when the campaign was registered.
    pub created_at: u64,
    /// Unix timestamp (seconds) of the most recent state change.
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Emitted when a campaign is added to the diversity registry.
#[contractevent(topics = ["CampaignRegistered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignRegisteredEvent {
    /// Campaign the event refers to.
    #[topic]
    pub campaign_id: u64,
    /// Address that registered the campaign.
    pub registrar: Address,
    /// Unix timestamp (seconds) of the registration.
    pub registered_at: u64,
}

/// Emitted when a planting batch is submitted, before verification.
#[contractevent(topics = ["PlantingRecorded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlantingRecordedEvent {
    /// Campaign the batch belongs to.
    #[topic]
    pub campaign_id: u64,
    /// Identifier of the new batch.
    #[topic]
    pub planting_id: u32,
    /// Species the batch refers to.
    pub species_code: BytesN<32>,
    /// Human readable species name.
    pub species_name: String,
    /// Number of trees in the batch.
    pub tree_count: u64,
    /// Unix timestamp (seconds) of the submission.
    pub recorded_at: u64,
}

/// Emitted when a planting batch passes verification.
#[contractevent(topics = ["PlantingVerified"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlantingVerifiedEvent {
    /// Campaign the batch belongs to.
    #[topic]
    pub campaign_id: u64,
    /// Identifier of the verified batch.
    #[topic]
    pub planting_id: u32,
    /// Number of trees added to the verified total.
    pub tree_count: u64,
    /// Unix timestamp (seconds) of the verification.
    pub verified_at: u64,
}

/// Emitted when a planting batch is rejected and removed from the score.
#[contractevent(topics = ["PlantingRejected"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlantingRejectedEvent {
    /// Campaign the batch belongs to.
    #[topic]
    pub campaign_id: u64,
    /// Identifier of the rejected batch.
    #[topic]
    pub planting_id: u32,
    /// Number of trees removed from the verified total.
    pub tree_count: u64,
    /// Unix timestamp (seconds) of the rejection.
    pub rejected_at: u64,
}

/// Emitted whenever the diversity score of a campaign changes.
#[contractevent(topics = ["DiversityScoreUpdated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiversityScoreUpdatedEvent {
    /// Campaign whose score changed.
    #[topic]
    pub campaign_id: u64,
    /// Score before the change.
    pub previous_score: u32,
    /// Score after the change.
    pub new_score: u32,
    /// Distinct species with at least one verified tree.
    pub species_count: u32,
    /// Verified trees the new score was computed from.
    pub tree_count: u64,
    /// Environmental-value band implied by `new_score`.
    pub tier: BiodiversityTier,
}

/// Emitted when a campaign is sealed against further plantings.
#[contractevent(topics = ["CampaignSealed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignSealedEvent {
    /// Campaign that was sealed.
    #[topic]
    pub campaign_id: u64,
    /// Final diversity score of the campaign.
    pub diversity_score: u32,
    /// Final environmental-value band of the campaign.
    pub tier: BiodiversityTier,
    /// Unix timestamp (seconds) of the sealing.
    pub sealed_at: u64,
}

/// Emitted when the registrar role is transferred.
#[contractevent(topics = ["RegistrarUpdated"])]
#[derive(Clone)]
pub struct RegistrarUpdatedEvent {
    /// Registrar that was replaced.
    pub previous_registrar: Address,
    /// Registrar that took over.
    pub new_registrar: Address,
}

/// Emitted when the admin role is transferred.
#[contractevent(topics = ["AdminUpdated"])]
#[derive(Clone)]
pub struct AdminUpdatedEvent {
    /// Admin that was replaced.
    pub previous_admin: Address,
    /// Admin that took over.
    pub new_admin: Address,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Exhaustive error enumeration for the campaign-diversity contract.
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
    /// No campaign is registered under the requested ID.
    CampaignNotFound = 4,
    /// The campaign is already registered with the diversity registry.
    CampaignAlreadyRegistered = 5,
    /// The campaign has been sealed and accepts no further plantings.
    CampaignSealed = 6,
    /// The requested planting batch does not exist.
    PlantingNotFound = 7,
    /// The planting batch has already been verified.
    PlantingAlreadyVerified = 8,
    /// The planting batch is not in the `Pending` state.
    PlantingNotPending = 9,
    /// `tree_count` was zero.
    InvalidTreeCount = 10,
    /// The species name was empty or longer than [`MAX_SPECIES_NAME_LEN`].
    InvalidSpeciesName = 11,
    /// Registering this species would exceed [`MAX_SPECIES_PER_CAMPAIGN`].
    SpeciesLimitReached = 12,
    /// Recording this batch would exceed [`MAX_TREES_PER_CAMPAIGN`].
    TreeLimitReached = 13,
    /// An intermediate arithmetic value overflowed.
    ArithmeticOverflow = 14,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Full scale of the diversity score: `10_000` basis points = 100 %.
const MAX_SCORE: u32 = 10_000;
/// Number of distinct species at which the species-coverage factor saturates.
///
/// Twelve native species on one site is the point at which additional species
/// no longer meaningfully change the ecological value of a restoration, so the
/// linear ramp stops there.
const MAX_DIVERSITY_SPECIES: u32 = 12;
/// Lower bound of the [`BiodiversityTier::High`] band.
const TIER_HIGH_MIN: u32 = 7_500;
/// Lower bound of the [`BiodiversityTier::Medium`] band.
const TIER_MEDIUM_MIN: u32 = 2_500;
/// Minimum number of verified trees before a campaign can be considered for
/// carbon-credit issuance.
const CARBON_CREDIT_MIN_TREES: u64 = 1_000;
/// Minimum diversity score before a campaign can be considered for
/// carbon-credit issuance.
const CARBON_CREDIT_MIN_SCORE: u32 = 5_000;
/// Upper bound on the number of distinct species tracked per campaign.
///
/// Bounding the species index keeps the cost of recomputing the diversity
/// score constant and predictable, and is far above the
/// [`MAX_DIVERSITY_SPECIES`] needed for a full score.
const MAX_SPECIES_PER_CAMPAIGN: u32 = 64;
/// Upper bound on the number of trees a campaign may report.
///
/// Bounds the largest integer used by the diversity formula.
const MAX_TREES_PER_CAMPAIGN: u64 = 1_000_000_000;
/// Upper bound on the byte length of a species name.
const MAX_SPECIES_NAME_LEN: u32 = 64;
/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/// Registry that turns tree planting data into a comparable biodiversity score.
///
/// # Diversity score formula
///
/// The score answers the question "how biodiverse is this campaign's planting?"
/// on a `0 .. 10_000` basis-point scale, where `10_000` is the best possible
/// planting.  It is the product of two factors, both expressed in basis points:
///
/// 1. **Species coverage** — a linear ramp in the number of *distinct verified*
///    species, reaching full marks at [`MAX_DIVERSITY_SPECIES`]:
///    `coverage = min(distinct, MAX_DIVERSITY_SPECIES) * 10_000 / MAX_DIVERSITY_SPECIES`.
/// 2. **Species evenness** — Simpson's diversity index, normalised against its
///    own maximum so that a perfectly even planting earns full marks.  With
///    `N` verified trees spread over counts `n_i` and `S = species_count`:
///    `D = sum(n_i*(n_i-1)) / (N*(N-1))` and
///    `evenness = (1 - D) / (1 - 1/S) = S * (N*(N-1) - sum(n_i*(n_i-1))) / (N*(N-1) * (S-1))`.
///    This is `10_000` when every tree belongs to a different species or when
///    the species are planted in equal proportion, and `0` for a monoculture.
///
/// The reported score is `coverage * evenness / 10_000`.
///
/// The evenness factor is what stops the score from being a raw species count:
/// ten thousand monoculture trees score `0`, while twelve species planted in
/// equal proportion score `10_000`.  Both factors are computed with integer
/// arithmetic only, so the result is deterministic and cheap to verify
/// off-chain.  Only *verified* plantings contribute, so a campaign cannot buy
/// a higher score by simply reporting more trees.
#[contract]
pub struct CampaignDiversityContract;

#[contractimpl]
impl CampaignDiversityContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the registry.
    ///
    /// # Arguments
    /// * `admin`     — Address with full control over the registry.
    /// * `registrar` — Address allowed to register campaigns and report
    ///   plantings.  Production deployments set this to the campaign funding
    ///   contract so planting data is written from within the escrow flow.
    ///
    /// # Errors
    /// * [`Error::AlreadyInitialized`] — the registry is already initialised.
    pub fn initialize(env: Env, admin: Address, registrar: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Registrar, &registrar);
        env.storage().instance().set(&DataKey::CampaignCount, &0u64);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Campaign lifecycle
    // -----------------------------------------------------------------------

    /// Register a campaign so its planting data can be scored.
    ///
    /// The campaign keeps the identifier chosen by the registrar, which lets
    /// the campaign funding contract pass its own campaign ID straight
    /// through.  A freshly registered campaign scores `0`.
    ///
    /// # Arguments
    /// * `campaign_id` — Campaign identifier, unique within this registry.
    ///
    /// # Returns
    /// `true` when the campaign was created by this call, `false` when it was
    /// already registered.  Re-registering is a no-op rather than an error so
    /// that a retried integration transaction cannot brick a campaign.
    ///
    /// Only the registrar may register campaigns; the admin can rotate the
    /// registrar instead of writing planting data directly.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — the registry is not initialised.
    /// * [`Error::Unauthorized`]   — the registrar did not authorise the call.
    pub fn register_campaign(env: Env, campaign_id: u64) -> bool {
        Self::assert_initialized(&env);
        Self::require_registrar(&env);

        let key = DataKey::Campaign(campaign_id);
        if env.storage().persistent().has(&key) {
            return false;
        }

        let now = env.ledger().timestamp();
        let campaign = DiversityCampaign {
            campaign_id,
            registrar: Self::get_registrar_inner(&env),
            planted_tree_count: 0,
            verified_tree_count: 0,
            verified_species_count: 0,
            diversity_score: 0,
            tier: Self::tier_for_score(0),
            is_sealed: false,
            created_at: now,
            updated_at: now,
        };
        Self::save_campaign(&env, campaign_id, &campaign);
        env.storage().persistent().set(
            &DataKey::SpeciesIndex(campaign_id),
            &Vec::<BytesN<32>>::new(&env),
        );
        env.storage()
            .persistent()
            .set(&DataKey::PlantingCount(campaign_id), &0u32);

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        count = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &count);

        CampaignRegisteredEvent {
            campaign_id,
            registrar: campaign.registrar,
            registered_at: now,
        }
        .publish(&env);

        true
    }

    /// Seal a campaign, permanently closing it to new planting batches.
    ///
    /// Sealing does not change the score; it only stops further batches from
    /// being reported, so that a finished restoration can be certified
    /// without having to watch the campaign for later writes.
    ///
    /// # Arguments
    /// * `campaign_id` — Campaign to seal.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`]     — the registrar did not authorise the call.
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    /// * [`Error::CampaignSealed`]   — the campaign is already sealed.
    pub fn seal_campaign(env: Env, campaign_id: u64) {
        Self::assert_initialized(&env);
        Self::require_registrar(&env);

        let mut campaign = Self::load_campaign(&env, campaign_id);
        if campaign.is_sealed {
            panic_with_error!(&env, Error::CampaignSealed);
        }

        campaign.is_sealed = true;
        campaign.updated_at = env.ledger().timestamp();
        Self::save_campaign(&env, campaign_id, &campaign);

        CampaignSealedEvent {
            campaign_id,
            diversity_score: campaign.diversity_score,
            tier: campaign.tier,
            sealed_at: campaign.updated_at,
        }
        .publish(&env);
    }

    // -----------------------------------------------------------------------
    // Plantings
    // -----------------------------------------------------------------------

    /// Record a batch of trees of a single species.
    ///
    /// The batch is stored as [`PlantingStatus::Pending`] and does not affect
    /// the diversity score until [`Self::verify_planting`] is called.  Species
    /// identity is derived from the lower-cased species name, so repeated
    /// batches of the same species accumulate into one [`SpeciesRecord`]
    /// regardless of capitalisation.
    ///
    /// # Arguments
    /// * `campaign_id`  — Registered campaign the batch belongs to.
    /// * `species_name` — Human readable species name, 1 to
    ///   [`MAX_SPECIES_NAME_LEN`] bytes.  Casing is not significant.
    /// * `tree_count`   — Number of trees planted, greater than zero.
    /// * `reporter`     — Address that observed the planting, recorded for
    ///   audit.  It does not authorise the call: the registrar does.
    ///
    /// # Returns
    /// The identifier of the new planting batch, starting at 1 per campaign.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`]        — the registrar did not authorise the call.
    /// * [`Error::CampaignNotFound`]    — unknown campaign.
    /// * [`Error::CampaignSealed`]      — the campaign is closed to plantings.
    /// * [`Error::InvalidSpeciesName`]  — empty or over-long species name.
    /// * [`Error::InvalidTreeCount`]    — `tree_count` is zero.
    /// * [`Error::SpeciesLimitReached`] — too many distinct species.
    /// * [`Error::TreeLimitReached`]    — too many trees for one campaign.
    pub fn record_planting(
        env: Env,
        campaign_id: u64,
        species_name: String,
        tree_count: u64,
        reporter: Address,
    ) -> u32 {
        Self::assert_initialized(&env);
        Self::require_registrar(&env);

        let mut campaign = Self::load_campaign(&env, campaign_id);
        if campaign.is_sealed {
            panic_with_error!(&env, Error::CampaignSealed);
        }
        if tree_count == 0 {
            panic_with_error!(&env, Error::InvalidTreeCount);
        }

        let code = Self::species_code(&env, &species_name);
        let now = env.ledger().timestamp();

        // Validate the tree budget before any state is written so a rejected
        // batch leaves the campaign untouched.
        let new_planted_total = campaign
            .planted_tree_count
            .checked_add(tree_count)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        if new_planted_total > MAX_TREES_PER_CAMPAIGN {
            panic_with_error!(&env, Error::TreeLimitReached);
        }

        let species_key = DataKey::Species(campaign_id, code.clone());
        let mut index: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::SpeciesIndex(campaign_id))
            .unwrap_or_else(|| Vec::new(&env));
        let mut species: SpeciesRecord = match env.storage().persistent().get(&species_key) {
            Some(record) => record,
            None => {
                if index.len() >= MAX_SPECIES_PER_CAMPAIGN {
                    panic_with_error!(&env, Error::SpeciesLimitReached);
                }
                index.push_back(code.clone());
                SpeciesRecord {
                    campaign_id,
                    code: code.clone(),
                    name: species_name.clone(),
                    planted_tree_count: 0,
                    verified_tree_count: 0,
                    first_planted_at: now,
                    last_planted_at: now,
                }
            }
        };

        let recorded_batches: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlantingCount(campaign_id))
            .unwrap_or(0);
        let next_planting_id = recorded_batches
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        let record = PlantingRecord {
            campaign_id,
            planting_id: next_planting_id,
            species_code: code.clone(),
            species_name: species_name.clone(),
            tree_count,
            reporter: reporter.clone(),
            recorded_at: now,
            verified_at: 0,
            rejected_at: 0,
            status: PlantingStatus::Pending,
        };

        // Effects: persist the batch, the species aggregate, the index and the
        // campaign counters.  There are no external calls after this point.
        let planting_key = DataKey::Planting(campaign_id, next_planting_id);
        env.storage().persistent().set(&planting_key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&planting_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .persistent()
            .set(&DataKey::PlantingCount(campaign_id), &next_planting_id);

        species.planted_tree_count = species
            .planted_tree_count
            .checked_add(tree_count)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        species.last_planted_at = now;
        Self::save_species(&env, &species_key, &species);
        Self::save_species_index(&env, campaign_id, &index);

        campaign.planted_tree_count = new_planted_total;
        campaign.updated_at = now;
        Self::save_campaign(&env, campaign_id, &campaign);

        PlantingRecordedEvent {
            campaign_id,
            planting_id: next_planting_id,
            species_code: code,
            species_name,
            tree_count,
            recorded_at: now,
        }
        .publish(&env);

        next_planting_id
    }

    /// Accept a pending planting batch and fold it into the diversity score.
    ///
    /// # Arguments
    /// * `campaign_id` — Campaign the batch belongs to.
    /// * `planting_id` — Batch to verify.
    ///
    /// # Returns
    /// The campaign's diversity score after verification, in basis points.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`]            — the registrar did not authorise the call.
    /// * [`Error::PlantingNotFound`]        — unknown batch.
    /// * [`Error::PlantingAlreadyVerified`] — the batch was already accepted.
    /// * [`Error::PlantingNotPending`]      — the batch was already rejected.
    pub fn verify_planting(env: Env, campaign_id: u64, planting_id: u32) -> u32 {
        Self::assert_initialized(&env);
        Self::require_registrar(&env);

        let key = DataKey::Planting(campaign_id, planting_id);
        let mut record: PlantingRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));
        match record.status {
            PlantingStatus::Pending => {}
            PlantingStatus::Verified => panic_with_error!(&env, Error::PlantingAlreadyVerified),
            PlantingStatus::Rejected => panic_with_error!(&env, Error::PlantingNotPending),
        }

        let now = env.ledger().timestamp();
        record.status = PlantingStatus::Verified;
        record.verified_at = now;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        let species_key = DataKey::Species(campaign_id, record.species_code.clone());
        let mut species: SpeciesRecord = env
            .storage()
            .persistent()
            .get(&species_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));
        species.verified_tree_count = species
            .verified_tree_count
            .checked_add(record.tree_count)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        Self::save_species(&env, &species_key, &species);

        // `rescore` reads the verified total off the campaign record, so it has
        // to be advanced before the score is recomputed.
        let mut campaign = Self::load_campaign(&env, campaign_id);
        campaign.verified_tree_count = campaign
            .verified_tree_count
            .checked_add(record.tree_count)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        Self::save_campaign(&env, campaign_id, &campaign);

        PlantingVerifiedEvent {
            campaign_id,
            planting_id,
            tree_count: record.tree_count,
            verified_at: now,
        }
        .publish(&env);

        Self::rescore(&env, campaign_id)
    }

    /// Reject a planting batch so that it can never enter the diversity score.
    ///
    /// This is the correction path for a fraudulent or mistaken report: the
    /// batch is kept for auditability but never counts towards the score.
    /// Rejecting an already rejected batch is a no-op, so the correction is
    /// idempotent.
    ///
    /// Only *pending* batches can be rejected.  Verified data is immutable by
    /// design: a score that a verifier has attested to must not be
    /// retroactively rewritten, otherwise nothing about the published score
    /// would be trustworthy.  Verified trees that later turn out to be lost are
    /// handled at the campaign level by the campaign funding contract, which
    /// moves the whole campaign to `VerificationFailed`.
    ///
    /// # Arguments
    /// * `campaign_id` — Campaign the batch belongs to.
    /// * `planting_id` — Batch to reject.
    ///
    /// # Returns
    /// The campaign's diversity score after the correction, in basis points.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`]            — the admin did not authorise the call.
    /// * [`Error::PlantingNotFound`]        — unknown batch.
    /// * [`Error::PlantingAlreadyVerified`] — a verified batch cannot be voided.
    pub fn reject_planting(env: Env, campaign_id: u64, planting_id: u32) -> u32 {
        Self::assert_initialized(&env);
        Self::require_admin(&env);

        let key = DataKey::Planting(campaign_id, planting_id);
        let mut record: PlantingRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound));
        match record.status {
            PlantingStatus::Rejected => {
                return Self::load_campaign(&env, campaign_id).diversity_score
            }
            PlantingStatus::Verified => panic_with_error!(&env, Error::PlantingAlreadyVerified),
            PlantingStatus::Pending => {}
        }

        let now = env.ledger().timestamp();
        record.status = PlantingStatus::Rejected;
        record.rejected_at = now;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        PlantingRejectedEvent {
            campaign_id,
            planting_id,
            tree_count: record.tree_count,
            rejected_at: now,
        }
        .publish(&env);

        Self::rescore(&env, campaign_id)
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the aggregate diversity record of a campaign.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn get_campaign(env: Env, campaign_id: u64) -> DiversityCampaign {
        Self::load_campaign(&env, campaign_id)
    }

    /// Return a single planting batch.
    ///
    /// # Errors
    /// * [`Error::PlantingNotFound`] — unknown batch.
    pub fn get_planting(env: Env, campaign_id: u64, planting_id: u32) -> PlantingRecord {
        let key = DataKey::Planting(campaign_id, planting_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound))
    }

    /// Return the aggregated record of one species in a campaign.
    ///
    /// # Arguments
    /// * `campaign_id`  — Campaign to read from.
    /// * `species_code` — SHA-256 digest of the lower-cased species name, as
    ///   returned by [`Self::get_species_code`].
    ///
    /// # Errors
    /// * [`Error::PlantingNotFound`] — the species was never planted.
    pub fn get_species(env: Env, campaign_id: u64, species_code: BytesN<32>) -> SpeciesRecord {
        let key = DataKey::Species(campaign_id, species_code);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlantingNotFound))
    }

    /// Return every species recorded for a campaign, in first-planted order.
    pub fn list_species(env: Env, campaign_id: u64) -> Vec<SpeciesRecord> {
        Self::assert_campaign_exists(&env, campaign_id);
        let index: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::SpeciesIndex(campaign_id))
            .unwrap_or_else(|| Vec::new(&env));

        let mut out = Vec::new(&env);
        for code in index.iter() {
            if let Some(species) = env
                .storage()
                .persistent()
                .get(&DataKey::Species(campaign_id, code.clone()))
            {
                out.push_back(species);
            }
        }
        out
    }

    /// Derive the on-chain species code from a species name.
    ///
    /// Exposed so off-chain callers can compute the code without storing a
    /// copy of the canonicalisation rules: the code is the SHA-256 digest of
    /// the ASCII-lower-cased name, and the stored name is returned unchanged.
    ///
    /// # Errors
    /// * [`Error::InvalidSpeciesName`] — empty or over-long species name.
    pub fn get_species_code(env: Env, species_name: String) -> BytesN<32> {
        Self::species_code(&env, &species_name)
    }

    /// Return the diversity score of a campaign, in basis points `0 .. 10_000`.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn get_diversity_score(env: Env, campaign_id: u64) -> u32 {
        Self::load_campaign(&env, campaign_id).diversity_score
    }

    /// Return the environmental-value band of a campaign.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn get_tier(env: Env, campaign_id: u64) -> BiodiversityTier {
        Self::load_campaign(&env, campaign_id).tier
    }

    /// Return the number of distinct species with at least one verified tree.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn get_species_count(env: Env, campaign_id: u64) -> u32 {
        Self::load_campaign(&env, campaign_id).verified_species_count
    }

    /// Return the number of verified trees in a campaign.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn get_verified_tree_count(env: Env, campaign_id: u64) -> u64 {
        Self::load_campaign(&env, campaign_id).verified_tree_count
    }

    /// Report whether a campaign meets the on-chain bar for carbon-credit
    /// issuance: at least [`CARBON_CREDIT_MIN_TREES`] verified trees and a
    /// diversity score of at least [`CARBON_CREDIT_MIN_SCORE`].
    ///
    /// This is a screening signal for off-chain registries, not an issuance
    /// decision: it deliberately says nothing about location, survival rates
    /// or permanence.
    ///
    /// # Errors
    /// * [`Error::CampaignNotFound`] — unknown campaign.
    pub fn is_carbon_credit_eligible(env: Env, campaign_id: u64) -> bool {
        let campaign = Self::load_campaign(&env, campaign_id);
        campaign.verified_tree_count >= CARBON_CREDIT_MIN_TREES
            && campaign.diversity_score >= CARBON_CREDIT_MIN_SCORE
    }

    /// Return the number of planting batches recorded for a campaign.
    pub fn get_planting_count(env: Env, campaign_id: u64) -> u32 {
        Self::assert_campaign_exists(&env, campaign_id);
        env.storage()
            .persistent()
            .get(&DataKey::PlantingCount(campaign_id))
            .unwrap_or(0)
    }

    /// Return the total number of campaigns in the registry.
    pub fn get_campaign_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    /// Return the admin address.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — the registry is not initialised.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Return the registrar address.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — the registry is not initialised.
    pub fn get_registrar(env: Env) -> Address {
        Self::get_registrar_inner(&env)
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// Transfer the admin role.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — the registry is not initialised.
    /// * [`Error::Unauthorized`]   — caller is not the current admin.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        AdminUpdatedEvent {
            previous_admin: admin,
            new_admin,
        }
        .publish(&env);
    }

    /// Transfer the registrar role, for example when the campaign funding
    /// contract is upgraded to a new address.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — the registry is not initialised.
    /// * [`Error::Unauthorized`]   — caller is not the current admin.
    pub fn set_registrar(env: Env, new_registrar: Address) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        let previous_registrar = Self::get_registrar_inner(&env);
        env.storage()
            .instance()
            .set(&DataKey::Registrar, &new_registrar);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        RegistrarUpdatedEvent {
            previous_registrar,
            new_registrar,
        }
        .publish(&env);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Panic with [`Error::NotInitialized`] if the registry has not been
    /// initialised yet.
    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    /// Panic with [`Error::CampaignNotFound`] unless `campaign_id` is
    /// registered.
    fn assert_campaign_exists(env: &Env, campaign_id: u64) {
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Campaign(campaign_id))
        {
            panic_with_error!(env, Error::CampaignNotFound);
        }
    }

    /// Read the registrar from instance storage, or panic with
    /// [`Error::NotInitialized`] when the registry is not initialised.
    fn get_registrar_inner(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Registrar)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    /// Require authorisation from the admin.
    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }

    /// Require authorisation from the registrar.
    fn require_registrar(env: &Env) {
        Self::get_registrar_inner(env).require_auth();
    }

    /// Load a [`DiversityCampaign`], bumping its TTL, or panic with
    /// [`Error::CampaignNotFound`].
    fn load_campaign(env: &Env, campaign_id: u64) -> DiversityCampaign {
        let key = DataKey::Campaign(campaign_id);
        match env.storage().persistent().get(&key) {
            Some(campaign) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
                campaign
            }
            None => panic_with_error!(env, Error::CampaignNotFound),
        }
    }

    /// Persist a [`DiversityCampaign`] and extend TTLs for both the campaign
    /// entry and the instance storage holding the roles.
    fn save_campaign(env: &Env, campaign_id: u64, campaign: &DiversityCampaign) {
        let key = DataKey::Campaign(campaign_id);
        env.storage().persistent().set(&key, campaign);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Persist a [`SpeciesRecord`] and extend its TTL.
    fn save_species(env: &Env, key: &DataKey, species: &SpeciesRecord) {
        env.storage().persistent().set(key, species);
        env.storage()
            .persistent()
            .extend_ttl(key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Persist the insertion-ordered species index of a campaign.
    fn save_species_index(env: &Env, campaign_id: u64, index: &Vec<BytesN<32>>) {
        let key = DataKey::SpeciesIndex(campaign_id);
        env.storage().persistent().set(&key, index);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Derive the stable species code from a species name.
    ///
    /// The name is ASCII-lower-cased before hashing so that casing cannot be
    /// used to claim the same species twice.  Bytes outside the ASCII range
    /// are passed through untouched, which keeps the mapping deterministic for
    /// any input while leaving the canonicalisation of accented names to the
    /// registrar.
    fn species_code(env: &Env, species_name: &String) -> BytesN<32> {
        let name_len = species_name.len();
        if name_len == 0 || name_len > MAX_SPECIES_NAME_LEN {
            panic_with_error!(env, Error::InvalidSpeciesName);
        }

        let raw = species_name.to_bytes();
        let mut canonical = Bytes::new(env);
        let mut i = 0u32;
        while i < name_len {
            let byte = raw.get_unchecked(i);
            let lowered = if byte.is_ascii_uppercase() {
                byte + (b'a' - b'A')
            } else {
                byte
            };
            canonical.push_back(lowered);
            i += 1;
        }

        env.crypto().sha256(&canonical).into()
    }

    /// Recompute the diversity score of a campaign from its verified species
    /// and persist the result, emitting a [`DiversityScoreUpdatedEvent`] when
    /// the score actually moved.
    ///
    /// Returns the new score in basis points.
    fn rescore(env: &Env, campaign_id: u64) -> u32 {
        let mut campaign = Self::load_campaign(env, campaign_id);
        let index: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::SpeciesIndex(campaign_id))
            .unwrap_or_else(|| Vec::new(env));

        // Single pass over the species index: count the species that carry at
        // least one verified tree and accumulate the Simpson numerator.
        let mut species_count: u32 = 0;
        let mut same_species_pairs: u128 = 0;
        for code in index.iter() {
            let species: Option<SpeciesRecord> = env
                .storage()
                .persistent()
                .get(&DataKey::Species(campaign_id, code));
            if let Some(species) = species {
                if species.verified_tree_count > 0 {
                    species_count += 1;
                    same_species_pairs = same_species_pairs
                        .checked_add(Self::ordered_pairs(species.verified_tree_count))
                        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow));
                }
            }
        }

        let score = Self::score_from_species(
            species_count,
            campaign.verified_tree_count,
            same_species_pairs,
            env,
        );
        let tier = Self::tier_for_score(score);

        if score == campaign.diversity_score && species_count == campaign.verified_species_count {
            campaign.updated_at = env.ledger().timestamp();
            Self::save_campaign(env, campaign_id, &campaign);
            return score;
        }

        let previous_score = campaign.diversity_score;
        campaign.verified_species_count = species_count;
        campaign.diversity_score = score;
        campaign.tier = tier;
        campaign.updated_at = env.ledger().timestamp();
        Self::save_campaign(env, campaign_id, &campaign);

        if score != previous_score {
            DiversityScoreUpdatedEvent {
                campaign_id,
                previous_score,
                new_score: score,
                species_count,
                tree_count: campaign.verified_tree_count,
                tier,
            }
            .publish(env);
        }

        score
    }

    /// `n * (n - 1)`, the number of ordered same-species tree pairs.
    ///
    /// Returns zero for `n < 2` because a single tree forms no pair.
    fn ordered_pairs(n: u64) -> u128 {
        if n < 2 {
            return 0;
        }
        let n = n as u128;
        n * (n - 1)
    }

    /// Combine the species-coverage and species-evenness factors into the
    /// final `0 .. 10_000` diversity score.
    ///
    /// `same_species_pairs` is `sum(n_i * (n_i - 1))` over the verified species
    /// counts, and `verified_tree_count` is their sum `N`.  See the type-level
    /// documentation of [`CampaignDiversityContract`] for the derivation.
    fn score_from_species(
        species_count: u32,
        verified_tree_count: u64,
        same_species_pairs: u128,
        env: &Env,
    ) -> u32 {
        // Fewer than two verified trees, or a single verified species, means
        // there is no evenness to measure: the planting carries no diversity.
        if species_count < 2 || verified_tree_count < 2 {
            return 0;
        }

        // Species coverage: linear ramp to full marks at MAX_DIVERSITY_SPECIES.
        let capped = if species_count > MAX_DIVERSITY_SPECIES {
            MAX_DIVERSITY_SPECIES
        } else {
            species_count
        };
        let coverage = capped as u128 * MAX_SCORE as u128 / MAX_DIVERSITY_SPECIES as u128;

        // Species evenness: Simpson's diversity index normalised by its
        // maximum, so that a perfectly even planting scores a full `10_000`
        // rather than the `S / (S - 1)`-ish value the raw index converges to.
        //
        //   D       = A / T                       (probability two trees share
        //                                           a species, without replacement)
        //   E       = (1 - D) / (1 - 1 / S)       (normalised evenness)
        //           = S * (T - A) / (T * (S - 1))
        //
        // `A` cannot exceed `T`, so the numerator's subtraction is safe once
        // clamped; `S >= 2` is guaranteed by the guard above, so the divisor
        // `S - 1` is never zero.
        let total_pairs = Self::ordered_pairs(verified_tree_count);
        if total_pairs == 0 {
            return 0;
        }
        let same_species_pairs = if same_species_pairs > total_pairs {
            total_pairs
        } else {
            same_species_pairs
        };
        let different_pairs = total_pairs - same_species_pairs;
        let species = species_count as u128;
        let evenness = species
            .checked_mul(different_pairs)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            .checked_mul(MAX_SCORE as u128)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            / total_pairs
            / (species - 1);
        // The normalised index overshoots `10_000` by a hair when the planting
        // is perfectly even, because the without-replacement correction only
        // reaches 1 asymptotically.  Clamp rather than let a perfect planting
        // report more than full marks.
        let evenness = if evenness > MAX_SCORE as u128 {
            MAX_SCORE as u128
        } else {
            evenness
        };

        let score = coverage
            .checked_mul(evenness)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
            / MAX_SCORE as u128;
        // `coverage` and `evenness` are both capped at `MAX_SCORE`, so the
        // product divided by `MAX_SCORE` always fits back into a `u32`.
        score as u32
    }

    /// Map a diversity score onto its environmental-value band.
    fn tier_for_score(score: u32) -> BiodiversityTier {
        if score >= TIER_HIGH_MIN {
            BiodiversityTier::High
        } else if score >= TIER_MEDIUM_MIN {
            BiodiversityTier::Medium
        } else {
            BiodiversityTier::Low
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
        Address, Env, Event,
    };

    /// Species names used by the tests, in a deliberately mixed-case order so
    /// that canonicalisation is exercised on every run.
    const OAK: &str = "Oak";
    const MAPLE: &str = "maple";
    const PINE: &str = "PINE";
    const TEAK: &str = "teak";
    const NEEM: &str = "Neem";
    const CEDAR: &str = "Cedar";
    const MANGO: &str = "mango";
    const EUCALYPTUS: &str = "Eucalyptus";

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

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

    /// Deploy and initialise the registry with a distinct admin and registrar.
    fn setup_contract(
        env: &Env,
    ) -> (
        Address,
        CampaignDiversityContractClient<'_>,
        Address,
        Address,
    ) {
        let contract_id = env.register(CampaignDiversityContract, ());
        let client = CampaignDiversityContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let registrar = Address::generate(env);
        client.initialize(&admin, &registrar);
        (contract_id, client, admin, registrar)
    }

    /// Record and immediately verify one planting batch.
    fn plant_and_verify(
        env: &Env,
        client: &CampaignDiversityContractClient,
        campaign_id: u64,
        species: &str,
        tree_count: u64,
    ) {
        let reporter = Address::generate(env);
        let planting_id = client.record_planting(
            &campaign_id,
            &String::from_str(env, species),
            &tree_count,
            &reporter,
        );
        client.verify_planting(&campaign_id, &planting_id);
    }

    /// Sixty-four distinct species names, used by the limit tests.
    const LIMIT_SPECIES: [&str; 64] = [
        "species-00",
        "species-01",
        "species-02",
        "species-03",
        "species-04",
        "species-05",
        "species-06",
        "species-07",
        "species-08",
        "species-09",
        "species-10",
        "species-11",
        "species-12",
        "species-13",
        "species-14",
        "species-15",
        "species-16",
        "species-17",
        "species-18",
        "species-19",
        "species-20",
        "species-21",
        "species-22",
        "species-23",
        "species-24",
        "species-25",
        "species-26",
        "species-27",
        "species-28",
        "species-29",
        "species-30",
        "species-31",
        "species-32",
        "species-33",
        "species-34",
        "species-35",
        "species-36",
        "species-37",
        "species-38",
        "species-39",
        "species-40",
        "species-41",
        "species-42",
        "species-43",
        "species-44",
        "species-45",
        "species-46",
        "species-47",
        "species-48",
        "species-49",
        "species-50",
        "species-51",
        "species-52",
        "species-53",
        "species-54",
        "species-55",
        "species-56",
        "species-57",
        "species-58",
        "species-59",
        "species-60",
        "species-61",
        "species-62",
        "species-63",
    ];

    /// Twelve species planted in equal proportion: the maximum attainable score.
    const FULL_DIVERSITY: [&str; 12] = [
        OAK, MAPLE, PINE, TEAK, NEEM, CEDAR, MANGO, EUCALYPTUS, "Willow", "Birch", "Poplar", "Ash",
    ];

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, admin, registrar) = setup_contract(&env);

        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_registrar(), registrar);
        assert_eq!(client.get_campaign_count(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let new_admin = Address::generate(&env);
        client.initialize(&new_admin, &new_admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_calls_before_initialize_are_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CampaignDiversityContract, ());
        let client = CampaignDiversityContractClient::new(&env, &contract_id);

        client.register_campaign(&1);
    }

    // -----------------------------------------------------------------------
    // Campaign registration
    // -----------------------------------------------------------------------

    #[test]
    fn test_register_campaign_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, registrar) = setup_contract(&env);

        assert!(client.register_campaign(&7));

        let campaign = client.get_campaign(&7);
        assert_eq!(campaign.campaign_id, 7);
        assert_eq!(campaign.registrar, registrar);
        assert_eq!(campaign.planted_tree_count, 0);
        assert_eq!(campaign.verified_tree_count, 0);
        assert_eq!(campaign.verified_species_count, 0);
        assert_eq!(campaign.diversity_score, 0);
        assert_eq!(campaign.tier, BiodiversityTier::Low);
        assert!(!campaign.is_sealed);
        assert_eq!(campaign.created_at, 1_000);
        assert_eq!(client.get_campaign_count(), 1);
    }

    #[test]
    fn test_register_campaign_is_idempotent() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        assert!(client.register_campaign(&1));
        // A retried integration transaction must not brick the campaign.
        assert!(!client.register_campaign(&1));
        assert_eq!(client.get_campaign_count(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_get_campaign_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.get_campaign(&99);
    }

    #[test]
    fn test_seal_campaign_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        plant_and_verify(&env, &client, 1, OAK, 100);
        let score_before = client.get_diversity_score(&1);

        set_time(&env, 2_000);
        client.seal_campaign(&1);

        let campaign = client.get_campaign(&1);
        assert!(campaign.is_sealed);
        // Sealing freezes the planting data without rewriting the score.
        assert_eq!(campaign.diversity_score, score_before);
        assert_eq!(campaign.updated_at, 2_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_seal_campaign_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        client.seal_campaign(&1);
        client.seal_campaign(&1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_record_planting_on_sealed_campaign_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        client.seal_campaign(&1);

        let reporter = Address::generate(&env);
        client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter);
    }

    // -----------------------------------------------------------------------
    // Planting records
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_planting_starts_pending_and_does_not_score() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let planting_id = client.record_planting(&1, &String::from_str(&env, OAK), &250, &reporter);
        assert_eq!(planting_id, 1);

        let record = client.get_planting(&1, &1);
        assert_eq!(record.status, PlantingStatus::Pending);
        assert_eq!(record.tree_count, 250);
        assert_eq!(record.reporter, reporter);
        assert_eq!(record.recorded_at, 1_000);
        assert_eq!(record.verified_at, 0);

        // Unverified trees are counted as reported but never scored.
        let campaign = client.get_campaign(&1);
        assert_eq!(campaign.planted_tree_count, 250);
        assert_eq!(campaign.verified_tree_count, 0);
        assert_eq!(campaign.diversity_score, 0);
        assert_eq!(client.get_planting_count(&1), 1);
    }

    #[test]
    fn test_record_planting_ids_increment_per_campaign() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        client.register_campaign(&2);
        let reporter = Address::generate(&env);

        assert_eq!(
            client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter),
            1
        );
        assert_eq!(
            client.record_planting(&1, &String::from_str(&env, PINE), &10, &reporter),
            2
        );
        // Planting IDs are per campaign, not global.
        assert_eq!(
            client.record_planting(&2, &String::from_str(&env, OAK), &10, &reporter),
            1
        );
    }

    #[test]
    fn test_species_name_is_case_insensitive() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        // "Oak", "oak" and "OAK" must all resolve to one species.
        let lower_code = client.get_species_code(&String::from_str(&env, "oak"));
        let mixed_code = client.get_species_code(&String::from_str(&env, "OaK"));
        assert_eq!(lower_code, mixed_code);
        assert_ne!(
            lower_code,
            client.get_species_code(&String::from_str(&env, PINE))
        );

        for name in [OAK, "oak", "OAK"] {
            let planting_id =
                client.record_planting(&1, &String::from_str(&env, name), &10, &reporter);
            client.verify_planting(&1, &planting_id);
        }

        assert_eq!(client.get_species_count(&1), 1);
        assert_eq!(client.get_verified_tree_count(&1), 30);
        assert_eq!(client.list_species(&1).len(), 1);
    }

    #[test]
    fn test_species_aggregates_across_batches() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        client.record_planting(&1, &String::from_str(&env, OAK), &100, &reporter);
        set_time(&env, 1_500);
        let second = client.record_planting(&1, &String::from_str(&env, OAK), &40, &reporter);
        client.verify_planting(&1, &second);

        let code = client.get_species_code(&String::from_str(&env, OAK));
        let species = client.get_species(&1, &code);
        assert_eq!(species.name, String::from_str(&env, OAK));
        assert_eq!(species.planted_tree_count, 140);
        assert_eq!(species.verified_tree_count, 40);
        assert_eq!(species.first_planted_at, 1_000);
        assert_eq!(species.last_planted_at, 1_500);
    }

    #[test]
    fn test_list_species_preserves_first_planted_order() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        plant_and_verify(&env, &client, 1, PINE, 10);
        plant_and_verify(&env, &client, 1, OAK, 10);
        plant_and_verify(&env, &client, 1, MAPLE, 10);

        let species = client.list_species(&1);
        assert_eq!(species.len(), 3);
        assert_eq!(species.get(0).unwrap().name, String::from_str(&env, PINE));
        assert_eq!(species.get(1).unwrap().name, String::from_str(&env, OAK));
        assert_eq!(species.get(2).unwrap().name, String::from_str(&env, MAPLE));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_record_planting_zero_trees_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        client.record_planting(&1, &String::from_str(&env, OAK), &0, &reporter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_record_planting_empty_species_name_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        client.record_planting(&1, &String::from_str(&env, ""), &10, &reporter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_species_code_rejects_over_long_name() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);

        // MAX_SPECIES_NAME_LEN is 64 bytes.
        let too_long = "a".repeat(65);
        client.get_species_code(&String::from_str(&env, &too_long));
    }

    #[test]
    fn test_species_code_accepts_max_length_name() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);

        let at_limit = "a".repeat(64);
        let name = String::from_str(&env, &at_limit);
        client.get_species_code(&name);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_record_planting_for_unknown_campaign_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let reporter = Address::generate(&env);
        client.record_planting(&42, &String::from_str(&env, OAK), &10, &reporter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_species_limit_is_enforced() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        // MAX_SPECIES_PER_CAMPAIGN is 64 distinct species.
        for species_name in LIMIT_SPECIES.iter() {
            let name = String::from_str(&env, species_name);
            client.record_planting(&1, &name, &1, &reporter);
        }
        assert_eq!(client.list_species(&1).len(), 64);

        let overflow = String::from_str(&env, "species-64");
        client.record_planting(&1, &overflow, &1, &reporter);
    }

    #[test]
    fn test_rejected_species_below_limit_is_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        for species_name in LIMIT_SPECIES.iter().take(63) {
            let name = String::from_str(&env, species_name);
            client.record_planting(&1, &name, &1, &reporter);
        }
        // Re-reporting an existing species at the cap must still work.
        let existing = String::from_str(&env, LIMIT_SPECIES[0]);
        assert_eq!(client.record_planting(&1, &existing, &1, &reporter), 64);
        assert_eq!(client.list_species(&1).len(), 63);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_tree_limit_is_enforced() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        // MAX_TREES_PER_CAMPAIGN is 1_000_000_000; the second batch tips over.
        client.record_planting(&1, &String::from_str(&env, OAK), &600_000_000, &reporter);
        client.record_planting(&1, &String::from_str(&env, PINE), &600_000_000, &reporter);
    }

    // -----------------------------------------------------------------------
    // Verification
    // -----------------------------------------------------------------------

    #[test]
    fn test_verify_planting_updates_score() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        let first = client.record_planting(&1, &String::from_str(&env, OAK), &50, &reporter);
        let second = client.record_planting(&1, &String::from_str(&env, PINE), &50, &reporter);
        assert_eq!(client.get_diversity_score(&1), 0);

        client.verify_planting(&1, &first);
        // A single species is a monoculture and carries no diversity.
        assert_eq!(client.get_diversity_score(&1), 0);
        assert_eq!(client.get_species_count(&1), 1);
        assert_eq!(client.get_verified_tree_count(&1), 50);

        let score = client.verify_planting(&1, &second);
        // Two species, 50/50: coverage 2/12 of full marks, evenness perfect.
        assert_eq!(score, 1_666);
        assert_eq!(client.get_diversity_score(&1), 1_666);
        assert_eq!(client.get_species_count(&1), 2);
        assert_eq!(client.get_verified_tree_count(&1), 100);

        let record = client.get_planting(&1, &second);
        assert_eq!(record.status, PlantingStatus::Verified);
        assert_eq!(record.verified_at, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_verify_planting_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let planting_id = client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter);

        client.verify_planting(&1, &planting_id);
        client.verify_planting(&1, &planting_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_verify_rejected_planting_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let planting_id = client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter);

        client.reject_planting(&1, &planting_id);
        client.verify_planting(&1, &planting_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_verify_unknown_planting_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        client.verify_planting(&1, &99);
    }

    // -----------------------------------------------------------------------
    // Rejection
    // -----------------------------------------------------------------------

    #[test]
    fn test_reject_planting_excludes_trees_from_score() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);

        let kept = client.record_planting(&1, &String::from_str(&env, OAK), &50, &reporter);
        let fraudulent = client.record_planting(&1, &String::from_str(&env, PINE), &50, &reporter);
        client.verify_planting(&1, &kept);
        // The second batch is caught as fraudulent before it is ever verified.
        assert_eq!(client.get_diversity_score(&1), 0);

        set_time(&env, 2_000);
        let score = client.reject_planting(&1, &fraudulent);

        // Back to a single-species planting: no diversity.
        assert_eq!(score, 0);
        assert_eq!(client.get_species_count(&1), 1);
        assert_eq!(client.get_verified_tree_count(&1), 50);
        // The batch is retained for audit, marked rejected.
        let record = client.get_planting(&1, &fraudulent);
        assert_eq!(record.status, PlantingStatus::Rejected);
        assert_eq!(record.rejected_at, 2_000);
        // Reported totals are untouched by rejection.
        assert_eq!(client.get_campaign(&1).planted_tree_count, 100);
    }

    #[test]
    fn test_reject_planting_is_idempotent() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let planting_id = client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter);

        let first = client.reject_planting(&1, &planting_id);
        set_time(&env, 3_000);
        let second = client.reject_planting(&1, &planting_id);
        assert_eq!(first, second);
        assert_eq!(second, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_reject_verified_planting_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let planting_id = client.record_planting(&1, &String::from_str(&env, OAK), &10, &reporter);
        client.verify_planting(&1, &planting_id);

        client.reject_planting(&1, &planting_id);
    }

    // -----------------------------------------------------------------------
    // Diversity score
    // -----------------------------------------------------------------------

    #[test]
    fn test_score_is_zero_for_a_monoculture() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Ten thousand trees of one species is a monoculture, not diversity.
        plant_and_verify(&env, &client, 1, OAK, 10_000);

        assert_eq!(client.get_species_count(&1), 1);
        assert_eq!(client.get_verified_tree_count(&1), 10_000);
        assert_eq!(client.get_diversity_score(&1), 0);
        assert_eq!(client.get_tier(&1), BiodiversityTier::Low);
    }

    #[test]
    fn test_score_saturates_at_twelve_evenly_planted_species() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        for species in FULL_DIVERSITY {
            plant_and_verify(&env, &client, 1, species, 100);
        }

        assert_eq!(client.get_species_count(&1), 12);
        assert_eq!(client.get_verified_tree_count(&1), 1_200);
        assert_eq!(client.get_diversity_score(&1), 10_000);
        assert_eq!(client.get_tier(&1), BiodiversityTier::High);
    }

    #[test]
    fn test_score_saturates_beyond_twelve_species() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // The coverage ramp stops at 12 species, so 20 evenly planted species
        // score exactly the same as 12.
        for species_name in LIMIT_SPECIES.iter().take(20) {
            let name = String::from_str(&env, species_name);
            let reporter = Address::generate(&env);
            let planting_id = client.record_planting(&1, &name, &100, &reporter);
            client.verify_planting(&1, &planting_id);
        }

        assert_eq!(client.get_species_count(&1), 20);
        assert_eq!(client.get_diversity_score(&1), 10_000);
    }

    #[test]
    fn test_score_penalises_dominant_species() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Twelve species, but 110 of the 120 trees are oak.
        plant_and_verify(&env, &client, 1, OAK, 110);
        for species in FULL_DIVERSITY.iter().skip(1) {
            plant_and_verify(&env, &client, 1, species, 1);
        }

        // Full coverage (12 species) but poor evenness.  Simpson diversity is
        // A / T = 110*109 / (120*119) = 11990/14280, and normalising it against
        // its own maximum, (1 - D) / (1 - 1/12) = 0.160364 / 0.916667, gives an
        // evenness of 1749 out of 10_000.
        assert_eq!(client.get_species_count(&1), 12);
        let score = client.get_diversity_score(&1);
        assert_eq!(score, 1_900);
        assert_eq!(client.get_tier(&1), BiodiversityTier::Low);
    }

    #[test]
    fn test_score_penalises_uneven_species_distribution() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Two species in a 3:1 split over 400 trees: A = 300*299 + 100*99 =
        // 99_600 and T = 400*399 = 159_600, so the evenness factor is
        // (1 - 99_600/159_600) / (1 - 1/2) = 7_518.  Combined with a coverage
        // of 2/12 that gives 1_252, well below the 1_666 an even 50/50 split
        // earns.
        plant_and_verify(&env, &client, 1, OAK, 300);
        plant_and_verify(&env, &client, 1, PINE, 100);

        assert_eq!(client.get_diversity_score(&1), 1_252);
    }

    #[test]
    fn test_score_penalises_evenness_independently_of_coverage() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        // Twelve species in equal proportion: coverage and evenness both maxed.
        client.register_campaign(&1);
        for species in FULL_DIVERSITY {
            plant_and_verify(&env, &client, 1, species, 100);
        }
        assert_eq!(client.get_diversity_score(&1), 10_000);

        // The same twelve species, but concentrated in one of them: coverage is
        // unchanged and only the evenness factor drops.
        client.register_campaign(&2);
        plant_and_verify(&env, &client, 2, OAK, 1_090);
        for species in FULL_DIVERSITY.iter().skip(1) {
            plant_and_verify(&env, &client, 2, species, 10);
        }
        assert_eq!(client.get_species_count(&2), 12);
        assert_eq!(client.get_diversity_score(&2), 1_901);
    }

    #[test]
    fn test_score_grows_monotonically_with_added_species() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Adding species never lowers the score.  It is not strictly
        // increasing at the first step: a lone species is a monoculture and
        // correctly scores zero.
        let mut previous = 0;
        for species in FULL_DIVERSITY {
            plant_and_verify(&env, &client, 1, species, 100);
            let score = client.get_diversity_score(&1);
            assert!(
                score >= previous,
                "score should not fall as species are added: {previous} -> {score}"
            );
            previous = score;
        }
        assert_eq!(previous, 10_000);
    }

    #[test]
    fn test_tier_boundaries() {
        // TIER_MEDIUM_MIN is 2_500 and TIER_HIGH_MIN is 7_500; the bands are
        // inclusive of their lower bound.
        assert_eq!(
            CampaignDiversityContract::tier_for_score(0),
            BiodiversityTier::Low
        );
        assert_eq!(
            CampaignDiversityContract::tier_for_score(2_499),
            BiodiversityTier::Low
        );
        assert_eq!(
            CampaignDiversityContract::tier_for_score(2_500),
            BiodiversityTier::Medium
        );
        assert_eq!(
            CampaignDiversityContract::tier_for_score(7_499),
            BiodiversityTier::Medium
        );
        assert_eq!(
            CampaignDiversityContract::tier_for_score(7_500),
            BiodiversityTier::High
        );
        assert_eq!(
            CampaignDiversityContract::tier_for_score(10_000),
            BiodiversityTier::High
        );
    }

    #[test]
    fn test_tier_tracks_the_stored_score() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Nine balanced species: coverage 7_500, so the planting lands exactly
        // on the lower bound of the high band.
        for species in FULL_DIVERSITY.iter().take(9) {
            plant_and_verify(&env, &client, 1, species, 100);
        }

        let campaign = client.get_campaign(&1);
        assert_eq!(campaign.diversity_score, 7_500);
        assert_eq!(campaign.tier, BiodiversityTier::High);
        assert_eq!(client.get_tier(&1), BiodiversityTier::High);
    }

    // -----------------------------------------------------------------------
    // Carbon credit screening
    // -----------------------------------------------------------------------

    #[test]
    fn test_carbon_credit_requires_trees_and_score() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        assert!(!client.is_carbon_credit_eligible(&1));

        // 12 balanced species but only 600 verified trees: below the 1_000
        // tree floor, so not eligible despite a perfect score.
        for species in FULL_DIVERSITY {
            plant_and_verify(&env, &client, 1, species, 50);
        }
        assert_eq!(client.get_diversity_score(&1), 10_000);
        assert_eq!(client.get_verified_tree_count(&1), 600);
        assert!(!client.is_carbon_credit_eligible(&1));

        // Crossing the tree floor makes it eligible.
        plant_and_verify(&env, &client, 1, "Willow", 400);
        assert_eq!(client.get_verified_tree_count(&1), 1_000);
        assert!(client.is_carbon_credit_eligible(&1));
    }

    #[test]
    fn test_carbon_credit_rejects_large_monoculture() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        // Volume alone does not buy eligibility.
        plant_and_verify(&env, &client, 1, OAK, 500_000);
        assert_eq!(client.get_verified_tree_count(&1), 500_000);
        assert!(!client.is_carbon_credit_eligible(&1));
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    #[test]
    fn test_register_campaign_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, registrar) = setup_contract(&env);

        client.register_campaign(&1);
        let events = env.events().all();
        let expected = CampaignRegisteredEvent {
            campaign_id: 1,
            registrar: registrar.clone(),
            registered_at: 1_000,
        }
        .to_xdr(&env, &contract_id);
        assert!(
            events.events().contains(&expected),
            "expected a CampaignRegisteredEvent for campaign 1"
        );
    }

    #[test]
    fn test_verify_planting_emits_score_update_event() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (contract_id, client, _, _) = setup_contract(&env);

        client.register_campaign(&1);
        let reporter = Address::generate(&env);
        let first = client.record_planting(&1, &String::from_str(&env, OAK), &50, &reporter);
        let second = client.record_planting(&1, &String::from_str(&env, PINE), &50, &reporter);
        client.verify_planting(&1, &first);

        set_time(&env, 1_500);
        client.verify_planting(&1, &second);

        // env.events() reflects only the last external call.
        let events = env.events().all();
        let expected = DiversityScoreUpdatedEvent {
            campaign_id: 1,
            previous_score: 0,
            new_score: 1_666,
            species_count: 2,
            tree_count: 100,
            tier: BiodiversityTier::Low,
        }
        .to_xdr(&env, &contract_id);
        assert!(
            events.events().contains(&expected),
            "expected a DiversityScoreUpdatedEvent"
        );
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_admin() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let new_admin = Address::generate(&env);
        client.set_admin(&new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }

    #[test]
    fn test_set_registrar() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let new_registrar = Address::generate(&env);
        client.set_registrar(&new_registrar);
        assert_eq!(client.get_registrar(), new_registrar);
    }

    #[test]
    fn test_queries_before_initialize_are_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CampaignDiversityContract, ());
        let client = CampaignDiversityContractClient::new(&env, &contract_id);

        assert_eq!(client.get_campaign_count(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_get_admin_before_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CampaignDiversityContract, ());
        let client = CampaignDiversityContractClient::new(&env, &contract_id);

        client.get_admin();
    }
}

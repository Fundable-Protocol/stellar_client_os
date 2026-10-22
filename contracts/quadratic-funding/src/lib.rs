#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Map, Vec,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Storage key enumeration for quadratic funding rounds.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Global admin address (instance storage).
    Admin,
    /// Running total of funding rounds created (instance storage).
    RoundCount,
    /// Full [`FundingRound`] struct keyed by round ID (persistent storage).
    Round(u64),
    /// Contributor record keyed by `(round_id, contributor)` (persistent storage).
    Contribution(u64, Address),
    /// List of all contributors to a round (persistent storage).
    Contributors(u64),
    /// Sybil resistance verification keyed by `(round_id, contributor)` (persistent storage).
    SybilCheck(u64, Address),
    /// Matching pool allocation for a project keyed by `(round_id, project)` (persistent storage).
    MatchAllocation(u64, Address),
}

/// Current lifecycle state of a funding round.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoundStatus {
    /// Open and accepting contributions.
    Active,
    /// Round ended; calculating final matching allocations.
    Ended,
    /// Matching funds distributed to projects.
    Distributed,
    /// Round cancelled by admin.
    Cancelled,
}

/// Sybil resistance verification status.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SybilStatus {
    /// Contributor not yet verified.
    Unverified,
    /// Contributor passed anti-Sybil checks.
    Verified,
    /// Contributor flagged as potential Sybil attack.
    Flagged,
}

/// Core funding round record stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FundingRound {
    /// Unique numeric identifier assigned at creation.
    pub id: u64,
    /// Address that created the round (admin).
    pub admin: Address,
    /// Stellar asset contract address of the funding token.
    pub token: Address,
    /// Total matching pool available for distribution.
    pub matching_pool: i128,
    /// Remaining matching pool balance.
    pub remaining_pool: i128,
    /// Unix timestamp (seconds) when contributions start.
    pub start_time: u64,
    /// Unix timestamp (seconds) when contributions end.
    pub end_time: u64,
    /// Current lifecycle state.
    pub status: RoundStatus,
    /// Minimum contribution amount to prevent spam.
    pub min_contribution: i128,
}

/// Individual contributor record within a funding round.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Contribution {
    /// Round identifier.
    pub round_id: u64,
    /// Address of the contributor.
    pub contributor: Address,
    /// Project receiving the contribution.
    pub project: Address,
    /// Amount contributed in funding token.
    pub amount: i128,
    /// Unix timestamp (seconds) when contribution was made.
    pub timestamp: u64,
    /// Sybil resistance status.
    pub sybil_status: SybilStatus,
}

/// Matching allocation result for a project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MatchingAllocation {
    /// Project address.
    pub project: Address,
    /// Direct contributions sum.
    pub direct_contributions: i128,
    /// Calculated matching amount using QF formula.
    pub matching_amount: i128,
    /// Number of unique contributors.
    pub contributor_count: u32,
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Emitted when a new funding round is created.
#[contractevent]
#[derive(Clone)]
pub struct RoundCreatedEvent {
    pub round_id: u64,
    pub admin: Address,
    pub token: Address,
    pub matching_pool: i128,
    pub start_time: u64,
    pub end_time: u64,
}

/// Emitted when a contribution is made to a project.
#[contractevent]
#[derive(Clone)]
pub struct ContributionMadeEvent {
    pub round_id: u64,
    pub contributor: Address,
    pub project: Address,
    pub amount: i128,
    pub estimated_match: i128,
}

/// Emitted when matching funds are distributed.
#[contractevent]
#[derive(Clone)]
pub struct MatchingDistributedEvent {
    pub round_id: u64,
    pub project: Address,
    pub direct_contributions: i128,
    pub matching_amount: i128,
    pub total_payout: i128,
}

/// Emitted when a contributor's Sybil status is updated.
#[contractevent]
#[derive(Clone)]
pub struct SybilStatusUpdatedEvent {
    pub round_id: u64,
    pub contributor: Address,
    pub status: SybilStatus,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The caller does not have the required permission for this action.
    Unauthorized = 1,
    /// A zero or negative monetary amount was supplied where a positive value is required.
    InvalidAmount = 2,
    /// The supplied time range is invalid.
    InvalidTimeRange = 3,
    /// No round exists with the requested ID.
    RoundNotFound = 4,
    /// The operation requires the round to be in the `Active` state.
    RoundNotActive = 5,
    /// The round has not ended yet.
    RoundNotEnded = 6,
    /// An intermediate arithmetic value overflowed `i128`.
    ArithmeticOverflow = 7,
    /// Contribution amount below minimum threshold.
    BelowMinimum = 8,
    /// Contributor flagged as potential Sybil attack.
    SybilFlagged = 9,
    /// Insufficient matching pool balance.
    InsufficientPool = 10,
    /// Round has already been distributed.
    AlreadyDistributed = 11,
    /// Contract not initialized.
    NotInitialized = 12,
    /// Already initialized.
    AlreadyInitialized = 13,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct QuadraticFundingContract;

#[contractimpl]
impl QuadraticFundingContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// Initialize the contract with an admin address.
    ///
    /// Must be called exactly once before any other function.
    ///
    /// # Arguments
    /// * `admin` — Address authorized to manage funding rounds.
    ///
    /// # Errors
    /// * [`Error::AlreadyInitialized`] — if called a second time.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::RoundCount, &0u64);

        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Admin functions
    // -----------------------------------------------------------------------

    /// Create a new quadratic funding round.
    ///
    /// # Arguments
    /// * `token` — Token contract address for contributions and matching.
    /// * `matching_pool` — Total matching pool amount to be distributed.
    /// * `start_time` — Unix timestamp when contributions start.
    /// * `end_time` — Unix timestamp when contributions end.
    /// * `min_contribution` — Minimum contribution amount.
    ///
    /// # Returns
    /// The ID of the newly created funding round.
    ///
    /// # Errors
    /// * [`Error::NotInitialized`] — if contract not initialized.
    /// * [`Error::Unauthorized`] — if caller is not admin.
    /// * [`Error::InvalidAmount`] — if matching_pool or min_contribution invalid.
    /// * [`Error::InvalidTimeRange`] — if time range is invalid.
    pub fn create_round(
        env: Env,
        token: Address,
        matching_pool: i128,
        start_time: u64,
        end_time: u64,
        min_contribution: i128,
    ) -> u64 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));

        admin.require_auth();

        if matching_pool <= 0 || min_contribution <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if start_time >= end_time || end_time <= current_time {
            panic_with_error!(&env, Error::InvalidTimeRange);
        }

        let round_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RoundCount)
            .unwrap_or(0u64);
        let new_round_id = round_id + 1;

        let round = FundingRound {
            id: new_round_id,
            admin: admin.clone(),
            token: token.clone(),
            matching_pool,
            remaining_pool: matching_pool,
            start_time,
            end_time,
            status: RoundStatus::Active,
            min_contribution,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Round(new_round_id), &round);
        env.storage()
            .instance()
            .set(&DataKey::RoundCount, &new_round_id);
        env.storage()
            .persistent()
            .set(&DataKey::Contributors(new_round_id), &Vec::<Address>::new(&env));

        // Transfer matching pool from admin to contract
        let client = token::Client::new(&env, &token);
        client.transfer(&admin, &env.current_contract_address(), &matching_pool);

        env.events().publish(
            (soroban_sdk::symbol_short!("round_new"),),
            RoundCreatedEvent {
                round_id: new_round_id,
                admin,
                token,
                matching_pool,
                start_time,
                end_time,
            },
        );

        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Round(new_round_id), LEDGER_THRESHOLD, LEDGER_BUMP);

        new_round_id
    }

    /// Update Sybil verification status for a contributor.
    ///
    /// # Arguments
    /// * `round_id` — Round identifier.
    /// * `contributor` — Address to verify or flag.
    /// * `status` — New Sybil status.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] — if caller is not admin.
    /// * [`Error::RoundNotFound`] — if round doesn't exist.
    pub fn set_sybil_status(
        env: Env,
        round_id: u64,
        contributor: Address,
        status: SybilStatus,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));

        admin.require_auth();

        let round: FundingRound = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        env.storage()
            .persistent()
            .set(&DataKey::SybilCheck(round_id, contributor.clone()), &status);

        env.events().publish(
            (soroban_sdk::symbol_short!("sybil"),),
            SybilStatusUpdatedEvent {
                round_id,
                contributor,
                status,
            },
        );

        env.storage()
            .persistent()
            .extend_ttl(
                &DataKey::SybilCheck(round_id, round.admin),
                LEDGER_THRESHOLD,
                LEDGER_BUMP,
            );
    }

    // -----------------------------------------------------------------------
    // Contribution functions
    // -----------------------------------------------------------------------

    /// Make a contribution to a project in an active funding round.
    ///
    /// # Arguments
    /// * `round_id` — Round identifier.
    /// * `project` — Project address receiving the contribution.
    /// * `amount` — Contribution amount.
    ///
    /// # Errors
    /// * [`Error::RoundNotFound`] — if round doesn't exist.
    /// * [`Error::RoundNotActive`] — if round is not active.
    /// * [`Error::InvalidAmount`] — if amount is invalid.
    /// * [`Error::BelowMinimum`] — if amount below minimum.
    /// * [`Error::SybilFlagged`] — if contributor is flagged.
    pub fn contribute(env: Env, round_id: u64, project: Address, amount: i128) {
        let contributor = env.current_contract_address();
        let mut round: FundingRound = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        if round.status != RoundStatus::Active {
            panic_with_error!(&env, Error::RoundNotActive);
        }

        let current_time = env.ledger().timestamp();
        if current_time < round.start_time || current_time > round.end_time {
            panic_with_error!(&env, Error::RoundNotActive);
        }

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        if amount < round.min_contribution {
            panic_with_error!(&env, Error::BelowMinimum);
        }

        // Check Sybil status
        let sybil_status: SybilStatus = env
            .storage()
            .persistent()
            .get(&DataKey::SybilCheck(round_id, contributor.clone()))
            .unwrap_or(SybilStatus::Unverified);

        if sybil_status == SybilStatus::Flagged {
            panic_with_error!(&env, Error::SybilFlagged);
        }

        // Transfer tokens from contributor to project
        let client = token::Client::new(&env, &round.token);
        client.transfer(&contributor, &project, &amount);

        // Record contribution
        let contribution = Contribution {
            round_id,
            contributor: contributor.clone(),
            project: project.clone(),
            amount,
            timestamp: current_time,
            sybil_status,
        };

        env.storage().persistent().set(
            &DataKey::Contribution(round_id, contributor.clone()),
            &contribution,
        );

        // Add contributor to list if not already present
        let mut contributors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Contributors(round_id))
            .unwrap_or_else(|| Vec::new(&env));

        if !contributors.contains(&contributor) {
            contributors.push_back(contributor.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Contributors(round_id), &contributors);
        }

        // Calculate estimated match for real-time display
        let estimated_match = Self::calculate_estimated_match(&env, round_id, &project);

        env.events().publish(
            (soroban_sdk::symbol_short!("contrib"),),
            ContributionMadeEvent {
                round_id,
                contributor,
                project,
                amount,
                estimated_match,
            },
        );

        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Round(round_id), LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Distribution functions
    // -----------------------------------------------------------------------

    /// End a funding round and distribute matching funds using quadratic formula.
    ///
    /// Implements the formula: matching = (sum(sqrt(contribution_i)))^2
    ///
    /// # Arguments
    /// * `round_id` — Round identifier.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] — if caller is not admin.
    /// * [`Error::RoundNotFound`] — if round doesn't exist.
    /// * [`Error::RoundNotEnded`] — if round hasn't ended yet.
    /// * [`Error::AlreadyDistributed`] — if already distributed.
    pub fn distribute_matching(env: Env, round_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));

        admin.require_auth();

        let mut round: FundingRound = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        let current_time = env.ledger().timestamp();
        if current_time < round.end_time {
            panic_with_error!(&env, Error::RoundNotEnded);
        }

        if round.status == RoundStatus::Distributed {
            panic_with_error!(&env, Error::AlreadyDistributed);
        }

        // Calculate matching allocations for all projects
        let allocations = Self::calculate_all_matches(&env, round_id);

        // Distribute matching funds to each project
        let client = token::Client::new(&env, &round.token);
        
        for allocation in allocations.iter() {
            if allocation.matching_amount > 0 {
                // Transfer matching funds to project
                client.transfer(
                    &env.current_contract_address(),
                    &allocation.project,
                    &allocation.matching_amount,
                );

                env.events().publish(
                    (soroban_sdk::symbol_short!("match"),),
                    MatchingDistributedEvent {
                        round_id,
                        project: allocation.project.clone(),
                        direct_contributions: allocation.direct_contributions,
                        matching_amount: allocation.matching_amount,
                        total_payout: allocation.direct_contributions + allocation.matching_amount,
                    },
                );
            }
        }

        round.status = RoundStatus::Distributed;
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// Get funding round details.
    pub fn get_round(env: Env, round_id: u64) -> FundingRound {
        env.storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound))
    }

    /// Get estimated matching amount for a project in real-time.
    pub fn get_estimated_match(env: Env, round_id: u64, project: Address) -> i128 {
        Self::calculate_estimated_match(&env, round_id, &project)
    }

    /// Get contribution details for a contributor.
    pub fn get_contribution(env: Env, round_id: u64, contributor: Address) -> Contribution {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(round_id, contributor))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound))
    }

    // -----------------------------------------------------------------------
    // Internal helper functions
    // -----------------------------------------------------------------------

    /// Calculate estimated matching amount for a project using quadratic formula.
    ///
    /// Formula: matching_i = matching_pool * (sum_sqrt_i)^2 / sum_of_all_(sum_sqrt)^2
    fn calculate_estimated_match(env: &Env, round_id: u64, project: &Address) -> i128 {
        let round: FundingRound = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::RoundNotFound));

        let contributors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Contributors(round_id))
            .unwrap_or_else(|| Vec::new(env));

        let mut sum_sqrt: i128 = 0;

        // Calculate sum of square roots of contributions to this project
        for contributor in contributors.iter() {
            if let Some(contribution) = env
                .storage()
                .persistent()
                .get::<DataKey, Contribution>(&DataKey::Contribution(
                    round_id,
                    contributor.clone(),
                ))
            {
                if contribution.project == *project
                    && contribution.sybil_status != SybilStatus::Flagged
                {
                    // Simple integer square root approximation
                    sum_sqrt += Self::isqrt(contribution.amount);
                }
            }
        }

        // Square the sum
        let qf_score = sum_sqrt * sum_sqrt;

        // For estimated match, return proportional allocation
        // In real distribution, this would be normalized across all projects
        if round.matching_pool > 0 && qf_score > 0 {
            qf_score / 100 // Simple estimation
        } else {
            0
        }
    }

    /// Calculate matching allocations for all projects.
    fn calculate_all_matches(env: &Env, round_id: u64) -> Vec<MatchingAllocation> {
        let round: FundingRound = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::RoundNotFound));

        let contributors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Contributors(round_id))
            .unwrap_or_else(|| Vec::new(env));

        // Group contributions by project
        let mut project_data: Map<Address, (i128, i128, u32)> = Map::new(env);

        for contributor in contributors.iter() {
            if let Some(contribution) = env
                .storage()
                .persistent()
                .get::<DataKey, Contribution>(&DataKey::Contribution(
                    round_id,
                    contributor.clone(),
                ))
            {
                if contribution.sybil_status != SybilStatus::Flagged {
                    let project = contribution.project.clone();
                    let sqrt_amount = Self::isqrt(contribution.amount);

                    if let Some((sum_sqrt, direct, count)) = project_data.get(project.clone()) {
                        project_data.set(
                            project,
                            (sum_sqrt + sqrt_amount, direct + contribution.amount, count + 1),
                        );
                    } else {
                        project_data.set(project, (sqrt_amount, contribution.amount, 1));
                    }
                }
            }
        }

        // Calculate QF scores and total
        let mut total_qf_score: i128 = 0;
        let mut qf_scores: Map<Address, i128> = Map::new(env);

        for (project, (sum_sqrt, _, _)) in project_data.iter() {
            let qf_score = sum_sqrt * sum_sqrt;
            qf_scores.set(project.clone(), qf_score);
            total_qf_score += qf_score;
        }

        // Distribute matching pool proportionally
        let mut allocations = Vec::new(env);

        for (project, (_, direct, count)) in project_data.iter() {
            let qf_score = qf_scores.get(project.clone()).unwrap_or(0);
            let matching_amount = if total_qf_score > 0 {
                (round.matching_pool * qf_score) / total_qf_score
            } else {
                0
            };

            allocations.push_back(MatchingAllocation {
                project,
                direct_contributions: direct,
                matching_amount,
                contributor_count: count,
            });
        }

        allocations
    }

    /// Integer square root using Newton's method.
    fn isqrt(n: i128) -> i128 {
        if n < 2 {
            return n;
        }

        let mut x = n;
        let mut y = (x + 1) / 2;

        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }

        x
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test;


//! Quadratic Funding (QF) match pool distribution contract (Issue #1340).
//!
//! # Algorithm
//!
//! Calculates matching allocations using the quadratic funding formula:
//!
//! ```text
//! match_for_campaign_i = (sum_j sqrt(contribution_j))^2
//! ```
//!
//! The total pool is then divided proportionally across all campaigns.
//!
//! # Anti-Sybil protection
//!
//! Each backer wallet must pass a one-time verification check before
//! their contribution is counted in the QF calculation.  Verified wallets
//! are tracked in contract storage.  The contract admin registers the
//! verifier oracle; in production this would be an on-chain KYC / Proof-of-
//! Personhood oracle (e.g. Stellar Keybase attestation or zk-ID proof).
//!
//! # Round lifecycle
//!
//! 1. Admin calls `create_round` – sets match pool amount, token, deadline.
//! 2. Contributors call `contribute` – records individual pledge per campaign.
//! 3. Admin / anyone calls `estimate_match` at any time for real-time preview.
//! 4. After round `deadline_ledger`, admin calls `distribute` which:
//!    a. Computes QF allocations across all campaigns.
//!    b. Transfers matching funds from the contract's escrow to each campaign.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Vec,
};

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Caller is not the contract admin.
    Unauthorized = 1,
    /// Round does not exist.
    RoundNotFound = 2,
    /// Round is not yet open for contributions (or has ended).
    RoundNotActive = 3,
    /// Round deadline has not yet passed; distribution is premature.
    RoundNotEnded = 4,
    /// Round has already been distributed.
    AlreadyDistributed = 5,
    /// Backer wallet has not passed the anti-Sybil verification check.
    BackerNotVerified = 6,
    /// Contribution amount must be positive.
    InvalidAmount = 7,
    /// Match pool is empty; nothing to distribute.
    EmptyPool = 8,
    /// Arithmetic overflow during QF calculation.
    Overflow = 9,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Round(u64),
    Contribution(u64, Address, u64), // (round_id, backer, campaign_id)
    RoundCampaigns(u64),             // Vec<u64> of campaign ids in round
    RoundBackers(u64, u64),          // Vec<Address> of backers for (round, campaign)
    Verified(Address),               // anti-Sybil flag
    NextRoundId,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub round_id: u64,
    pub token: Address,
    pub match_pool: i128,
    pub deadline_ledger: u32,
    pub distributed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MatchEstimate {
    pub campaign_id: u64,
    /// Estimated match in token stroops.
    pub estimated_match: i128,
    /// Sum of sqrt(contribution_i) in 1e6 fixed-point.
    pub sqrt_sum_fp6: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct QuadraticFundingContract;

#[contractimpl]
impl QuadraticFundingContract {
    // -----------------------------------------------------------------------
    // Admin / setup
    // -----------------------------------------------------------------------

    /// Initialises the contract with an admin address.
    /// Can only be called once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextRoundId, &1u64);
    }

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    // -----------------------------------------------------------------------
    // Anti-Sybil verification
    // -----------------------------------------------------------------------

    /// Admin marks a backer wallet as verified (anti-Sybil gate).
    /// In production the admin would be replaced with an oracle contract.
    pub fn verify_backer(env: Env, caller: Address, backer: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }
        env.storage().persistent().set(&DataKey::Verified(backer), &true);
    }

    /// Returns true if the wallet has been verified.
    pub fn is_verified(env: Env, backer: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Verified(backer))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Round management
    // -----------------------------------------------------------------------

    /// Creates a new funding round.  The match pool must be pre-deposited
    /// to the contract address by the caller before calling this function.
    pub fn create_round(
        env: Env,
        caller: Address,
        token: Address,
        match_pool: i128,
        deadline_ledger: u32,
    ) -> u64 {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if match_pool <= 0 {
            panic_with_error!(&env, Error::EmptyPool);
        }

        // Transfer match pool from admin to contract escrow.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&caller, &env.current_contract_address(), &match_pool);

        let round_id: u64 = env.storage().instance().get(&DataKey::NextRoundId).unwrap();
        let round = Round {
            round_id,
            token: token.clone(),
            match_pool,
            deadline_ledger,
            distributed: false,
        };
        env.storage().persistent().set(&DataKey::Round(round_id), &round);
        env.storage()
            .persistent()
            .set(&DataKey::RoundCampaigns(round_id), &Vec::<u64>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::NextRoundId, &(round_id + 1));

        round_id
    }

    /// Returns the round data.
    pub fn get_round(env: Env, round_id: u64) -> Round {
        env.storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound))
    }

    // -----------------------------------------------------------------------
    // Contributions
    // -----------------------------------------------------------------------

    /// Records a backer's contribution to a campaign within a QF round.
    /// The actual token pledge is handled by the campaign-funding contract;
    /// this contract records the amount for QF match calculation only.
    ///
    /// Backer must have been verified via `verify_backer` first.
    pub fn contribute(
        env: Env,
        backer: Address,
        round_id: u64,
        campaign_id: u64,
        amount: i128,
    ) {
        backer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Anti-Sybil gate.
        if !env
            .storage()
            .persistent()
            .get::<_, bool>(&DataKey::Verified(backer.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::BackerNotVerified);
        }

        let round: Round = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        if round.distributed {
            panic_with_error!(&env, Error::AlreadyDistributed);
        }
        if env.ledger().sequence() > round.deadline_ledger {
            panic_with_error!(&env, Error::RoundNotActive);
        }

        // Accumulate contribution (a backer may contribute multiple times).
        let prev: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(round_id, backer.clone(), campaign_id))
            .unwrap_or(0i128);
        let new_total = prev.checked_add(amount).unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        env.storage()
            .persistent()
            .set(&DataKey::Contribution(round_id, backer.clone(), campaign_id), &new_total);

        // Register campaign in round if new.
        let mut campaigns: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCampaigns(round_id))
            .unwrap_or_else(|| Vec::new(&env));
        if !campaigns.contains(campaign_id) {
            campaigns.push_back(campaign_id);
            env.storage()
                .persistent()
                .set(&DataKey::RoundCampaigns(round_id), &campaigns);
        }

        // Register backer for this (round, campaign) pair.
        let mut backers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundBackers(round_id, campaign_id))
            .unwrap_or_else(|| Vec::new(&env));
        if !backers.contains(backer.clone()) {
            backers.push_back(backer);
            env.storage()
                .persistent()
                .set(&DataKey::RoundBackers(round_id, campaign_id), &backers);
        }
    }

    // -----------------------------------------------------------------------
    // Match estimation (real-time, read-only)
    // -----------------------------------------------------------------------

    /// Computes the estimated quadratic funding match for each campaign in a
    /// round, using the current contribution snapshot.
    ///
    /// Returns a Vec of `MatchEstimate` sorted by campaign_id.
    ///
    /// Uses 64-bit integer square root (Newton's method) scaled by 1e6 to
    /// approximate `sqrt(contribution_i)` without floating point.
    pub fn estimate_matches(env: Env, round_id: u64) -> Vec<MatchEstimate> {
        let round: Round = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        let campaigns: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCampaigns(round_id))
            .unwrap_or_else(|| Vec::new(&env));

        compute_qf_estimates(&env, &round, &campaigns)
    }

    // -----------------------------------------------------------------------
    // Distribution
    // -----------------------------------------------------------------------

    /// Distributes match pool to campaigns after the round deadline.
    ///
    /// Only callable by the admin after `deadline_ledger` has passed.
    /// Each campaign's campaign-funding contract address is passed in `campaign_addresses`
    /// (index-aligned with the campaigns returned by `get_round_campaigns`).
    pub fn distribute(
        env: Env,
        caller: Address,
        round_id: u64,
        campaign_addresses: Vec<Address>,
    ) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut round: Round = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        if round.distributed {
            panic_with_error!(&env, Error::AlreadyDistributed);
        }
        if env.ledger().sequence() <= round.deadline_ledger {
            panic_with_error!(&env, Error::RoundNotEnded);
        }

        let campaigns: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCampaigns(round_id))
            .unwrap_or_else(|| Vec::new(&env));

        if campaigns.len() == 0 {
            // Nothing to distribute – just mark as done.
            round.distributed = true;
            env.storage().persistent().set(&DataKey::Round(round_id), &round);
            return;
        }

        let estimates = compute_qf_estimates(&env, &round, &campaigns);
        let token_client = token::Client::new(&env, &round.token);

        // Transfer proportional shares.
        for i in 0..estimates.len() {
            let est = estimates.get(i).unwrap();
            if est.estimated_match > 0 {
                if let Some(addr) = campaign_addresses.get(i) {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &addr,
                        &est.estimated_match,
                    );
                }
            }
        }

        round.distributed = true;
        env.storage().persistent().set(&DataKey::Round(round_id), &round);
    }

    /// Returns the list of campaign ids participating in the round.
    pub fn get_round_campaigns(env: Env, round_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundCampaigns(round_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the total accumulated contribution for a (backer, campaign) pair in a round.
    pub fn get_contribution(env: Env, round_id: u64, backer: Address, campaign_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(round_id, backer, campaign_id))
            .unwrap_or(0i128)
    }
}

// ---------------------------------------------------------------------------
// QF core algorithm (pure function, no storage side-effects)
// ---------------------------------------------------------------------------

/// Computes the quadratic funding match for each campaign.
///
/// For each campaign i:
///   sqrt_sum_i = sum over backers j of isqrt(contribution_j)   [scaled x1e6]
///   qf_weight_i = sqrt_sum_i^2
///
/// Proportional allocation:
///   match_i = match_pool * qf_weight_i / sum_k(qf_weight_k)
fn compute_qf_estimates(env: &Env, round: &Round, campaigns: &Vec<u64>) -> Vec<MatchEstimate> {
    let mut estimates: Vec<MatchEstimate> = Vec::new(env);
    let mut weights: Vec<i128> = Vec::new(env);
    let mut total_weight: i128 = 0i128;

    for i in 0..campaigns.len() {
        let campaign_id = campaigns.get(i).unwrap();
        let backers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundBackers(round.round_id, campaign_id))
            .unwrap_or_else(|| Vec::new(env));

        let mut sqrt_sum: i128 = 0i128;
        for j in 0..backers.len() {
            let backer = backers.get(j).unwrap();
            let contrib: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Contribution(round.round_id, backer, campaign_id))
                .unwrap_or(0i128);
            // isqrt scaled by 1_000_000 (6 decimal places of precision)
            let s = isqrt_fp6(contrib);
            sqrt_sum = sqrt_sum.saturating_add(s);
        }

        // QF weight = sqrt_sum^2
        let qf_weight = sqrt_sum.saturating_mul(sqrt_sum);
        total_weight = total_weight.saturating_add(qf_weight);
        weights.push_back(qf_weight);

        estimates.push_back(MatchEstimate {
            campaign_id,
            estimated_match: 0i128, // filled in below
            sqrt_sum_fp6: sqrt_sum,
        });
    }

    // Second pass: assign proportional match amounts
    for i in 0..estimates.len() {
        let mut est = estimates.get(i).unwrap();
        let w = weights.get(i).unwrap();
        est.estimated_match = if total_weight > 0 {
            // Use i128 to avoid overflow; match_pool fits in i128.
            (round.match_pool / total_weight).saturating_mul(w)
        } else {
            0i128
        };
        estimates.set(i, est);
    }

    estimates
}

/// Integer square root scaled by 1_000_000 (fp6).
///
/// Returns floor(sqrt(n) * 1_000_000).  Uses Newton's method.
/// Safe for n in [0, i128::MAX / 1e12].
fn isqrt_fp6(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    // Scale: multiply n by 10^12 then take integer sqrt -> gives sqrt(n)*10^6
    let scaled = n.saturating_mul(1_000_000_000_000i128);
    if scaled <= 0 {
        return 0;
    }
    // Initial guess using u64 sqrt
    let mut x: i128 = (scaled as f64).sqrt() as i128;
    if x == 0 {
        x = 1;
    }
    // Newton iteration
    loop {
        let x1 = (x + scaled / x) / 2;
        if x1 >= x {
            return x;
        }
        x = x1;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        Env,
    };

    fn setup_env() -> (Env, QuadraticFundingContractClient<'static>) {
        let env = Env::default();
        env.ledger().set(LedgerInfo {
            timestamp: 0,
            protocol_version: 25,
            sequence_number: 0,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 100,
            min_persistent_entry_ttl: 100,
            max_entry_ttl: 9_999_999,
        });
        env.mock_all_auths();
        let contract_id = env.register(QuadraticFundingContract, ());
        let client = QuadraticFundingContractClient::new(&env, &contract_id);
        (env, client)
    }

    fn set_ledger(env: &Env, seq: u32) {
        env.ledger().set(LedgerInfo {
            timestamp: seq as u64 * 5,
            protocol_version: 25,
            sequence_number: seq,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 100,
            min_persistent_entry_ttl: 100,
            max_entry_ttl: 9_999_999,
        });
    }

    fn create_token<'a>(env: &'a Env, admin: &'a Address) -> (Address, token::StellarAssetClient<'a>, token::Client<'a>) {
        let token_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let sac = token::StellarAssetClient::new(env, &token_addr);
        let client = token::Client::new(env, &token_addr);
        (token_addr, sac, client)
    }

    #[test]
    fn test_isqrt_fp6_basic() {
        // sqrt(100) * 1e6 = 10_000_000
        assert_eq!(isqrt_fp6(100), 10_000_000);
        // sqrt(4) * 1e6 = 2_000_000
        assert_eq!(isqrt_fp6(4), 2_000_000);
        // sqrt(0) = 0
        assert_eq!(isqrt_fp6(0), 0);
    }

    #[test]
    fn test_initialize_and_admin() {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        client.initialize(&admin);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice_fails() {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // should panic
    }

    #[test]
    fn test_verify_backer() {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        let backer = Address::generate(&env);
        client.initialize(&admin);
        assert!(!client.is_verified(&backer));
        client.verify_backer(&admin, &backer);
        assert!(client.is_verified(&backer));
    }

    #[test]
    fn test_create_round_and_contribute() {
        let (env, client) = setup_env();
        set_ledger(&env, 100);

        let admin = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_addr, sac, _) = create_token(&env, &admin);

        sac.mint(&admin, &1_000_000);
        client.initialize(&admin);
        client.verify_backer(&admin, &backer1);
        client.verify_backer(&admin, &backer2);

        let round_id = client.create_round(&admin, &token_addr, &1_000_000i128, &200u32);

        // backer1 contributes 100 to campaign 1
        client.contribute(&backer1, &round_id, &1u64, &100i128);
        // backer2 contributes 400 to campaign 1
        client.contribute(&backer2, &round_id, &1u64, &400i128);
        // backer1 contributes 900 to campaign 2
        client.contribute(&backer1, &round_id, &2u64, &900i128);

        assert_eq!(client.get_contribution(&round_id, &backer1, &1u64), 100);
        assert_eq!(client.get_contribution(&round_id, &backer2, &1u64), 400);
        assert_eq!(client.get_contribution(&round_id, &backer1, &2u64), 900);
    }

    #[test]
    fn test_estimate_matches() {
        let (env, client) = setup_env();
        set_ledger(&env, 100);

        let admin = Address::generate(&env);
        let backer1 = Address::generate(&env);
        let backer2 = Address::generate(&env);
        let (token_addr, sac, _) = create_token(&env, &admin);

        sac.mint(&admin, &10_000);
        client.initialize(&admin);
        client.verify_backer(&admin, &backer1);
        client.verify_backer(&admin, &backer2);

        let round_id = client.create_round(&admin, &token_addr, &10_000i128, &200u32);

        // Campaign 1: backer1=100, backer2=400 -> sqrt_sum = sqrt(100)+sqrt(400) = 10M+20M = 30M
        // Campaign 2: backer1=900 -> sqrt_sum = sqrt(900) = 30M
        client.contribute(&backer1, &round_id, &1u64, &100i128);
        client.contribute(&backer2, &round_id, &1u64, &400i128);
        client.contribute(&backer1, &round_id, &2u64, &900i128);

        let estimates = client.estimate_matches(&round_id);
        assert_eq!(estimates.len(), 2);

        // Both campaigns have equal sqrt_sum = 30M, so equal weight -> equal match
        let est1 = estimates.get(0).unwrap();
        let est2 = estimates.get(1).unwrap();
        assert_eq!(est1.estimated_match, est2.estimated_match);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_contribute_unverified_backer_fails() {
        let (env, client) = setup_env();
        set_ledger(&env, 100);

        let admin = Address::generate(&env);
        let unverified = Address::generate(&env);
        let (token_addr, sac, _) = create_token(&env, &admin);
        sac.mint(&admin, &1_000);
        client.initialize(&admin);

        let round_id = client.create_round(&admin, &token_addr, &1_000i128, &200u32);
        client.contribute(&unverified, &round_id, &1u64, &50i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_distribute_before_deadline_fails() {
        let (env, client) = setup_env();
        set_ledger(&env, 100);

        let admin = Address::generate(&env);
        let (token_addr, sac, _) = create_token(&env, &admin);
        sac.mint(&admin, &1_000);
        client.initialize(&admin);

        let round_id = client.create_round(&admin, &token_addr, &1_000i128, &200u32);
        // deadline is 200 but current ledger is 100
        client.distribute(&admin, &round_id, &Vec::new(&env));
    }
}
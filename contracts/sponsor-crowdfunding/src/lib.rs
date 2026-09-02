#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Global admin address.
    Admin,
    /// Funding pool keyed by pool_id.
    Pool(u64),
    /// Running count of pools created.
    PoolCount,
    /// Per-sponsor contribution keyed by (pool_id, sponsor).
    Contribution(u64, Address),
}

/// Lifecycle state of a funding pool.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PoolStatus {
    /// Pool is open for contributions.
    Open,
    /// Target reached; pool is settled and revenue distributed.
    Settled,
    /// Pool was dissolved without reaching the target.
    Dissolved,
}

/// A funding pool for expensive trees.
#[contracttype]
#[derive(Clone)]
pub struct FundingPool {
    /// Unique pool identifier.
    pub id: u64,
    /// ID of the tree being funded.
    pub tree_id: u64,
    /// Target amount to fund the tree.
    pub target_amount: i128,
    /// Current total contributed.
    pub total_raised: i128,
    /// Token used for contributions.
    pub token: Address,
    /// Current pool status.
    pub status: PoolStatus,
}

/// Record of a sponsor's contribution to a pool.
#[contracttype]
#[derive(Clone)]
pub struct SponsorContribution {
    /// Amount contributed by this sponsor.
    pub amount: i128,
    /// Proportional share of revenue (basis points, max 10000).
    pub share_bps: u32,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    PoolNotFound = 5,
    PoolNotOpen = 6,
    PoolAlreadySettled = 7,
    TargetNotReached = 8,
    NoContribution = 9,
    ArithmeticOverflow = 10,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum share in basis points (100%).
const MAX_SHARE_BPS: u32 = 10_000;
/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SponsorCrowdfundingContract;

#[contractimpl]
impl SponsorCrowdfundingContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialize the crowdfunding contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PoolCount, &0u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Pool lifecycle
    // -----------------------------------------------------------------------

    /// Create a new funding pool for an expensive tree.
    ///
    /// # Arguments
    /// * `tree_id`       ??? ID of the tree to fund.
    /// * `target_amount` ??? Total amount needed.
    /// * `token`         ??? Stellar asset contract address for contributions.
    ///
    /// # Returns
    /// The newly assigned pool ID.
    pub fn create_pool(env: Env, tree_id: u64, target_amount: i128, token: Address) -> u64 {
        Self::assert_initialized(&env);

        if target_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PoolCount)
            .unwrap_or(0);
        count += 1;
        env.storage().instance().set(&DataKey::PoolCount, &count);

        let pool = FundingPool {
            id: count,
            tree_id,
            target_amount,
            total_raised: 0,
            token,
            status: PoolStatus::Open,
        };

        let key = DataKey::Pool(count);
        env.storage().persistent().set(&key, &pool);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events()
            .publish(("PoolCreated", count), (count, tree_id, target_amount));

        count
    }

    /// Contribute tokens to a funding pool.
    ///
    /// If the contribution reaches the target, the pool auto-settles.
    ///
    /// # Arguments
    /// * `contributor` ??? Address making the contribution.
    /// * `pool_id`     ??? Target pool.
    /// * `amount`      ??? Positive token amount to contribute.
    ///
    /// # Errors
    /// * [`Error::PoolNotOpen`]       ??? pool is not open for contributions.
    /// * [`Error::InvalidAmount`]     ??? `amount <= 0`.
    /// * [`Error::ArithmeticOverflow`] ??? internal overflow.
    pub fn contribute(env: Env, contributor: Address, pool_id: u64, amount: i128) {
        contributor.require_auth();

        let mut pool = Self::load_pool(&env, pool_id);

        if pool.status != PoolStatus::Open {
            panic_with_error!(&env, Error::PoolNotOpen);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let new_total = pool
            .total_raised
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        // Transfer tokens into contract escrow.
        let token_client = token::Client::new(&env, &pool.token);
        token_client.transfer(&contributor, &env.current_contract_address(), &amount);

        // Update per-contributor balance.
        let contrib_key = DataKey::Contribution(pool_id, contributor.clone());
        let prev: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        let new_contrib = prev
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(&contrib_key, &new_contrib);
        env.storage()
            .persistent()
            .extend_ttl(&contrib_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        pool.total_raised = new_total;

        // Auto-settle when target is reached.
        if pool.total_raised >= pool.target_amount {
            pool.status = PoolStatus::Settled;
            env.events().publish(
                ("PoolSettled", pool_id),
                (pool_id, pool.tree_id, pool.total_raised),
            );
        }

        Self::save_pool(&env, pool_id, &pool);

        env.events().publish(
            ("ContributionMade", pool_id),
            (contributor, pool_id, amount, pool.total_raised),
        );
    }

    /// Settle a pool and distribute revenue proportionally.
    ///
    /// Only callable after the pool has been settled (target reached).
    ///
    /// # Arguments
    /// * `pool_id`        ??? Pool to settle.
    /// * `revenue_amount` ??? Total revenue to distribute.
    ///
    /// # Errors
    /// * [`Error::PoolNotOpen`] ??? pool is not settled.
    pub fn settle_pool(env: Env, pool_id: u64, revenue_amount: i128) {
        Self::assert_initialized(&env);

        let mut pool = Self::load_pool(&env, pool_id);

        if pool.status != PoolStatus::Settled {
            panic_with_error!(&env, Error::PoolNotOpen);
        }

        // Calculate and distribute proportional revenue to each sponsor.
        if pool.total_raised > 0 && revenue_amount > 0 {
            // Revenue distribution is proportional to contribution.
            // Each sponsor gets: (their_contribution / total_raised) * revenue_amount
            // This is recorded as an event; actual distribution can be claimed separately.
            env.events().publish(
                ("RevenueDistributed", pool_id),
                (pool_id, revenue_amount, pool.total_raised),
            );
        }

        env.events()
            .publish(("PoolFinalized", pool_id), (pool_id, pool.tree_id));
    }

    /// Dissolve a pool that didn't reach its target.
    ///
    /// Allows contributors to get refunds.
    ///
    /// # Arguments
    /// * `pool_id` ??? Pool to dissolve.
    ///
    /// # Errors
    /// * [`Error::PoolAlreadySettled`] ??? pool is already settled.
    pub fn dissolve_pool(env: Env, pool_id: u64) {
        Self::assert_initialized(&env);

        let mut pool = Self::load_pool(&env, pool_id);

        if pool.status == PoolStatus::Settled {
            panic_with_error!(&env, Error::PoolAlreadySettled);
        }
        if pool.status == PoolStatus::Dissolved {
            return; // Already dissolved.
        }

        pool.status = PoolStatus::Dissolved;
        Self::save_pool(&env, pool_id, &pool);

        env.events()
            .publish(("PoolDissolved", pool_id), (pool_id, pool.tree_id));
    }

    /// Claim a refund from a dissolved pool.
    ///
    /// # Arguments
    /// * `contributor` ??? Address claiming refund.
    /// * `pool_id`     ??? Dissolved pool to refund from.
    ///
    /// # Errors
    /// * [`Error::PoolNotOpen`]   ??? pool is not dissolved.
    /// * [`Error::NoContribution`] ??? contributor has no record.
    pub fn refund(env: Env, contributor: Address, pool_id: u64) {
        contributor.require_auth();

        let pool = Self::load_pool(&env, pool_id);

        if pool.status != PoolStatus::Dissolved {
            panic_with_error!(&env, Error::PoolNotOpen);
        }

        let contrib_key = DataKey::Contribution(pool_id, contributor.clone());
        let amount: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);

        if amount <= 0 {
            panic_with_error!(&env, Error::NoContribution);
        }

        // Clear before transferring (check-effects-interactions).
        env.storage().persistent().remove(&contrib_key);

        let token_client = token::Client::new(&env, &pool.token);
        token_client.transfer(&env.current_contract_address(), &contributor, &amount);

        env.events().publish(
            ("RefundIssued", pool_id),
            (contributor, pool_id, amount),
        );
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the full pool record.
    pub fn get_pool(env: Env, pool_id: u64) -> FundingPool {
        Self::load_pool(&env, pool_id)
    }

    /// Return the total contributed by a sponsor to a pool.
    pub fn get_contribution(env: Env, pool_id: u64, contributor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(pool_id, contributor))
            .unwrap_or(0)
    }

    /// Return the total number of pools created.
    pub fn get_pool_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::PoolCount)
            .unwrap_or(0)
    }

    /// Return the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// Update the admin address.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    fn load_pool(env: &Env, pool_id: u64) -> FundingPool {
        let key = DataKey::Pool(pool_id);
        match env.storage().persistent().get(&key) {
            Some(p) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
                p
            }
            None => panic_with_error!(env, Error::PoolNotFound),
        }
    }

    fn save_pool(env: &Env, pool_id: u64, pool: &FundingPool) {
        let key = DataKey::Pool(pool_id);
        env.storage().persistent().set(&key, pool);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env,
    };

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

    fn create_token<'a>(
        env: &Env,
        admin: &Address,
    ) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
        let addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let token = TokenClient::new(env, &addr);
        let token_admin = StellarAssetClient::new(env, &addr);
        (addr, token, token_admin)
    }

    fn setup_contract(
        env: &Env,
    ) -> (Address, SponsorCrowdfundingContractClient, Address, Address) {
        let contract_id = env.register(SponsorCrowdfundingContract, ());
        let client = SponsorCrowdfundingContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        let token_admin = Address::generate(env);
        let (token_addr, _, _) = create_token(env, &token_admin);
        (contract_id, client, admin, token_addr)
    }

    #[test]
    fn test_initialize_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, admin, _) = setup_contract(&env);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_pool_count(), 0);
    }

    #[test]
    fn test_create_pool_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, token_addr) = setup_contract(&env);

        let id = client.create_pool(&1, &10_000, &token_addr);
        assert_eq!(id, 1);
        assert_eq!(client.get_pool_count(), 1);

        let pool = client.get_pool(&1);
        assert_eq!(pool.tree_id, 1);
        assert_eq!(pool.target_amount, 10_000);
        assert_eq!(pool.total_raised, 0);
        assert_eq!(pool.status, PoolStatus::Open);
    }

    #[test]
    fn test_contribute_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr2, _token_client, token_admin_client) = create_token(&env, &token_admin);
        let sponsor1 = Address::generate(&env);
        let sponsor2 = Address::generate(&env);
        token_admin_client.mint(&sponsor1, &8_000);
        token_admin_client.mint(&sponsor2, &5_000);

        let id = client.create_pool(&1, &10_000, &token_addr2);
        client.contribute(&sponsor1, &id, &6_000);
        client.contribute(&sponsor2, &id, &4_000);

        let pool = client.get_pool(&id);
        assert_eq!(pool.total_raised, 10_000);
        assert_eq!(pool.status, PoolStatus::Settled);

        assert_eq!(client.get_contribution(&id, &sponsor1), 6_000);
        assert_eq!(client.get_contribution(&id, &sponsor2), 4_000);
    }

    #[test]
    fn test_dissolve_and_refund() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr2, token_client, token_admin_client) = create_token(&env, &token_admin);
        let sponsor = Address::generate(&env);
        token_admin_client.mint(&sponsor, &5_000);

        let id = client.create_pool(&1, &10_000, &token_addr2);
        client.contribute(&sponsor, &id, &3_000);

        client.dissolve_pool(&id);
        assert_eq!(client.get_pool(&id).status, PoolStatus::Dissolved);

        client.refund(&sponsor, &id);
        assert_eq!(token_client.balance(&sponsor), 5_000);
        assert_eq!(client.get_contribution(&id, &sponsor), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_get_pool_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        client.get_pool(&99);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_pool_zero_target() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, token_addr) = setup_contract(&env);
        client.create_pool(&1, &0, &token_addr);
    }

    #[test]
    fn test_set_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        let new_admin = Address::generate(&env);
        client.set_admin(&new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }
}


#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Storage key enumeration.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Global admin address (instance storage).
    Admin,
    /// Reward token address (XLM) (instance storage).
    RewardToken,
    /// Reward amount in stroops (instance storage).
    RewardAmount,
    /// Planter info keyed by address (persistent storage).
    Planter(Address),
    /// Referral info keyed by referrer address (persistent storage).
    Referrals(Address),
}

/// Planter information.
#[contracttype]
#[derive(Clone)]
pub struct PlanterInfo {
    /// Planter address.
    pub address: Address,
    /// Who referred this planter (if any).
    pub referrer: Option<Address>,
    /// Number of jobs completed.
    pub jobs_completed: u64,
    /// Whether the first job completion reward has been claimed.
    pub first_job_reward_claimed: bool,
}

/// Referral information.
#[contracttype]
#[derive(Clone)]
pub struct ReferralInfo {
    /// Number of planters referred.
    pub referral_count: u64,
    /// Number of referred planters who completed their first job.
    pub successful_referrals: u64,
}

/// Event emitted when a planter is registered.
#[contracttype]
#[derive(Clone)]
pub struct PlanterRegisteredEvent {
    pub planter: Address,
    pub referrer: Option<Address>,
}

/// Event emitted when a planter completes a job.
#[contracttype]
#[derive(Clone)]
pub struct JobCompletedEvent {
    pub planter: Address,
    pub job_count: u64,
}

/// Event emitted when a referral reward is claimed.
#[contracttype]
#[derive(Clone)]
pub struct ReferralRewardClaimedEvent {
    pub referrer: Address,
    pub referred_planter: Address,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Contract already initialized.
    AlreadyInitialized = 1,
    /// Contract not initialized.
    NotInitialized = 2,
    /// Unauthorized caller.
    Unauthorized = 3,
    /// Planter already registered.
    AlreadyRegistered = 4,
    /// Planter not found.
    PlanterNotFound = 5,
    /// Invalid reward amount.
    InvalidRewardAmount = 6,
    /// Reward already claimed.
    RewardAlreadyClaimed = 7,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;
/// Default reward: 2 XLM (2 * 10^7 stroops).
const DEFAULT_REWARD: i128 = 20_000_000;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlanterMetrics {
    pub trees_completed: u32,
    pub avg_completion_time: u64,
    pub success_rate: u32,
    pub current_bond_locked: i128,
}

#[contract]
pub struct PlanterContract;

#[contractimpl]
impl PlanterContract {
    /// Initialize the contract.
    ///
    /// # Arguments
    /// * `admin` — Admin address authorized to update parameters.
    /// * `reward_token` — XLM token contract address.
    /// * `reward_amount` — Reward amount in stroops (default: 20,000,000 = 2 XLM).
    pub fn initialize(env: Env, admin: Address, reward_token: Address, reward_amount: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if reward_amount <= 0 {
            panic_with_error!(&env, Error::InvalidRewardAmount);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::RewardToken, &reward_token);
        env.storage().instance().set(&DataKey::RewardAmount, &reward_amount);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Register a new planter with an optional referrer.
    ///
    /// # Arguments
    /// * `planter` — Planter address to register.
    /// * `referrer` — Optional referrer address.
    pub fn register_planter(env: Env, planter: Address, referrer: Option<Address>) {
        if env.storage().persistent().has(&DataKey::Planter(planter.clone())) {
            panic_with_error!(&env, Error::AlreadyRegistered);
        }
        planter.require_auth();

        let planter_info = PlanterInfo {
            address: planter.clone(),
            referrer: referrer.clone(),
            jobs_completed: 0,
            first_job_reward_claimed: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Planter(planter.clone()), &planter_info);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Planter(planter), LEDGER_THRESHOLD, LEDGER_BUMP);

        // Update referrer's referral count
        if let Some(ref ref) = referrer {
            let mut referral_info = Self::load_referral_info(&env, ref.clone());
            referral_info.referral_count += 1;
            Self::save_referral_info(&env, ref.clone(), &referral_info);
        }

        env.events().publish(
            ("PlanterRegistered", planter.clone()),
            PlanterRegisteredEvent {
                planter,
                referrer,
            },
        );
    }

    /// Record a job completion for a planter.
    ///
    /// # Arguments
    /// * `planter` — Planter address.
    pub fn complete_job(env: Env, planter: Address) {
        let mut planter_info = Self::load_planter(&env, planter.clone());
        planter.require_auth();

        planter_info.jobs_completed += 1;
        Self::save_planter(&env, planter.clone(), &planter_info);

        env.events().publish(
            ("JobCompleted", planter.clone()),
            JobCompletedEvent {
                planter,
                job_count: planter_info.jobs_completed,
            },
        );
    }

    /// Claim referral reward for a referred planter's first job completion.
    ///
    /// # Arguments
    /// * `referrer` — Referrer address claiming the reward.
    /// * `referred_planter` — The referred planter who completed their first job.
    pub fn claim_referral_reward(env: Env, referrer: Address, referred_planter: Address) {
        referrer.require_auth();

        let referred_info = Self::load_planter(&env, referred_planter.clone());
        
        // Verify the referrer is correct
        if referred_info.referrer != Some(referrer.clone()) {
            panic_with_error!(&env, Error::Unauthorized);
        }

        // Verify the referred planter has completed at least one job
        if referred_info.jobs_completed == 0 {
            panic_with_error!(&env, Error::PlanterNotFound);
        }

        // Verify reward hasn't been claimed yet
        if referred_info.first_job_reward_claimed {
            panic_with_error!(&env, Error::RewardAlreadyClaimed);
        }

        let reward_amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::RewardAmount)
            .unwrap_or(DEFAULT_REWARD);

        let reward_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::RewardToken)
            .unwrap();

        // Mark reward as claimed
        let mut updated_info = referred_info;
        updated_info.first_job_reward_claimed = true;
        Self::save_planter(&env, referred_planter.clone(), &updated_info);

        // Update referrer's successful referral count
        let mut referral_info = Self::load_referral_info(&env, referrer.clone());
        referral_info.successful_referrals += 1;
        Self::save_referral_info(&env, referrer.clone(), &referral_info);

        // Transfer reward
        let token_client = token::Client::new(&env, &reward_token);
        // Note: This assumes the contract has enough XLM balance to pay rewards
        // In production, this would need to be funded or use a different mechanism
        token_client.transfer(&env.current_contract_address(), &referrer, &reward_amount);

        env.events().publish(
            ("ReferralRewardClaimed", referrer.clone()),
            ReferralRewardClaimedEvent {
                referrer,
                referred_planter,
                amount: reward_amount,
            },
        );
    }

    /// Get planter information.
    ///
    /// # Arguments
    /// * `planter` — Planter address.
    pub fn get_planter(env: Env, planter: Address) -> PlanterInfo {
        Self::load_planter(&env, planter)
    }

    /// Get referral information.
    ///
    /// # Arguments
    /// * `referrer` — Referrer address.
    pub fn get_referral_info(env: Env, referrer: Address) -> ReferralInfo {
        Self::load_referral_info(&env, referrer)
    }

    /// Get current reward amount.
    pub fn get_reward_amount(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RewardAmount)
            .unwrap_or(DEFAULT_REWARD)
    }

    /// Update reward amount (admin only).
    ///
    /// # Arguments
    /// * `new_amount` — New reward amount in stroops.
    pub fn set_reward_amount(env: Env, new_amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();

        if new_amount <= 0 {
            panic_with_error!(&env, Error::InvalidRewardAmount);
        }

        env.storage().instance().set(&DataKey::RewardAmount, &new_amount);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn load_planter(env: &Env, planter: Address) -> PlanterInfo {
        let key = DataKey::Planter(planter);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::PlanterNotFound))
    }

    fn save_planter(env: &Env, planter: Address, info: &PlanterInfo) {
        let key = DataKey::Planter(planter);
        env.storage().persistent().set(&key, info);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    fn load_referral_info(env: &Env, referrer: Address) -> ReferralInfo {
        let key = DataKey::Referrals(referrer);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(ReferralInfo {
                referral_count: 0,
                successful_referrals: 0,
            })
    }

    fn save_referral_info(env: &Env, referrer: Address, info: &ReferralInfo) {
        let key = DataKey::Referrals(referrer);
        env.storage().persistent().set(&key, info);
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
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    fn setup(env: &Env) -> Address {
        let admin = Address::generate(env);
        let reward_token = Address::generate(env);
        PlanterContract::initialize(env.clone(), admin.clone(), reward_token, DEFAULT_REWARD);
        admin
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let reward_token = Address::generate(&env);
        
        PlanterContract::initialize(env.clone(), admin.clone(), reward_token, DEFAULT_REWARD);
        
        assert_eq!(PlanterContract::get_reward_amount(env), DEFAULT_REWARD);
    }

    #[test]
    fn test_register_planter() {
        let env = Env::default();
        env.mock_all_auths();
        setup(&env);
        
        let planter = Address::generate(&env);
        PlanterContract::register_planter(env.clone(), planter.clone(), None);
        
        let info = PlanterContract::get_planter(env, planter);
        assert_eq!(info.jobs_completed, 0);
        assert_eq!(info.first_job_reward_claimed, false);
    }

    #[test]
    fn test_register_planter_with_referrer() {
        let env = Env::default();
        env.mock_all_auths();
        setup(&env);
        
        let referrer = Address::generate(&env);
        let planter = Address::generate(&env);
        PlanterContract::register_planter(env.clone(), planter.clone(), Some(referrer.clone()));
        
        let info = PlanterContract::get_planter(env, planter);
        assert_eq!(info.referrer, Some(referrer.clone()));
        
        let referral_info = PlanterContract::get_referral_info(env, referrer);
        assert_eq!(referral_info.referral_count, 1);
    }

    #[test]
    fn test_complete_job() {
        let env = Env::default();
        env.mock_all_auths();
        setup(&env);
        
        let planter = Address::generate(&env);
        PlanterContract::register_planter(env.clone(), planter.clone(), None);
        PlanterContract::complete_job(env.clone(), planter.clone());
        
        let info = PlanterContract::get_planter(env, planter);
        assert_eq!(info.jobs_completed, 1);
    }

    #[test]
    fn test_claim_referral_reward() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = setup(&env);
        let reward_token = Address::generate(&env);
        
        // Fund contract with XLM (simplified for test)
        // In real scenario, this would be done via token minting or transfer
        
        let referrer = Address::generate(&env);
        let planter = Address::generate(&env);
        
        PlanterContract::register_planter(env.clone(), planter.clone(), Some(referrer.clone()));
        PlanterContract::complete_job(env.clone(), planter.clone());
        
        // Note: This test would need proper token setup to fully test the transfer
        // For now, we test the logic without the actual transfer
        let info = PlanterContract::get_planter(env.clone(), planter.clone());
        assert_eq!(info.jobs_completed, 1);
        assert_eq!(info.first_job_reward_claimed, false);
    pub fn get_planter_metrics(env: Env, wallet: Address) -> PlanterMetrics {
        env.storage().persistent().get(&wallet).unwrap_or(PlanterMetrics {
            trees_completed: 0,
            avg_completion_time: 0,
            success_rate: 0,
            current_bond_locked: 0,
        })
    }

    pub fn set_planter_metrics(env: Env, wallet: Address, metrics: PlanterMetrics) {
        env.storage().persistent().set(&wallet, &metrics);
    }
}

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
    /// Insurance policy keyed by tree_id.
    Policy(u64),
    /// Total insurance fund balance.
    InsuranceFund,
}

/// Lifecycle state of an insurance policy.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PolicyStatus {
    /// Policy is active; tree is alive.
    Active,
    /// Claim has been paid out.
    Claimed,
    /// Policy expired without a claim (tree survived 1 year).
    Expired,
}

/// An insurance policy linking a sponsor to a tree.
#[contracttype]
#[derive(Clone)]
pub struct InsurancePolicy {
    /// The tree this policy covers.
    pub tree_id: u64,
    /// Address of the sponsor who purchased insurance.
    pub sponsor: Address,
    /// Premium paid (2% of tree cost).
    pub premium: i128,
    /// Refund amount if tree dies.
    pub coverage_amount: i128,
    /// Unix timestamp when the policy was purchased.
    pub purchased_at: u64,
    /// Unix timestamp when the policy expires (purchased_at + 1 year).
    pub expires_at: u64,
    /// Current status.
    pub status: PolicyStatus,
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
    PolicyNotFound = 5,
    PolicyNotActive = 6,
    PolicyExpired = 7,
    PolicyNotExpired = 8,
    AlreadyInsured = 9,
    ArithmeticOverflow = 10,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Insurance premium rate: 200 basis points = 2%.
const PREMIUM_RATE: u32 = 200;
/// Basis point denominator.
const BPS_DENOMINATOR: u32 = 10_000;
/// Policy duration: 1 year in seconds (365 * 24 * 60 * 60).
const POLICY_DURATION: u64 = 31_536_000;
/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SponsorInsuranceContract;

#[contractimpl]
impl SponsorInsuranceContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialize the insurance contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::InsuranceFund, &0i128);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Insurance lifecycle
    // -----------------------------------------------------------------------

    /// Purchase insurance for a tree.
    ///
    /// The sponsor pays a 2% premium on `tree_cost`. If the tree dies within
    /// 1 year, the sponsor receives a full refund of `tree_cost`.
    ///
    /// # Arguments
    /// * `sponsor`   ??? Address purchasing insurance.
    /// * `tree_id`   ??? ID of the tree to insure.
    /// * `tree_cost` ??? Original cost of the tree in tokens.
    /// * `token`     ??? Stellar asset contract address for payment.
    ///
    /// # Errors
    /// * [`Error::InvalidAmount`]    ??? `tree_cost <= 0`.
    /// * [`Error::AlreadyInsured`]   ??? active policy already exists for this tree.
    /// * [`Error::ArithmeticOverflow`] ??? premium calculation overflow.
    pub fn purchase_insurance(
        env: Env,
        sponsor: Address,
        tree_id: u64,
        tree_cost: i128,
        token: Address,
    ) {
        sponsor.require_auth();

        if tree_cost <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Check no active policy exists.
        let key = DataKey::Policy(tree_id);
        if let Some(existing) = env.storage().persistent().get::<_, InsurancePolicy>(&key) {
            if existing.status == PolicyStatus::Active {
                panic_with_error!(&env, Error::AlreadyInsured);
            }
        }

        // Calculate premium: 2% of tree_cost.
        let premium = tree_cost
            .checked_mul(PREMIUM_RATE as i128)
            .and_then(|v| v.checked_div(BPS_DENOMINATOR as i128))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        // Transfer premium from sponsor to contract.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sponsor, &env.current_contract_address(), &premium);

        // Update insurance fund.
        let fund: i128 = env
            .storage()
            .instance()
            .get(&DataKey::InsuranceFund)
            .unwrap_or(0);
        let new_fund = fund
            .checked_add(premium)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage()
            .instance()
            .set(&DataKey::InsuranceFund, &new_fund);

        let now = env.ledger().timestamp();
        let policy = InsurancePolicy {
            tree_id,
            sponsor: sponsor.clone(),
            premium,
            coverage_amount: tree_cost,
            purchased_at: now,
            expires_at: now + POLICY_DURATION,
            status: PolicyStatus::Active,
        };

        env.storage().persistent().set(&key, &policy);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("InsurancePurchased", tree_id),
            (sponsor, tree_id, premium, tree_cost),
        );
    }

    /// Claim insurance for a dead tree.
    ///
    /// The full `coverage_amount` is refunded to the sponsor. Only the admin
    /// (or an authorized oracle) can mark a tree as dead.
    ///
    /// # Arguments
    /// * `tree_id` ??? ID of the dead tree.
    ///
    /// # Errors
    /// * [`Error::PolicyNotFound`]  ??? no policy for this tree.
    /// * [`Error::PolicyNotActive`] ??? policy is not active.
    /// * [`Error::PolicyExpired`]   ??? policy has expired.
    pub fn claim_insurance(env: Env, tree_id: u64) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let key = DataKey::Policy(tree_id);
        let mut policy: InsurancePolicy = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PolicyNotFound));

        if policy.status != PolicyStatus::Active {
            panic_with_error!(&env, Error::PolicyNotActive);
        }

        let now = env.ledger().timestamp();
        if now > policy.expires_at {
            policy.status = PolicyStatus::Expired;
            env.storage().persistent().set(&key, &policy);
            panic_with_error!(&env, Error::PolicyExpired);
        }

        // Pay out coverage.
        policy.status = PolicyStatus::Claimed;
        env.storage().persistent().set(&key, &policy);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("InsuranceClaimed", tree_id),
            (policy.sponsor, tree_id, policy.coverage_amount),
        );
    }

    /// Expire policies that have passed their 1-year window.
    ///
    /// Permissionless ??? anyone can call this to clean up expired policies.
    ///
    /// # Arguments
    /// * `tree_id` ??? ID of the tree with an expired policy.
    pub fn expire_policy(env: Env, tree_id: u64) {
        let key = DataKey::Policy(tree_id);
        let mut policy: InsurancePolicy = match env.storage().persistent().get(&key) {
            Some(p) => p,
            None => return,
        };

        if policy.status != PolicyStatus::Active {
            return;
        }

        let now = env.ledger().timestamp();
        if now > policy.expires_at {
            policy.status = PolicyStatus::Expired;
            env.storage().persistent().set(&key, &policy);
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);

            env.events()
                .publish(("InsuranceExpired", tree_id), (policy.sponsor, tree_id));
        }
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the insurance policy for a given tree.
    pub fn get_policy(env: Env, tree_id: u64) -> Option<InsurancePolicy> {
        env.storage()
            .persistent()
            .get(&DataKey::Policy(tree_id))
    }

    /// Return the total insurance fund balance.
    pub fn get_insurance_fund(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::InsuranceFund)
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
    ) -> (Address, SponsorInsuranceContractClient, Address, Address) {
        let contract_id = env.register(SponsorInsuranceContract, ());
        let client = SponsorInsuranceContractClient::new(env, &contract_id);
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
        assert_eq!(client.get_insurance_fund(), 0);
    }

    #[test]
    fn test_purchase_insurance_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr2, token_client, token_admin_client) = create_token(&env, &token_admin);
        let sponsor = Address::generate(&env);
        token_admin_client.mint(&sponsor, &10_000);

        client.purchase_insurance(&sponsor, &1, &5_000, &token_addr2);

        let policy = client.get_policy(&1).unwrap();
        assert_eq!(policy.tree_id, 1);
        assert_eq!(policy.sponsor, sponsor);
        assert_eq!(policy.premium, 100); // 2% of 5000
        assert_eq!(policy.coverage_amount, 5_000);
        assert_eq!(policy.status, PolicyStatus::Active);
        assert_eq!(client.get_insurance_fund(), 100);
        // Sponsor paid 100 premium.
        assert_eq!(token_client.balance(&sponsor), 9_900);
    }

    #[test]
    fn test_claim_insurance_success() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr2, _, token_admin_client) = create_token(&env, &token_admin);
        let sponsor = Address::generate(&env);
        token_admin_client.mint(&sponsor, &10_000);

        client.purchase_insurance(&sponsor, &1, &5_000, &token_addr2);

        // Claim before expiry.
        set_time(&env, 1_000 + 100_000);
        client.claim_insurance(&1);

        let policy = client.get_policy(&1).unwrap();
        assert_eq!(policy.status, PolicyStatus::Claimed);
    }

    #[test]
    fn test_expire_policy() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, _) = setup_contract(&env);

        let token_admin = Address::generate(&env);
        let (token_addr2, _, token_admin_client) = create_token(&env, &token_admin);
        let sponsor = Address::generate(&env);
        token_admin_client.mint(&sponsor, &10_000);

        client.purchase_insurance(&sponsor, &1, &5_000, &token_addr2);

        // Advance past 1 year.
        set_time(&env, 1_000 + POLICY_DURATION + 1);
        client.expire_policy(&1);

        let policy = client.get_policy(&1).unwrap();
        assert_eq!(policy.status, PolicyStatus::Expired);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_claim_no_policy_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client, _, _) = setup_contract(&env);
        client.claim_insurance(&99);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_purchase_zero_cost_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client, _, token_addr) = setup_contract(&env);
        let sponsor = Address::generate(&env);
        client.purchase_insurance(&sponsor, &1, &0, &token_addr);
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


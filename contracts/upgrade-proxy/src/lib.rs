#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN,
    Env,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address authorized to approve and execute upgrades.
    Admin,
    /// The current implementation WASM hash stored on-chain.
    ImplementationHash,
    /// Pending upgrade: stores (new_hash, approval_timestamp).
    PendingUpgrade,
}

/// Core state of the proxy contract.
#[contracttype]
#[derive(Clone)]
pub struct UpgradeProposal {
    /// WASM hash of the proposed new implementation.
    pub new_hash: BytesN<32>,
    /// Ledger timestamp when the upgrade was approved.
    pub approved_at: u64,
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
    NoPendingUpgrade = 4,
    TimelockNotElapsed = 5,
    InvalidImplementationHash = 6,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// 48 hours in seconds (48 * 60 * 60 = 172800).
const TIMELOCK_SECONDS: u64 = 172_800;

/// Storage TTL threshold: ~30 days at 5 s/ledger.
const LEDGER_THRESHOLD: u32 = 518_400;
/// Storage TTL bump: ~31 days at 5 s/ledger.
const LEDGER_BUMP: u32 = 535_680;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct UpgradeProxyContract;

#[contractimpl]
impl UpgradeProxyContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialize the proxy contract.
    ///
    /// Sets the admin and the initial implementation hash.
    ///
    /// # Arguments
    /// * `admin`              ??? Address authorized to approve upgrades.
    /// * `implementation_hash` ??? WASM hash of the initial implementation.
    pub fn initialize(env: Env, admin: Address, implementation_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ImplementationHash, &implementation_hash);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Upgrade lifecycle
    // -----------------------------------------------------------------------

    /// Approve a new implementation hash and start the 48h timelock.
    ///
    /// Only the admin can call this. Stores the new hash and the current
    /// ledger timestamp as the approval time.
    ///
    /// # Arguments
    /// * `new_hash` ??? WASM hash of the proposed new implementation.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::NotInitialized`] ??? contract not initialized.
    pub fn approve_upgrade(env: Env, new_hash: BytesN<32>) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let proposal = UpgradeProposal {
            new_hash: new_hash.clone(),
            approved_at: env.ledger().timestamp(),
        };

        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &proposal);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events()
            .publish(("UpgradeApproved",), (admin, new_hash));
    }

    /// Execute a previously approved upgrade after the 48h timelock.
    ///
    /// Updates the stored implementation hash and clears the pending upgrade.
    /// Callers can then use `env.invoke_contract` to call the new
    /// implementation.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::NoPendingUpgrade`] ??? no upgrade has been approved.
    /// * [`Error::TimelockNotElapsed`] ??? less than 48h since approval.
    pub fn execute_upgrade(env: Env) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let proposal: UpgradeProposal = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoPendingUpgrade));

        let elapsed = env
            .ledger()
            .timestamp()
            .checked_sub(proposal.approved_at)
            .unwrap_or(0);

        if elapsed < TIMELOCK_SECONDS {
            panic_with_error!(&env, Error::TimelockNotElapsed);
        }

        // Update implementation hash.
        env.storage().instance().set(
            &DataKey::ImplementationHash,
            &proposal.new_hash,
        );

        // Clear pending upgrade.
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events()
            .publish(("UpgradeExecuted",), (admin, proposal.new_hash));
    }

    /// Cancel a pending upgrade before execution.
    ///
    /// Only the admin can call this.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::NoPendingUpgrade`] ??? no upgrade is pending.
    pub fn cancel_upgrade(env: Env) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        if !env
            .storage()
            .instance()
            .has(&DataKey::PendingUpgrade)
        {
            panic_with_error!(&env, Error::NoPendingUpgrade);
        }

        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(("UpgradeCancelled",), (admin,));
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the current implementation hash.
    pub fn get_implementation_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::ImplementationHash)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Return the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Return the pending upgrade proposal, if any.
    pub fn get_pending_upgrade(env: Env) -> Option<UpgradeProposal> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    /// Check whether a pending upgrade has passed the 48h timelock.
    pub fn is_upgrade_ready(env: Env) -> bool {
        let proposal: UpgradeProposal = match env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
        {
            Some(p) => p,
            None => return false,
        };

        let elapsed = env
            .ledger()
            .timestamp()
            .checked_sub(proposal.approved_at)
            .unwrap_or(0);

        elapsed >= TIMELOCK_SECONDS
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// Update the admin address.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the current admin.
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

    fn setup_contract(env: &Env) -> (Address, UpgradeProxyContractClient) {
        let contract_id = env.register(UpgradeProxyContract, ());
        let client = UpgradeProxyContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let hash = BytesN::from_array(env, &[0u8; 32]);
        client.initialize(&admin, &hash);
        (admin, client)
    }

    #[test]
    fn test_initialize_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, client) = setup_contract(&env);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, client) = setup_contract(&env);
        let hash = BytesN::from_array(&env, &[0u8; 32]);
        client.initialize(&admin, &hash);
    }

    #[test]
    fn test_approve_and_execute_upgrade() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let new_hash = BytesN::from_array(&env, &[1u8; 32]);
        client.approve_upgrade(&new_hash);

        let proposal = client.get_pending_upgrade().unwrap();
        assert_eq!(proposal.approved_at, 1_000);

        // Cannot execute before 48h.
        set_time(&env, 1_000 + 100_000);
        assert!(!client.is_upgrade_ready());

        // Execute after 48h.
        set_time(&env, 1_000 + TIMELOCK_SECONDS);
        client.execute_upgrade();

        assert_eq!(client.get_implementation_hash(), new_hash);
        assert!(client.get_pending_upgrade().is_none());
    }

    #[test]
    fn test_cancel_upgrade() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let new_hash = BytesN::from_array(&env, &[1u8; 32]);
        client.approve_upgrade(&new_hash);
        assert!(client.get_pending_upgrade().is_some());

        client.cancel_upgrade();
        assert!(client.get_pending_upgrade().is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_execute_before_timelock_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let new_hash = BytesN::from_array(&env, &[1u8; 32]);
        client.approve_upgrade(&new_hash);

        // Try to execute immediately.
        client.execute_upgrade();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_execute_no_pending_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client) = setup_contract(&env);
        client.execute_upgrade();
    }

    #[test]
    fn test_set_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (old_admin, client) = setup_contract(&env);

        let new_admin = Address::generate(&env);
        client.set_admin(&new_admin);

        assert_eq!(client.get_admin(), new_admin);
        assert_ne!(client.get_admin(), old_admin);
    }
}


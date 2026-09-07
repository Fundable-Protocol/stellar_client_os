#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes,
    BytesN, Env, String,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address authorized to propose and execute actions.
    Admin,
    /// Pending action: stores (action_hash, target_contract, approval_timestamp).
    PendingAction,
    /// Historical actions executed through this timelock.
    ActionHistory(u64),
    /// Running count of actions.
    ActionCount,
}

/// A proposed action stored in the timelock.
#[contracttype]
#[derive(Clone)]
pub struct TimelockAction {
    /// Hash of the proposed action (e.g., WASM hash for upgrades).
    pub action_hash: BytesN<32>,
    /// Target contract address (optional, for cross-contract calls).
    pub target: Option<Address>,
    /// Description of the action.
    pub description: String,
    /// Ledger timestamp when the action was approved.
    pub approved_at: u64,
    /// Whether the action has been executed.
    pub executed: bool,
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
    NoPendingAction = 4,
    TimelockNotElapsed = 5,
    ActionAlreadyExecuted = 6,
    InvalidAction = 7,
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
pub struct TimelockContract;

#[contractimpl]
impl TimelockContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialize the timelock contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ActionCount, &0u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -----------------------------------------------------------------------
    // Action lifecycle
    // -----------------------------------------------------------------------

    /// Propose a new action with 48h timelock.
    ///
    /// # Arguments
    /// * `action_hash`  ??? Hash of the proposed action.
    /// * `target`       ??? Optional target contract address.
    /// * `description`  ??? Human-readable description.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::InvalidAction`] ??? empty action hash.
    pub fn propose_action(
        env: Env,
        action_hash: BytesN<32>,
        target: Option<Address>,
        description: String,
    ) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        // Check no pending action exists.
        if env.storage().instance().has(&DataKey::PendingAction) {
            // Allow overriding if previous action was executed or cancelled.
            let existing: TimelockAction = env
                .storage()
                .instance()
                .get(&DataKey::PendingAction)
                .unwrap();
            if !existing.executed {
                panic_with_error!(&env, Error::InvalidAction);
            }
        }

        let action = TimelockAction {
            action_hash: action_hash.clone(),
            target: target.clone(),
            description: description.clone(),
            approved_at: env.ledger().timestamp(),
            executed: false,
        };

        env.storage()
            .instance()
            .set(&DataKey::PendingAction, &action);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("ActionProposed",),
            (admin, action_hash, target, description),
        );
    }

    /// Execute a previously approved action after the 48h timelock.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::NoPendingAction`] ??? no action has been proposed.
    /// * [`Error::TimelockNotElapsed`] ??? less than 48h since approval.
    /// * [`Error::ActionAlreadyExecuted`] ??? action was already executed.
    pub fn execute_action(env: Env) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let mut action: TimelockAction = env
            .storage()
            .instance()
            .get(&DataKey::PendingAction)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoPendingAction));

        if action.executed {
            panic_with_error!(&env, Error::ActionAlreadyExecuted);
        }

        let elapsed = env
            .ledger()
            .timestamp()
            .checked_sub(action.approved_at)
            .unwrap_or(0);

        if elapsed < TIMELOCK_SECONDS {
            panic_with_error!(&env, Error::TimelockNotElapsed);
        }

        // Record in history.
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ActionCount)
            .unwrap_or(0);
        let new_count = count + 1;
        env.storage()
            .instance()
            .set(&DataKey::ActionCount, &new_count);
        env.storage()
            .instance()
            .set(&DataKey::ActionHistory(new_count), &action);

        // Mark as executed.
        action.executed = true;
        env.storage()
            .instance()
            .set(&DataKey::PendingAction, &action);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            ("ActionExecuted",),
            (admin, action.action_hash, action.target),
        );
    }

    /// Cancel a pending action.
    ///
    /// # Errors
    /// * [`Error::Unauthorized`] ??? caller is not the admin.
    /// * [`Error::NoPendingAction`] ??? no action is pending.
    pub fn cancel_action(env: Env) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let action: TimelockAction = env
            .storage()
            .instance()
            .get(&DataKey::PendingAction)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoPendingAction));

        if action.executed {
            panic_with_error!(&env, Error::ActionAlreadyExecuted);
        }

        env.storage().instance().remove(&DataKey::PendingAction);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events()
            .publish(("ActionCancelled",), (admin, action.action_hash));
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Return the pending action, if any.
    pub fn get_pending_action(env: Env) -> Option<TimelockAction> {
        env.storage().instance().get(&DataKey::PendingAction)
    }

    /// Check whether the pending action has passed the 48h timelock.
    pub fn is_action_ready(env: Env) -> bool {
        let action: TimelockAction = match env
            .storage()
            .instance()
            .get(&DataKey::PendingAction)
        {
            Some(a) => a,
            None => return false,
        };

        if action.executed {
            return false;
        }

        let elapsed = env
            .ledger()
            .timestamp()
            .checked_sub(action.approved_at)
            .unwrap_or(0);

        elapsed >= TIMELOCK_SECONDS
    }

    /// Return the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Return the total number of actions executed.
    pub fn get_action_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ActionCount)
            .unwrap_or(0)
    }

    /// Return a historical action by index.
    pub fn get_action_history(env: Env, index: u64) -> Option<TimelockAction> {
        env.storage()
            .instance()
            .get(&DataKey::ActionHistory(index))
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

    fn setup_contract(env: &Env) -> (Address, TimelockContractClient) {
        let contract_id = env.register(TimelockContract, ());
        let client = TimelockContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (admin, client)
    }

    #[test]
    fn test_initialize_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, client) = setup_contract(&env);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_action_count(), 0);
    }

    #[test]
    fn test_propose_and_execute_action() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let action_hash = BytesN::from_array(&env, &[1u8; 32]);
        let desc = String::from_str(&env, "Upgrade contract");
        client.propose_action(&action_hash, &None, &desc);

        let action = client.get_pending_action().unwrap();
        assert_eq!(action.approved_at, 1_000);
        assert!(!action.executed);

        // Cannot execute before 48h.
        set_time(&env, 1_000 + 100_000);
        assert!(!client.is_action_ready());

        // Execute after 48h.
        set_time(&env, 1_000 + TIMELOCK_SECONDS);
        client.execute_action();

        assert_eq!(client.get_action_count(), 1);
        assert!(client.get_pending_action().unwrap().executed);
    }

    #[test]
    fn test_cancel_action() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let action_hash = BytesN::from_array(&env, &[1u8; 32]);
        let desc = String::from_str(&env, "Upgrade contract");
        client.propose_action(&action_hash, &None, &desc);

        client.cancel_action();
        assert!(client.get_pending_action().is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_execute_before_timelock_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_time(&env, 1_000);
        let (_, client) = setup_contract(&env);

        let action_hash = BytesN::from_array(&env, &[1u8; 32]);
        let desc = String::from_str(&env, "Upgrade contract");
        client.propose_action(&action_hash, &None, &desc);
        client.execute_action();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_execute_no_pending_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client) = setup_contract(&env);
        client.execute_action();
    }

    #[test]
    fn test_set_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, client) = setup_contract(&env);
        let new_admin = Address::generate(&env);
        client.set_admin(&new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }
}

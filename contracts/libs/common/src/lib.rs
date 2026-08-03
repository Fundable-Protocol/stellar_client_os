#![no_std]

use soroban_sdk::{symbol_short, Env, Symbol};

const REENTRANCY_LOCK: Symbol = symbol_short!("reentry");

pub struct ReentrancyGuard {
    env: Env,
}

impl ReentrancyGuard {
    pub fn acquire(env: &Env) -> Option<Self> {
        if env
            .storage()
            .instance()
            .get::<_, bool>(&REENTRANCY_LOCK)
            .unwrap_or(false)
        {
            return None;
        }

        env.storage().instance().set(&REENTRANCY_LOCK, &true);
        Some(Self { env: env.clone() })
    }
}

impl Drop for ReentrancyGuard {
    fn drop(&mut self) {
        self.env.storage().instance().remove(&REENTRANCY_LOCK);
    }
}

#[cfg(test)]
mod tests {
    use super::ReentrancyGuard;
    use soroban_sdk::{contract, contractimpl, Env};

    #[contract]
    struct GuardHarness;

    #[contractimpl]
    impl GuardHarness {
        pub fn nested(env: Env) -> bool {
            let guard = ReentrancyGuard::acquire(&env);
            guard.is_some() && ReentrancyGuard::acquire(&env).is_none()
        }

        pub fn acquire(env: Env) -> bool {
            ReentrancyGuard::acquire(&env).is_some()
        }
    }

    #[test]
    fn rejects_nested_acquisition() {
        let env = Env::default();
        let contract_id = env.register(GuardHarness, ());
        let client = GuardHarnessClient::new(&env, &contract_id);

        assert!(client.nested());
    }

    #[test]
    fn releases_lock_when_scope_ends() {
        let env = Env::default();
        let contract_id = env.register(GuardHarness, ());
        let client = GuardHarnessClient::new(&env, &contract_id);

        assert!(client.acquire());
        assert!(client.acquire());
    }
}

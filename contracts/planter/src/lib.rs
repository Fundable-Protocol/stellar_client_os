#![no_std]
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

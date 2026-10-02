#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, symbol_short
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAdmin = 1,
    InsufficientStake = 2,
    NotStaked = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Stake(Address),
}

#[contract]
pub struct VerifierPenaltyContract;

#[contractimpl]
impl VerifierPenaltyContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Verifier stakes a bond to become eligible for verifying trees.
    pub fn stake(env: Env, verifier: Address, amount: i128) {
        verifier.require_auth();
        let current_stake = Self::get_stake(env.clone(), verifier.clone());
        let new_stake = current_stake + amount;
        env.storage().persistent().set(&DataKey::Stake(verifier.clone()), &new_stake);
        
        env.events().publish((symbol_short!("staked"), verifier), amount);
    }

    /// Admin can slash a verifier's stake for fraud detection (e.g. approving a dead tree).
    pub fn slash(env: Env, verifier: Address, slash_amount: i128) -> Result<(), Error> {
        let admin = Self::get_admin(env.clone())?;
        admin.require_auth();

        let current_stake = Self::get_stake(env.clone(), verifier.clone());
        if current_stake < slash_amount {
            return Err(Error::InsufficientStake);
        }

        let new_stake = current_stake - slash_amount;
        env.storage().persistent().set(&DataKey::Stake(verifier.clone()), &new_stake);

        env.events().publish((symbol_short!("slashed"), verifier), slash_amount);
        Ok(())
    }

    pub fn get_stake(env: Env, verifier: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Stake(verifier)).unwrap_or(0)
    }

    fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotAdmin)
    }
}

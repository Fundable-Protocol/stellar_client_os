#![no_std]

use contract_common::{
    extend_instance_ttl, ReentrancyGuard, FEE_BPS_DENOMINATOR, LEDGER_TTL_EXTEND_TO,
    LEDGER_TTL_THRESHOLD, MAX_PROTOCOL_FEE_BPS,
};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, Vec,
};

#[contract]
pub struct DistributorContract;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    NoRecipients = 5,
    AmountTooSmall = 6,
    RecipientsAmountsMismatch = 7,
    FeeTooHigh = 8,
    ReentrantCall = 9,
}

#[contracttype]
#[derive(Clone)]
pub struct TokenStats {
    pub total_amount: i128,
    pub distribution_count: u32,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct UserStats {
    pub distributions_initiated: u32,
    pub total_amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct DistributionHistory {
    pub sender: Address,
    pub token: Address,
    pub amount: i128,
    pub recipients_count: u32,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    FeePercent,
    FeeAddress,
    TotalDistributions,
    TotalAmount,
    HistoryCount,
    TokenStats(Address),
    UserStats(Address),
    History(u64),
}

#[contractimpl]
impl DistributorContract {
    pub fn initialize(env: Env, admin: Address, protocol_fee_percent: u32, fee_address: Address) {
        let _guard = Self::acquire_guard(&env);

        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if protocol_fee_percent > MAX_PROTOCOL_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        admin.require_auth();

        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::FeePercent, &protocol_fee_percent);
        storage.set(&DataKey::FeeAddress, &fee_address);
        storage.set(&DataKey::TotalDistributions, &0u64);
        storage.set(&DataKey::TotalAmount, &0i128);
        storage.set(&DataKey::HistoryCount, &0u64);
        extend_instance_ttl(&env);
    }

    pub fn distribute_equal(
        env: Env,
        sender: Address,
        token: Address,
        total_amount: i128,
        recipients: Vec<Address>,
    ) {
        let _guard = Self::acquire_guard(&env);
        Self::require_initialized(&env);
        sender.require_auth();

        let recipient_count = recipients.len() as i128;
        if recipient_count == 0 {
            panic_with_error!(&env, Error::NoRecipients);
        }
        if total_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let amount_per_recipient = total_amount / recipient_count;
        if amount_per_recipient <= 0 {
            panic_with_error!(&env, Error::AmountTooSmall);
        }

        let token_client = token::Client::new(&env, &token);
        let protocol_fee = Self::calculate_fee(&env, total_amount);

        if protocol_fee > 0 {
            let fee_address: Address = env.storage().instance().get(&DataKey::FeeAddress).unwrap();
            token_client.transfer(&sender, &fee_address, &protocol_fee);
        }

        for recipient in recipients.iter() {
            token_client.transfer(&sender, &recipient, &amount_per_recipient);
        }

        Self::update_global_stats(&env, total_amount);
        Self::update_token_stats(&env, &token, total_amount);
        Self::update_user_stats(&env, &sender, total_amount);
        Self::record_history(&env, sender, token, total_amount, recipients.len());
        extend_instance_ttl(&env);
    }

    pub fn distribute_weighted(
        env: Env,
        sender: Address,
        token: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) {
        let _guard = Self::acquire_guard(&env);
        Self::require_initialized(&env);
        sender.require_auth();

        if recipients.len() != amounts.len() {
            panic_with_error!(&env, Error::RecipientsAmountsMismatch);
        }
        if recipients.is_empty() {
            panic_with_error!(&env, Error::NoRecipients);
        }

        let token_client = token::Client::new(&env, &token);

        let mut total_amount: i128 = 0;
        for amount in amounts.iter() {
            if amount <= 0 {
                panic_with_error!(&env, Error::InvalidAmount);
            }
            total_amount += amount;
        }

        let protocol_fee = Self::calculate_fee(&env, total_amount);

        if protocol_fee > 0 {
            let fee_address: Address = env.storage().instance().get(&DataKey::FeeAddress).unwrap();
            token_client.transfer(&sender, &fee_address, &protocol_fee);
        }

        for i in 0..recipients.len() {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();
            token_client.transfer(&sender, &recipient, &amount);
        }

        Self::update_global_stats(&env, total_amount);
        Self::update_token_stats(&env, &token, total_amount);
        Self::update_user_stats(&env, &sender, total_amount);
        Self::record_history(&env, sender, token, total_amount, recipients.len());
        extend_instance_ttl(&env);
    }

    fn update_global_stats(env: &Env, amount: i128) {
        let storage = env.storage().instance();
        let mut total_dist: u64 = storage.get(&DataKey::TotalDistributions).unwrap_or(0);
        let mut total_amt: i128 = storage.get(&DataKey::TotalAmount).unwrap_or(0);

        total_dist += 1;
        total_amt += amount;

        storage.set(&DataKey::TotalDistributions, &total_dist);
        storage.set(&DataKey::TotalAmount, &total_amt);
    }

    fn update_token_stats(env: &Env, token: &Address, amount: i128) {
        let storage = env.storage().persistent();
        let key = DataKey::TokenStats(token.clone());

        let mut stats: TokenStats = storage.get(&key).unwrap_or(TokenStats {
            total_amount: 0,
            distribution_count: 0,
            last_time: 0,
        });

        stats.total_amount += amount;
        stats.distribution_count += 1;

        let ts = env.ledger().timestamp();
        stats.last_time = if ts == 0 { 1 } else { ts };

        storage.set(&key, &stats);
        storage.extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND_TO);
    }

    fn update_user_stats(env: &Env, user: &Address, amount: i128) {
        let storage = env.storage().persistent();
        let key = DataKey::UserStats(user.clone());

        let mut stats: UserStats = storage.get(&key).unwrap_or(UserStats {
            distributions_initiated: 0,
            total_amount: 0,
        });

        stats.distributions_initiated += 1;
        stats.total_amount += amount;

        storage.set(&key, &stats);
        storage.extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND_TO);
    }

    fn record_history(
        env: &Env,
        sender: Address,
        token: Address,
        amount: i128,
        recipient_count: u32,
    ) {
        let storage = env.storage().persistent();
        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::HistoryCount)
            .unwrap_or(0);

        let history = DistributionHistory {
            sender,
            token,
            amount,
            recipients_count: recipient_count,
            timestamp: env.ledger().timestamp(),
        };

        let key = DataKey::History(count);
        storage.set(&key, &history);
        storage.extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND_TO);
        count += 1;
        env.storage().instance().set(&DataKey::HistoryCount, &count);
    }

    fn calculate_fee(env: &Env, amount: i128) -> i128 {
        let fee_percent: u32 = env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap_or(0);
        (amount * fee_percent as i128) / FEE_BPS_DENOMINATOR
    }

    pub fn get_total_distributions(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TotalDistributions)
            .unwrap_or(0)
    }

    pub fn get_total_distributed_amount(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalAmount)
            .unwrap_or(0)
    }

    pub fn get_token_stats(env: Env, token: Address) -> Option<TokenStats> {
        env.storage().persistent().get(&DataKey::TokenStats(token))
    }

    pub fn get_user_stats(env: Env, user: Address) -> Option<UserStats> {
        env.storage().persistent().get(&DataKey::UserStats(user))
    }

    pub fn get_distribution_history(
        env: Env,
        start_id: u64,
        limit: u64,
    ) -> Vec<DistributionHistory> {
        let mut history = Vec::new(&env);
        let storage = env.storage().persistent();

        for i in start_id..(start_id + limit) {
            if let Some(record) = storage.get::<_, DistributionHistory>(&DataKey::History(i)) {
                history.push_back(record);
            }
        }

        history
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn set_protocol_fee(env: Env, admin: Address, new_fee_percent: u32) {
        let _guard = Self::acquire_guard(&env);
        Self::require_initialized(&env);
        admin.require_auth();

        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if new_fee_percent > MAX_PROTOCOL_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }

        env.storage()
            .instance()
            .set(&DataKey::FeePercent, &new_fee_percent);
        extend_instance_ttl(&env);
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    fn acquire_guard(env: &Env) -> ReentrancyGuard {
        ReentrancyGuard::acquire(env)
            .unwrap_or_else(|| panic_with_error!(env, Error::ReentrantCall))
    }
}

#[cfg(test)]
mod test;

/// Yield Routing Module for Campaign Escrow
///
/// Integrates with Stellar anchor protocols to earn yield on milestone escrow funds.
/// Supports deposit, withdrawal, emergency instant-withdrawal, and yield distribution.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

/// Yield strategy type supported by the contract.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum YieldStrategyType {
    /// Blend Protocol lending pool
    BlendProtocol = 0,
    /// Tokenized T-Bill anchor
    TokenizedTBill = 1,
    /// Money market protocol
    MoneyMarket = 2,
}

/// Yield deposit lifecycle status.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum YieldDepositStatus {
    /// Funds deposited and earning yield
    Active,
    /// Emergency withdrawal executed
    EmergencyWithdrawn,
    /// Milestone released, yield distributed
    Completed,
}

/// Single yield deposit for a milestone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldDeposit {
    /// Campaign ID this deposit belongs to
    pub campaign_id: u64,
    /// Milestone ID (e.g., percentage or sequence number)
    pub milestone_id: u64,
    /// Principal amount deposited
    pub amount: i128,
    /// Yield strategy contract address
    pub strategy_contract: Address,
    /// Yield strategy type
    pub strategy_type: YieldStrategyType,
    /// Unix timestamp when deposit was made
    pub deposited_at: u64,
    /// Unix timestamp when milestone funds are scheduled for release
    pub release_date: u64,
    /// Current deposit status
    pub status: YieldDepositStatus,
    /// Accrued yield (updated periodically)
    pub accrued_yield: i128,
}

/// Campaign yield configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignYieldConfig {
    /// Campaign ID
    pub campaign_id: u64,
    /// Whether yield routing is enabled for this campaign
    pub enabled: bool,
    /// Default yield strategy contract address
    pub strategy_contract: Address,
    /// Default yield strategy type
    pub strategy_type: YieldStrategyType,
    /// Total amount currently deposited across all milestones
    pub total_deposited: i128,
    /// Total accrued yield across all deposits
    pub total_accrued_yield: i128,
}

/// Yield distribution shares (in basis points, summing to 10,000).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldDistribution {
    /// Creator's share of the yield (e.g., 7000 = 70%)
    pub creator_share_bps: u32,
    /// Backers' share of the yield (e.g., 3000 = 30%)
    pub backer_share_bps: u32,
    /// Platform fee (e.g., 0 = 0%)
    pub platform_fee_bps: u32,
}

/// Errors specific to yield operations.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum YieldError {
    /// Yield routing is not enabled for this campaign.
    YieldNotEnabled = 100,
    /// The yield strategy contract address is invalid.
    InvalidStrategy = 101,
    /// Deposit amount must be positive.
    InvalidAmount = 102,
    /// Release date must be in the future.
    InvalidReleaseDate = 103,
    /// Deposit not found.
    DepositNotFound = 104,
    /// Deposit already completed or withdrawn.
    DepositCompleted = 105,
    /// Emergency withdrawal already executed.
    AlreadyWithdrawn = 106,
    /// Insufficient accrued yield for distribution.
    InsufficientYield = 107,
    /// Yield distribution shares do not sum to 10,000 basis points.
    InvalidDistribution = 108,
}

/// Storage keys for yield data.
#[contracttype]
#[derive(Clone)]
pub enum YieldDataKey {
    /// Campaign yield configuration
    Config(u64),
    /// Yield deposit keyed by (campaign_id, milestone_id)
    Deposit(u64, u64),
    /// Total number of deposits for a campaign
    DepositCount(u64),
    /// Default yield distribution rule
    DistributionRule,
}

/// Event emitted when yield routing is enabled for a campaign.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldEnabled {
    #[topic]
    pub campaign_id: u64,
    pub strategy_contract: Address,
    pub strategy_type: YieldStrategyType,
}

/// Event emitted when funds are deposited into a yield strategy.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldDeposited {
    #[topic]
    pub campaign_id: u64,
    pub milestone_id: u64,
    pub amount: i128,
    pub strategy_contract: Address,
    pub deposited_at: u64,
    pub release_date: u64,
}

/// Event emitted when yield is distributed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldDistributed {
    #[topic]
    pub campaign_id: u64,
    pub milestone_id: u64,
    pub creator_amount: i128,
    pub backer_amount: i128,
    pub platform_fee: i128,
}

/// Event emitted when emergency withdrawal is executed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmergencyWithdrawal {
    #[topic]
    pub campaign_id: u64,
    pub total_withdrawn: i128,
    pub accrued_yield: i128,
    pub reason: soroban_sdk::Symbol,
}

#[contract]
pub struct YieldRouter;

#[contractimpl]
impl YieldRouter {
    /// Enable yield routing for a campaign with a specified strategy.
    pub fn enable_yield(
        env: Env,
        campaign_id: u64,
        creator: Address,
        strategy_contract: Address,
        strategy_type: YieldStrategyType,
    ) -> Result<(), YieldError> {
        creator.require_auth();

        let config = CampaignYieldConfig {
            campaign_id,
            enabled: true,
            strategy_contract: strategy_contract.clone(),
            strategy_type,
            total_deposited: 0,
            total_accrued_yield: 0,
        };

        env.storage()
            .persistent()
            .set(&YieldDataKey::Config(campaign_id), &config);

        env.events().publish(
            (soroban_sdk::symbol_short!("yield_on"),),
            YieldEnabled {
                campaign_id,
                strategy_contract,
                strategy_type,
            },
        );

        Ok(())
    }

    /// Disable yield routing for a campaign.
    pub fn disable_yield(
        env: Env,
        campaign_id: u64,
        creator: Address,
    ) -> Result<(), YieldError> {
        creator.require_auth();

        let mut config: CampaignYieldConfig = env
            .storage()
            .persistent()
            .get(&YieldDataKey::Config(campaign_id))
            .ok_or(YieldError::YieldNotEnabled)?;

        config.enabled = false;
        env.storage()
            .persistent()
            .set(&YieldDataKey::Config(campaign_id), &config);

        Ok(())
    }

    /// Deposit milestone escrow funds into the configured yield strategy.
    pub fn deposit_to_yield(
        env: Env,
        campaign_id: u64,
        milestone_id: u64,
        amount: i128,
        release_date: u64,
    ) -> Result<(), YieldError> {
        if amount <= 0 {
            return Err(YieldError::InvalidAmount);
        }

        let now = env.ledger().timestamp();
        if release_date <= now {
            return Err(YieldError::InvalidReleaseDate);
        }

        let config: CampaignYieldConfig = env
            .storage()
            .persistent()
            .get(&YieldDataKey::Config(campaign_id))
            .ok_or(YieldError::YieldNotEnabled)?;

        if !config.enabled {
            return Err(YieldError::YieldNotEnabled);
        }

        let deposit = YieldDeposit {
            campaign_id,
            milestone_id,
            amount,
            strategy_contract: config.strategy_contract.clone(),
            strategy_type: config.strategy_type,
            deposited_at: now,
            release_date,
            status: YieldDepositStatus::Active,
            accrued_yield: 0,
        };

        env.storage()
            .persistent()
            .set(&YieldDataKey::Deposit(campaign_id, milestone_id), &deposit);

        // Update config totals
        let mut updated_config = config;
        updated_config.total_deposited += amount;
        env.storage()
            .persistent()
            .set(&YieldDataKey::Config(campaign_id), &updated_config);

        // Increment deposit count
        let count: u64 = env
            .storage()
            .persistent()
            .get(&YieldDataKey::DepositCount(campaign_id))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&YieldDataKey::DepositCount(campaign_id), &(count + 1));

        env.events().publish(
            (soroban_sdk::symbol_short!("yld_dep"),),
            YieldDeposited {
                campaign_id,
                milestone_id,
                amount,
                strategy_contract: deposit.strategy_contract,
                deposited_at: now,
                release_date,
            },
        );

        Ok(())
    }

    /// Distribute accrued yield upon milestone completion.
    pub fn distribute_yield(
        env: Env,
        campaign_id: u64,
        milestone_id: u64,
    ) -> Result<(i128, i128, i128), YieldError> {
        let mut deposit: YieldDeposit = env
            .storage()
            .persistent()
            .get(&YieldDataKey::Deposit(campaign_id, milestone_id))
            .ok_or(YieldError::DepositNotFound)?;

        if deposit.status != YieldDepositStatus::Active {
            return Err(YieldError::DepositCompleted);
        }

        // Get distribution rule (default: 70% creator, 30% backers, 0% platform)
        let distribution: YieldDistribution = env
            .storage()
            .persistent()
            .get(&YieldDataKey::DistributionRule)
            .unwrap_or(YieldDistribution {
                creator_share_bps: 7000,
                backer_share_bps: 3000,
                platform_fee_bps: 0,
            });

        if distribution.creator_share_bps + distribution.backer_share_bps + distribution.platform_fee_bps
            != 10000
        {
            return Err(YieldError::InvalidDistribution);
        }

        let total_yield = deposit.accrued_yield;
        if total_yield <= 0 {
            return Err(YieldError::InsufficientYield);
        }

        let creator_amount = (total_yield * distribution.creator_share_bps as i128) / 10000;
        let backer_amount = (total_yield * distribution.backer_share_bps as i128) / 10000;
        let platform_fee = (total_yield * distribution.platform_fee_bps as i128) / 10000;

        // Mark deposit as completed
        deposit.status = YieldDepositStatus::Completed;
        env.storage()
            .persistent()
            .set(&YieldDataKey::Deposit(campaign_id, milestone_id), &deposit);

        env.events().publish(
            (soroban_sdk::symbol_short!("yld_dist"),),
            YieldDistributed {
                campaign_id,
                milestone_id,
                creator_amount,
                backer_amount,
                platform_fee,
            },
        );

        Ok((creator_amount, backer_amount, platform_fee))
    }

    /// Execute emergency instant-withdrawal of all active deposits.
    pub fn emergency_withdraw(
        env: Env,
        campaign_id: u64,
        creator: Address,
        reason: soroban_sdk::Symbol,
    ) -> Result<(i128, i128), YieldError> {
        creator.require_auth();

        let config: CampaignYieldConfig = env
            .storage()
            .persistent()
            .get(&YieldDataKey::Config(campaign_id))
            .ok_or(YieldError::YieldNotEnabled)?;

        if !config.enabled {
            return Err(YieldError::YieldNotEnabled);
        }

        let deposit_count: u64 = env
            .storage()
            .persistent()
            .get(&YieldDataKey::DepositCount(campaign_id))
            .unwrap_or(0);

        let mut total_withdrawn = 0i128;
        let mut total_yield = 0i128;

        // Withdraw all active deposits
        for milestone_id in 0..deposit_count {
            if let Some(mut deposit) = env
                .storage()
                .persistent()
                .get::<YieldDataKey, YieldDeposit>(&YieldDataKey::Deposit(
                    campaign_id,
                    milestone_id,
                ))
            {
                if deposit.status == YieldDepositStatus::Active {
                    total_withdrawn += deposit.amount;
                    total_yield += deposit.accrued_yield;
                    deposit.status = YieldDepositStatus::EmergencyWithdrawn;
                    env.storage()
                        .persistent()
                        .set(&YieldDataKey::Deposit(campaign_id, milestone_id), &deposit);
                }
            }
        }

        env.events().publish(
            (soroban_sdk::symbol_short!("emerg_wd"),),
            EmergencyWithdrawal {
                campaign_id,
                total_withdrawn,
                accrued_yield: total_yield,
                reason,
            },
        );

        Ok((total_withdrawn, total_yield))
    }

    /// Get yield configuration for a campaign.
    pub fn get_config(env: Env, campaign_id: u64) -> Option<CampaignYieldConfig> {
        env.storage()
            .persistent()
            .get(&YieldDataKey::Config(campaign_id))
    }

    /// Get yield deposit details for a milestone.
    pub fn get_deposit(env: Env, campaign_id: u64, milestone_id: u64) -> Option<YieldDeposit> {
        env.storage()
            .persistent()
            .get(&YieldDataKey::Deposit(campaign_id, milestone_id))
    }

    /// Set the default yield distribution rule.
    pub fn set_distribution_rule(
        env: Env,
        admin: Address,
        rule: YieldDistribution,
    ) -> Result<(), YieldError> {
        admin.require_auth();

        if rule.creator_share_bps + rule.backer_share_bps + rule.platform_fee_bps != 10000 {
            return Err(YieldError::InvalidDistribution);
        }

        env.storage()
            .persistent()
            .set(&YieldDataKey::DistributionRule, &rule);

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_enable_yield() {
        let env = Env::default();
        let contract_id = env.register_contract(None, YieldRouter);
        let client = YieldRouterClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let strategy = Address::generate(&env);
        let campaign_id = 1;

        client.enable_yield(
            &campaign_id,
            &creator,
            &strategy,
            &YieldStrategyType::BlendProtocol,
        );

        let config = client.get_config(&campaign_id).unwrap();
        assert_eq!(config.enabled, true);
        assert_eq!(config.campaign_id, campaign_id);
    }

    #[test]
    fn test_deposit_to_yield() {
        let env = Env::default();
        let contract_id = env.register_contract(None, YieldRouter);
        let client = YieldRouterClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let strategy = Address::generate(&env);
        let campaign_id = 1;
        let milestone_id = 0;

        client.enable_yield(
            &campaign_id,
            &creator,
            &strategy,
            &YieldStrategyType::BlendProtocol,
        );

        let amount = 1000000i128;
        let release_date = env.ledger().timestamp() + 86400 * 180; // 6 months

        client.deposit_to_yield(&campaign_id, &milestone_id, &amount, &release_date);

        let deposit = client.get_deposit(&campaign_id, &milestone_id).unwrap();
        assert_eq!(deposit.amount, amount);
        assert_eq!(deposit.milestone_id, milestone_id);
    }
}

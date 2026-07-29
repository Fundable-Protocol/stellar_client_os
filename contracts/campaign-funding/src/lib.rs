#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidDeadline = 5,
    CampaignNotFound = 6,
    CampaignNotActive = 7,
    DeadlineNotReached = 8,
    GoalAlreadyMet = 9,
    GoalNotMet = 10,
    AlreadyWithdrawn = 11,
    AlreadyRefunded = 12,
    ArithmeticOverflow = 13,
    DeadlineInPast = 14,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CampaignStatus {
    Active,
    Success,
    Expired,
}

#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub token: Address,
    pub goal_amount: i128,
    pub total_raised: i128,
    pub deadline: u64,
    pub status: CampaignStatus,
    pub withdrawn: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct Contribution {
    pub amount: i128,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct CampaignCreatedEvent {
    pub campaign_id: u64,
    pub creator: Address,
    pub token: Address,
    pub goal_amount: i128,
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct ContributionEvent {
    pub campaign_id: u64,
    pub contributor: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct CampaignClaimedEvent {
    pub campaign_id: u64,
    pub creator: Address,
    pub total_amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct RefundEvent {
    pub campaign_id: u64,
    pub contributor: Address,
    pub amount: i128,
}

const LEDGER_THRESHOLD: u32 = 518400;
const LEDGER_BUMP: u32 = 535680;

#[contract]
pub struct CampaignFundingContract;

#[contractimpl]
impl CampaignFundingContract {

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "campaign_counter"), &0u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    pub fn create_campaign(
        env: Env,
        creator: Address,
        token: Address,
        goal_amount: i128,
        deadline: u64,
    ) -> u64 {
        creator.require_auth();

        if goal_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if deadline <= current_time {
            panic_with_error!(&env, Error::DeadlineInPast);
        }

        let mut counter: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "campaign_counter"))
            .unwrap_or(0);
        let campaign_id = counter + 1;
        counter += 1;
        env.storage().instance().set(&Symbol::new(&env, "campaign_counter"), &counter);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        let campaign = Campaign {
            id: campaign_id,
            creator: creator.clone(),
            token: token.clone(),
            goal_amount,
            total_raised: 0,
            deadline,
            status: CampaignStatus::Active,
            withdrawn: false,
        };

        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (Symbol::new(&env, "campaign_created"), campaign_id),
            CampaignCreatedEvent {
                campaign_id,
                creator,
                token,
                goal_amount,
                deadline,
            },
        );

        campaign_id
    }

    pub fn contribute(env: Env, campaign_id: u64, contributor: Address, amount: i128) {
        contributor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut campaign: Campaign = env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }

        let current_time = env.ledger().timestamp();
        if current_time >= campaign.deadline {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(&contributor, &env.current_contract_address(), &amount);

        let contribution_key = (campaign_id, contributor.clone());
        let mut contribution: Contribution = env.storage().persistent()
            .get(&contribution_key)
            .unwrap_or(Contribution { amount: 0, refunded: false });

        contribution.amount = contribution.amount.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        contribution.refunded = false;

        campaign.total_raised = campaign.total_raised.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        env.storage().persistent().set(&contribution_key, &contribution);
        env.storage().persistent().extend_ttl(&contribution_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (Symbol::new(&env, "contribution"), campaign_id),
            ContributionEvent {
                campaign_id,
                contributor,
                amount,
            },
        );
    }

    pub fn claim(env: Env, campaign_id: u64) {
        let mut campaign: Campaign = env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        campaign.creator.require_auth();

        if campaign.withdrawn {
            panic_with_error!(&env, Error::AlreadyWithdrawn);
        }

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }

        let current_time = env.ledger().timestamp();
        if current_time < campaign.deadline {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        if campaign.total_raised < campaign.goal_amount {
            panic_with_error!(&env, Error::GoalNotMet);
        }

        if campaign.total_raised > 0 {
            let token_client = token::Client::new(&env, &campaign.token);
            token_client.transfer(
                &env.current_contract_address(),
                &campaign.creator,
                &campaign.total_raised,
            );
        }

        campaign.status = CampaignStatus::Success;
        campaign.withdrawn = true;

        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (Symbol::new(&env, "campaign_claimed"), campaign_id),
            CampaignClaimedEvent {
                campaign_id,
                creator: campaign.creator,
                total_amount: campaign.total_raised,
            },
        );
    }

    pub fn refund(env: Env, campaign_id: u64, contributor: Address) {
        let campaign: Campaign = env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        let current_time = env.ledger().timestamp();
        if current_time < campaign.deadline {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        if campaign.total_raised >= campaign.goal_amount {
            panic_with_error!(&env, Error::GoalAlreadyMet);
        }

        let contribution_key = (campaign_id, contributor.clone());
        let mut contribution: Contribution = env.storage().persistent()
            .get(&contribution_key)
            .unwrap_or(Contribution { amount: 0, refunded: false });

        if contribution.refunded {
            panic_with_error!(&env, Error::AlreadyRefunded);
        }

        if contribution.amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let token_client = token::Client::new(&env, &campaign.token);
        token_client.transfer(
            &env.current_contract_address(),
            &contributor,
            &contribution.amount,
        );

        contribution.refunded = true;

        env.storage().persistent().set(&contribution_key, &contribution);
        env.storage().persistent().extend_ttl(&contribution_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (Symbol::new(&env, "refund"), campaign_id),
            RefundEvent {
                campaign_id,
                contributor,
                amount: contribution.amount,
            },
        );
    }

    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }

    pub fn get_contribution(env: Env, campaign_id: u64, contributor: Address) -> Option<Contribution> {
        env.storage().persistent()
            .get(&(campaign_id, contributor))
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&Symbol::new(&env, "admin"))
    }
}

#[cfg(test)]
mod test;

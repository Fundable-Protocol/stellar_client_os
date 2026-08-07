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
    DeadlineTooFar = 15,
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
pub struct CampaignExpiredEvent {
    pub campaign_id: u64,
    pub deadline: u64,
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
const MAX_TTL: u32 = 6312000;
const SECONDS_PER_LEDGER: u64 = 5;
/// Upper bound for (deadline - now) that the TTL system can retain.
/// ~365 days at 5 s/ledger.
const MAX_DEADLINE_DELTA: u64 = (MAX_TTL as u64) * SECONDS_PER_LEDGER;

#[contract]
pub struct CampaignFundingContract;

#[contractimpl]
impl CampaignFundingContract {

    /// Initialise the contract with an admin address.
    /// Must be called exactly once before any other operations.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "campaign_counter"), &0u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Ensure the contract has been initialised before accessing shared state.
    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&Symbol::new(env, "admin")) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    /// Compute a TTL (threshold, bump) pair proportional to the campaign deadline.
    /// Short campaigns get at least the minimum LEDGER_THRESHOLD/LEDGER_BUMP;
    /// long campaigns scale up so the entry survives until the deadline plus a margin.
    fn campaign_ttl(env: &Env, deadline: u64) -> (u32, u32) {
        let current_time = env.ledger().timestamp();
        let duration = deadline.saturating_sub(current_time);
        let deadline_ledgers = (duration / SECONDS_PER_LEDGER) as u32;
        let threshold = deadline_ledgers.saturating_add(LEDGER_THRESHOLD).min(MAX_TTL - LEDGER_BUMP);
        let bump = threshold.saturating_add(LEDGER_BUMP).min(MAX_TTL);
        (threshold, bump)
    }

    /// Create a new campaign.
    /// `creator` is the address that will receive funds if the goal is met.
    /// `token` is the Stellar asset used for contributions.
    /// `goal_amount` is the minimum amount (in token units) that must be raised before the deadline.
    /// `deadline` is the Unix timestamp after which the campaign closes.
    /// Returns the newly created campaign ID.
    pub fn create_campaign(
        env: Env,
        creator: Address,
        token: Address,
        goal_amount: i128,
        deadline: u64,
    ) -> u64 {
        Self::require_initialized(&env);
        creator.require_auth();

        if goal_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if deadline <= current_time {
            panic_with_error!(&env, Error::DeadlineInPast);
        }

        // Reject deadlines too far in the future for the TTL system to retain
        if deadline.saturating_sub(current_time) > MAX_DEADLINE_DELTA {
            panic_with_error!(&env, Error::DeadlineTooFar);
        }

        let mut counter: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "campaign_counter"))
            .unwrap_or(0);
        let campaign_id = counter + 1;
        counter += 1;
        env.storage().instance().set(&Symbol::new(&env, "campaign_counter"), &counter);

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

        let (ttl, bump) = Self::campaign_ttl(&env, deadline);
        // Extend instance storage so admin and counter survive alongside the campaign
        env.storage().instance().extend_ttl(ttl, bump);
        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, ttl, bump);

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

    /// Contribute `amount` tokens to an active campaign.
    /// Transfers tokens from `contributor` to the contract escrow.
    /// Reverts if the campaign has already ended (deadline passed or status changed).
    pub fn contribute(env: Env, campaign_id: u64, contributor: Address, amount: i128) {
        Self::require_initialized(&env);
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
            panic_with_error!(&env, Error::CampaignNotActive);
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

        let (ttl, bump) = Self::campaign_ttl(&env, campaign.deadline);
        env.storage().persistent().set(&contribution_key, &contribution);
        env.storage().persistent().extend_ttl(&contribution_key, ttl, bump);

        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, ttl, bump);

        env.events().publish(
            (Symbol::new(&env, "contribution"), campaign_id),
            ContributionEvent {
                campaign_id,
                contributor,
                amount,
            },
        );
    }

    /// Claim the funds as the campaign creator.
    /// Only succeeds after the deadline if `total_raised >= goal_amount`.
    /// Transfers the entire escrowed balance to the creator.
    pub fn claim(env: Env, campaign_id: u64) {
        Self::require_initialized(&env);
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

        let (ttl, bump) = Self::campaign_ttl(&env, campaign.deadline);
        env.storage().persistent().set(&campaign_id, &campaign);
        env.storage().persistent().extend_ttl(&campaign_id, ttl, bump);

        env.events().publish(
            (Symbol::new(&env, "campaign_claimed"), campaign_id),
            CampaignClaimedEvent {
                campaign_id,
                creator: campaign.creator,
                total_amount: campaign.total_raised,
            },
        );
    }

    /// Request a refund for a specific `contributor`.
    /// Anyone may call this — no authorisation is required from the contributor.
    /// Refunds are only available after the deadline when `total_raised < goal_amount`.
    pub fn refund(env: Env, campaign_id: u64, contributor: Address) {
        Self::require_initialized(&env);
        let mut campaign: Campaign = env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        let current_time = env.ledger().timestamp();
        if current_time < campaign.deadline {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        if campaign.total_raised >= campaign.goal_amount {
            panic_with_error!(&env, Error::GoalAlreadyMet);
        }

        // Mark the campaign as expired so consumers see the definitive state
        if campaign.status == CampaignStatus::Active {
            campaign.status = CampaignStatus::Expired;

            let (ttl, bump) = Self::campaign_ttl(&env, campaign.deadline);
            env.storage().persistent().set(&campaign_id, &campaign);
            env.storage().persistent().extend_ttl(&campaign_id, ttl, bump);

            env.events().publish(
                (Symbol::new(&env, "campaign_expired"), campaign_id),
                CampaignExpiredEvent {
                    campaign_id,
                    deadline: campaign.deadline,
                },
            );
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

        let (ttl, bump) = Self::campaign_ttl(&env, campaign.deadline);
        env.storage().persistent().set(&contribution_key, &contribution);
        env.storage().persistent().extend_ttl(&contribution_key, ttl, bump);

        env.events().publish(
            (Symbol::new(&env, "refund"), campaign_id),
            RefundEvent {
                campaign_id,
                contributor,
                amount: contribution.amount,
            },
        );
    }

    /// Return the full `Campaign` struct for `campaign_id`.
    /// Panics with `CampaignNotFound` if no such campaign exists.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        env.storage().persistent()
            .get(&campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }

    /// Return the `Contribution` for `(campaign_id, contributor)`, or `None`.
    pub fn get_contribution(env: Env, campaign_id: u64, contributor: Address) -> Option<Contribution> {
        env.storage().persistent()
            .get(&(campaign_id, contributor))
    }

    /// Return the admin address, or `None` if the contract is not initialised.
    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&Symbol::new(&env, "admin"))
    }
}

#[cfg(test)]
mod test;

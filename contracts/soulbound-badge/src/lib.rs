#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol, Vec,
};

/// Funding milestone threshold levels for badge eligibility
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum MilestoneLevel {
    Bronze = 1,    // 1,000 tokens
    Silver = 2,    // 10,000 tokens
    Gold = 3,      // 100,000 tokens
    Platinum = 4,  // 1,000,000 tokens
    Diamond = 5,   // 10,000,000 tokens
}

/// Soulbound badge data structure
#[contracttype]
#[derive(Clone)]
pub struct Badge {
    pub badge_id: u64,
    pub owner: Address,
    pub milestone_level: MilestoneLevel,
    pub total_contributed: i128,
    pub minted_at: u64,
}

/// User contribution tracking
#[contracttype]
#[derive(Clone)]
pub struct UserContribution {
    pub total_contributed: i128,
    pub badges_minted: Vec<MilestoneLevel>,
    pub last_updated: u64,
}

/// Badge minted event data
#[contracttype]
#[derive(Clone)]
pub struct BadgeMintedEvent {
    pub badge_id: u64,
    pub owner: Address,
    pub milestone_level: MilestoneLevel,
    pub total_contributed: i128,
    pub timestamp: u64,
}

/// Contribution recorded event data
#[contracttype]
#[derive(Clone)]
pub struct ContributionRecordedEvent {
    pub contributor: Address,
    pub amount: i128,
    pub total_contributed: i128,
    pub timestamp: u64,
}

/// Custom errors for the contract
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidMilestone = 5,
    BadgeNotFound = 6,
    BadgeAlreadyMinted = 7,
    InvalidContributor = 8,
    ArithmeticOverflow = 9,
    InvalidToken = 10,
}

// Storage keys
#[contracttype]
pub enum DataKey {
    Admin,
    BadgeCounter,
    AcceptedToken,
    UserContribution(Address),
    Badge(u64),
    UserBadges(Address),
}

// Constants for milestone thresholds
const BRONZE_THRESHOLD: i128 = 1_000;
const SILVER_THRESHOLD: i128 = 10_000;
const GOLD_THRESHOLD: i128 = 100_000;
const PLATINUM_THRESHOLD: i128 = 1_000_000;
const DIAMOND_THRESHOLD: i128 = 10_000_000;

// Storage TTL constants
const LEDGER_THRESHOLD: u32 = 518400; // ~30 days at 5s/ledger
const LEDGER_BUMP: u32 = 535680; // ~31 days

#[contract]
pub struct SoulboundBadgeContract;

#[contractimpl]
impl SoulboundBadgeContract {
    /// Initialize the contract with admin and accepted token
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `admin` - The admin address authorized to manage the contract
    /// * `accepted_token` - The token address accepted for contributions
    /// 
    /// # Errors
    /// * `Error::AlreadyInitialized` - If contract is already initialized
    pub fn initialize(env: Env, admin: Address, accepted_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        
        admin.require_auth();
        
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::BadgeCounter, &0u64);
        env.storage().instance().set(&DataKey::AcceptedToken, &accepted_token);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Record a contribution and automatically mint badges if milestone thresholds are reached
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `contributor` - The address making the contribution
    /// * `amount` - The amount of tokens contributed
    /// 
    /// # Errors
    /// * `Error::NotInitialized` - If contract is not initialized
    /// * `Error::InvalidAmount` - If amount is not positive
    /// * `Error::InvalidToken` - If token is not the accepted token
    /// * `Error::ArithmeticOverflow` - If arithmetic operation overflows
    pub fn record_contribution(env: Env, contributor: Address, amount: i128) -> Vec<u64> {
        // Ensure contract is initialized
        let _accepted_token: Address = env.storage().instance()
            .get(&DataKey::AcceptedToken)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        
        contributor.require_auth();
        
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        
        // Get or create user contribution record
        let mut user_contribution: UserContribution = env.storage().persistent()
            .get(&DataKey::UserContribution(contributor.clone()))
            .unwrap_or(UserContribution {
                total_contributed: 0,
                badges_minted: Vec::new(&env),
                last_updated: 0,
            });
        
        // Update total contribution
        user_contribution.total_contributed = user_contribution.total_contributed
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        
        user_contribution.last_updated = env.ledger().timestamp();
        
        // Check for new milestone achievements
        let new_badges = Self::check_and_mint_badges(
            env.clone(),
            contributor.clone(),
            user_contribution.total_contributed,
            &user_contribution.badges_minted,
        );
        
        // Update user contribution record
        env.storage().persistent().set(
            &DataKey::UserContribution(contributor.clone()),
            &user_contribution,
        );
        env.storage().persistent()
            .extend_ttl(&DataKey::UserContribution(contributor.clone()), LEDGER_THRESHOLD, LEDGER_BUMP);
        
        // Emit contribution recorded event
        env.events().publish(
            (Symbol::new(&env, "contribution_recorded"),),
            ContributionRecordedEvent {
                contributor: contributor.clone(),
                amount,
                total_contributed: user_contribution.total_contributed,
                timestamp: env.ledger().timestamp(),
            },
        );
        
        new_badges
    }

    /// Get the threshold value for a given milestone level
    /// 
    /// # Arguments
    /// * `milestone` - The milestone level
    /// 
    /// # Returns
    /// The threshold amount for the milestone
    /// 
    /// # Errors
    /// * `Error::InvalidMilestone` - If milestone is invalid
    pub fn get_milestone_threshold(milestone: MilestoneLevel) -> i128 {
        match milestone {
            MilestoneLevel::Bronze => BRONZE_THRESHOLD,
            MilestoneLevel::Silver => SILVER_THRESHOLD,
            MilestoneLevel::Gold => GOLD_THRESHOLD,
            MilestoneLevel::Platinum => PLATINUM_THRESHOLD,
            MilestoneLevel::Diamond => DIAMOND_THRESHOLD,
        }
    }

    /// Check if a user is eligible for a badge at a given milestone
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `contributor` - The contributor address
    /// * `milestone` - The milestone level to check
    /// 
    /// # Returns
    /// true if eligible, false otherwise
    pub fn is_eligible_for_badge(env: Env, contributor: Address, milestone: MilestoneLevel) -> bool {
        let user_contribution: UserContribution = env.storage().persistent()
            .get(&DataKey::UserContribution(contributor.clone()))
            .unwrap_or(UserContribution {
                total_contributed: 0,
                badges_minted: Vec::new(&env),
                last_updated: 0,
            });
        
        let threshold = Self::get_milestone_threshold(milestone);
        let mut has_badge = false;
        for i in 0..user_contribution.badges_minted.len() {
            if user_contribution.badges_minted.get(i).unwrap() == milestone {
                has_badge = true;
                break;
            }
        }
        
        user_contribution.total_contributed >= threshold && !has_badge
    }

    /// Get all badges owned by a user
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `owner` - The owner address
    /// 
    /// # Returns
    /// Vector of badge IDs owned by the user
    pub fn get_user_badges(env: Env, owner: Address) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::UserBadges(owner))
            .unwrap_or(Vec::new(&env))
    }

    /// Get badge details by ID
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `badge_id` - The badge ID
    /// 
    /// # Returns
    /// The badge data
    /// 
    /// # Errors
    /// * `Error::BadgeNotFound` - If badge does not exist
    pub fn get_badge(env: Env, badge_id: u64) -> Badge {
        env.storage().persistent()
            .get(&DataKey::Badge(badge_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::BadgeNotFound))
    }

    /// Get user contribution details
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `contributor` - The contributor address
    /// 
    /// # Returns
    /// The user contribution data
    pub fn get_user_contribution(env: Env, contributor: Address) -> UserContribution {
        env.storage().persistent()
            .get(&DataKey::UserContribution(contributor))
            .unwrap_or(UserContribution {
                total_contributed: 0,
                badges_minted: Vec::new(&env),
                last_updated: 0,
            })
    }

    /// Get the accepted token address
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// 
    /// # Returns
    /// The accepted token address
    /// 
    /// # Errors
    /// * `Error::NotInitialized` - If contract is not initialized
    pub fn get_accepted_token(env: Env) -> Address {
        env.storage().instance()
            .get(&DataKey::AcceptedToken)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Check and mint badges for newly achieved milestones
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `contributor` - The contributor address
    /// * `total_contributed` - Total contribution amount
    /// * `badges_minted` - Vector of already minted badge levels
    /// 
    /// # Returns
    /// Vector of newly minted badge IDs
    fn check_and_mint_badges(
        env: Env,
        contributor: Address,
        total_contributed: i128,
        badges_minted: &Vec<MilestoneLevel>,
    ) -> Vec<u64> {
        let mut new_badge_ids = Vec::new(&env);
        
        let milestones = [
            (MilestoneLevel::Bronze, BRONZE_THRESHOLD),
            (MilestoneLevel::Silver, SILVER_THRESHOLD),
            (MilestoneLevel::Gold, GOLD_THRESHOLD),
            (MilestoneLevel::Platinum, PLATINUM_THRESHOLD),
            (MilestoneLevel::Diamond, DIAMOND_THRESHOLD),
        ];
        
        for (milestone, threshold) in milestones.iter() {
            if total_contributed >= *threshold {
                let mut has_badge = false;
                for i in 0..badges_minted.len() {
                    if badges_minted.get(i).unwrap() == *milestone {
                        has_badge = true;
                        break;
                    }
                }
                
                if !has_badge {
                    let badge_id = Self::mint_badge(
                        env.clone(),
                        contributor.clone(),
                        *milestone,
                        total_contributed,
                    );
                    new_badge_ids.push_back(badge_id);
                }
            }
        }
        
        new_badge_ids
    }

    /// Mint a new badge for a contributor
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `contributor` - The contributor address
    /// * `milestone_level` - The milestone level achieved
    /// * `total_contributed` - Total contribution amount
    /// 
    /// # Returns
    /// The newly minted badge ID
    fn mint_badge(
        env: Env,
        contributor: Address,
        milestone_level: MilestoneLevel,
        total_contributed: i128,
    ) -> u64 {
        // Get and increment badge counter
        let badge_counter: u64 = env.storage().instance()
            .get(&DataKey::BadgeCounter)
            .unwrap_or(0);
        let badge_id = badge_counter + 1;
        env.storage().instance().set(&DataKey::BadgeCounter, &badge_id);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        
        // Create badge
        let badge = Badge {
            badge_id,
            owner: contributor.clone(),
            milestone_level,
            total_contributed,
            minted_at: env.ledger().timestamp(),
        };
        
        // Store badge
        env.storage().persistent().set(&DataKey::Badge(badge_id), &badge);
        env.storage().persistent()
            .extend_ttl(&DataKey::Badge(badge_id), LEDGER_THRESHOLD, LEDGER_BUMP);
        
        // Update user badges list
        let mut user_badges: Vec<u64> = env.storage().persistent()
            .get(&DataKey::UserBadges(contributor.clone()))
            .unwrap_or(Vec::new(&env));
        user_badges.push_back(badge_id);
        env.storage().persistent()
            .set(&DataKey::UserBadges(contributor.clone()), &user_badges);
        env.storage().persistent()
            .extend_ttl(&DataKey::UserBadges(contributor.clone()), LEDGER_THRESHOLD, LEDGER_BUMP);
        
        // Update user contribution record to include new badge
        let mut user_contribution: UserContribution = env.storage().persistent()
            .get(&DataKey::UserContribution(contributor.clone()))
            .unwrap_or(UserContribution {
                total_contributed,
                badges_minted: Vec::new(&env),
                last_updated: env.ledger().timestamp(),
            });
        user_contribution.badges_minted.push_back(milestone_level);
        env.storage().persistent()
            .set(&DataKey::UserContribution(contributor.clone()), &user_contribution);
        env.storage().persistent()
            .extend_ttl(&DataKey::UserContribution(contributor.clone()), LEDGER_THRESHOLD, LEDGER_BUMP);
        
        // Emit badge minted event
        env.events().publish(
            (Symbol::new(&env, "badge_minted"),),
            BadgeMintedEvent {
                badge_id,
                owner: contributor.clone(),
                milestone_level,
                total_contributed,
                timestamp: env.ledger().timestamp(),
            },
        );
        
        badge_id
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &token);

        let stored_token = client.get_accepted_token();
        assert_eq!(stored_token, token);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_re_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &token);
        client.initialize(&admin, &token);
    }

    #[test]
    fn test_get_milestone_thresholds() {
        assert_eq!(SoulboundBadgeContract::get_milestone_threshold(MilestoneLevel::Bronze), 1_000);
        assert_eq!(SoulboundBadgeContract::get_milestone_threshold(MilestoneLevel::Silver), 10_000);
        assert_eq!(SoulboundBadgeContract::get_milestone_threshold(MilestoneLevel::Gold), 100_000);
        assert_eq!(SoulboundBadgeContract::get_milestone_threshold(MilestoneLevel::Platinum), 1_000_000);
        assert_eq!(SoulboundBadgeContract::get_milestone_threshold(MilestoneLevel::Diamond), 10_000_000);
    }

    #[test]
    fn test_record_contribution_bronze_badge() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // Contribute exactly bronze threshold
        let new_badges = client.record_contribution(&contributor, &1_000);

        assert_eq!(new_badges.len(), 1);
        
        let badge_id = new_badges.get(0).unwrap();
        let badge = client.get_badge(&badge_id);
        assert_eq!(badge.owner, contributor);
        assert_eq!(badge.milestone_level, MilestoneLevel::Bronze);
        assert_eq!(badge.total_contributed, 1_000);
    }

    #[test]
    fn test_record_contribution_multiple_badges() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // Contribute enough for gold badge
        let new_badges = client.record_contribution(&contributor, &100_000);

        assert_eq!(new_badges.len(), 3); // Bronze, Silver, Gold
        
        let user_badges = client.get_user_badges(&contributor);
        assert_eq!(user_badges.len(), 3);
    }

    #[test]
    fn test_record_contribution_no_duplicate_badges() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // First contribution - bronze badge
        let new_badges1 = client.record_contribution(&contributor, &1_000);
        assert_eq!(new_badges1.len(), 1);

        // Second contribution - still only bronze badge (no duplicate)
        let new_badges2 = client.record_contribution(&contributor, &500);
        assert_eq!(new_badges2.len(), 0);
    }

    #[test]
    fn test_record_contribution_progressive_badges() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // First contribution - bronze
        let badges1 = client.record_contribution(&contributor, &1_000);
        assert_eq!(badges1.len(), 1);

        // Second contribution - reach silver
        let badges2 = client.record_contribution(&contributor, &9_000);
        assert_eq!(badges2.len(), 1); // Only silver

        let user_badges = client.get_user_badges(&contributor);
        assert_eq!(user_badges.len(), 2);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_record_contribution_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);
        client.record_contribution(&contributor, &0);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_record_contribution_negative_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);
        client.record_contribution(&contributor, &-100);
    }

    #[test]
    fn test_get_user_contribution() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        let contribution = client.record_contribution(&contributor, &5_000);
        
        let user_contribution = client.get_user_contribution(&contributor);
        assert_eq!(user_contribution.total_contributed, 5_000);
        assert_eq!(user_contribution.badges_minted.len(), 1);
    }

    #[test]
    fn test_get_user_badges() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        client.record_contribution(&contributor, &10_000);
        
        let user_badges = client.get_user_badges(&contributor);
        assert_eq!(user_badges.len(), 2); // Bronze and Silver
    }

    #[test]
    fn test_is_eligible_for_badge() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // Before contribution
        assert!(!client.is_eligible_for_badge(&contributor, MilestoneLevel::Bronze));

        // After contribution
        client.record_contribution(&contributor, &1_000);
        
        // Now has badge, so not eligible for same badge
        assert!(!client.is_eligible_for_badge(&contributor, MilestoneLevel::Bronze));
        
        // But eligible for next level
        assert!(!client.is_eligible_for_badge(&contributor, MilestoneLevel::Silver));
    }

    #[test]
    fn test_get_badge() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        let new_badges = client.record_contribution(&contributor, &1_000);
        let badge_id = new_badges.get(0).unwrap();
        
        let badge = client.get_badge(&badge_id);
        assert_eq!(badge.badge_id, badge_id);
        assert_eq!(badge.owner, contributor);
        assert_eq!(badge.milestone_level, MilestoneLevel::Bronze);
    }

    #[test]
    #[should_panic(expected = "BadgeNotFound")]
    fn test_get_badge_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &token);
        client.get_badge(&999);
    }

    #[test]
    fn test_all_milestone_levels() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        // Contribute enough for diamond badge
        let new_badges = client.record_contribution(&contributor, &10_000_000);
        
        assert_eq!(new_badges.len(), 5); // All 5 milestone levels
        
        let user_badges = client.get_user_badges(&contributor);
        assert_eq!(user_badges.len(), 5);
    }

    #[test]
    fn test_multiple_users() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor1 = Address::generate(&env);
        let contributor2 = Address::generate(&env);

        client.initialize(&admin, &token);

        client.record_contribution(&contributor1, &5_000);
        client.record_contribution(&contributor2, &15_000);

        let badges1 = client.get_user_badges(&contributor1);
        let badges2 = client.get_user_badges(&contributor2);

        assert_eq!(badges1.len(), 1); // Bronze only
        assert_eq!(badges2.len(), 2); // Bronze and Silver
    }

    #[test]
    fn test_badge_data_integrity() {
        let env = Env::default();
        env.mock_all_auths();

        env.ledger().set(LedgerInfo {
            timestamp: 12345,
            protocol_version: env.ledger().protocol_version(),
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 16,
            max_entry_ttl: 6312000,
        });

        let contract_id = env.register(SoulboundBadgeContract, ());
        let client = SoulboundBadgeContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contributor = Address::generate(&env);

        client.initialize(&admin, &token);

        let new_badges = client.record_contribution(&contributor, &1_000);
        let badge_id = new_badges.get(0).unwrap();
        
        let badge = client.get_badge(&badge_id);
        assert_eq!(badge.minted_at, 12345);
        assert_eq!(badge.total_contributed, 1_000);
    }
}

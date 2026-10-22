#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String, Vec,
};

/// Voting window duration: 5 days in seconds (5 * 24 * 60 * 60).
pub const VOTING_WINDOW_SECS: u64 = 432_000;

/// Escrow lifecycle states for a campaign.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    /// Campaign is active and accepting funds.
    Active,
    /// Campaign closed successfully; funds held in escrow.
    Closed,
    /// A dispute has been filed; funds are frozen pending resolution.
    Disputed,
    /// Funds have been refunded (partially or fully).
    Refunded,
    /// Funds have been released to the creator.
    Released,
}

/// Lifecycle states for an individual milestone deliverable.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    /// Milestone created, deliverables not yet submitted.
    Pending,
    /// Creator submitted proof; 5-day voting window is open.
    Voting,
    /// Backers approved milestone deliverable (>60% approval quorum).
    Approved,
    /// Funds released to creator after passing vote.
    Released,
    /// Milestone deliverable rejected by backers.
    Rejected,
    /// Deliverable disputed; funds frozen pending mediation/arbitration.
    Disputed,
}

/// Type of refund issued by a mediator.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RefundType {
    /// Only a portion of the escrow is refunded.
    Partial,
    /// The entire remaining escrow is refunded.
    Full,
}

/// Milestone proof deliverables submitted on-chain by the creator.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneProof {
    /// Demo link (e.g. staging URL, video walkthrough, app build).
    pub demo_link: String,
    /// Git commit hash demonstrating codebase deliverables.
    pub commit_hash: String,
    /// Audit report URL or summary proving code/security audit.
    pub audit_report: String,
}

/// Milestone record holding allocation, proof, and voting tally.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub milestone_id: u32,
    pub amount: i128,
    pub status: MilestoneStatus,
    pub has_proof: bool,
    pub voting_start: u64,
    pub voting_end: u64,
    pub votes_for: i128,
    pub votes_against: i128,
    pub released: bool,
}

/// Errors returned by the escrow contract.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    /// The campaign does not exist.
    CampaignNotFound = 1,
    /// The caller is not authorized to perform this action.
    Unauthorized = 2,
    /// The escrow is not in the required state for this action.
    InvalidState = 3,
    /// The requested refund or payout exceeds the remaining escrow balance.
    InsufficientEscrow = 4,
    /// The amount is invalid (zero or negative).
    InvalidAmount = 5,
    /// The requested milestone was not found.
    MilestoneNotFound = 6,
    /// A milestone with this ID already exists for the campaign.
    MilestoneAlreadyExists = 7,
    /// The 5-day voting window has expired.
    VotingPeriodExpired = 8,
    /// The 5-day voting window is still active; cannot resolve yet.
    VotingPeriodActive = 9,
    /// Backer has already cast a vote for this milestone.
    AlreadyVoted = 10,
    /// Caller has no recorded pledge weight for this campaign.
    NoPledgeFound = 11,
    /// The milestone vote did not reach the >60% approval quorum.
    QuorumNotReached = 12,
    /// Milestone proof submitted is invalid or empty.
    EmptyProof = 13,
}

/// Storage keys used by the contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Address of the platform mediator/admin.
    Mediator,
    /// Legacy/global address of campaign creator.
    Creator,
    /// Campaign creator address keyed by campaign ID.
    CampaignCreator(u64),
    /// Address of the token held in escrow.
    Token,
    /// Current escrow status for a campaign.
    Status(u64),
    /// Remaining escrow balance for a campaign.
    Balance(u64),
    /// Total pledge weight registered for a campaign.
    TotalPledged(u64),
    /// Backer pledge weight keyed by `(campaign_id, backer)`.
    Pledge(u64, Address),
    /// Milestone struct keyed by `(campaign_id, milestone_id)`.
    Milestone(u64, u32),
    /// Milestone proof keyed by `(campaign_id, milestone_id)`.
    MilestoneProof(u64, u32),
    /// List of milestone IDs configured for a campaign.
    Milestones(u64),
    /// HasVoted marker keyed by `(campaign_id, milestone_id, backer)`.
    HasVoted(u64, u32, Address),
}

/// Event emitted when a refund is issued.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundIssued {
    #[topic]
    pub campaign_id: u64,
    pub refund_amount: i128,
    pub refund_type: RefundType,
    pub remaining_balance: i128,
}

/// Event emitted when a backer deposits or registers a pledge.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PledgeDeposited {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub backer: Address,
    pub amount: i128,
    pub total_pledged: i128,
}

/// Event emitted when a new milestone is configured.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneCreated {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub milestone_id: u32,
    pub amount: i128,
}

/// Event emitted when a creator submits milestone proof deliverables on-chain.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneProofSubmitted {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub milestone_id: u32,
    pub demo_link: String,
    pub commit_hash: String,
    pub audit_report: String,
    pub voting_end: u64,
}

/// Event emitted when a backer casts a weighted vote on a milestone.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneVoteCast {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub backer: Address,
    pub approve: bool,
    pub weight: i128,
}

/// Event emitted when milestone funds are automatically released to the creator.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneFundsReleased {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub milestone_id: u32,
    pub creator: Address,
    pub amount: i128,
    pub remaining_balance: i128,
}

/// Event emitted when a milestone vote is rejected and escalated to dispute.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneDisputed {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub milestone_id: u32,
    pub reason: String,
}

#[contract]
pub struct CampaignEscrow;

#[contractimpl]
impl CampaignEscrow {
    /// Initialize the contract with the platform mediator and token.
    pub fn initialize(env: Env, mediator: Address, token: Address) -> Result<(), EscrowError> {
        env.storage().instance().set(&DataKey::Mediator, &mediator);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Register a new campaign escrow.
    pub fn create_campaign(
        env: Env,
        campaign_id: u64,
        creator: Address,
        initial_balance: i128,
    ) -> Result<(), EscrowError> {
        env.storage()
            .persistent()
            .set(&DataKey::Creator, &creator);
        env.storage()
            .persistent()
            .set(&DataKey::CampaignCreator(campaign_id), &creator);
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Active);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &initial_balance);
        Ok(())
    }

    /// Configure a milestone payout tranche for a campaign.
    pub fn add_milestone(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
        amount: i128,
    ) -> Result<(), EscrowError> {
        let creator = Self::get_creator(&env, campaign_id)?;
        creator.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let balance = Self::get_balance_internal(&env, campaign_id)?;
        if amount > balance {
            return Err(EscrowError::InsufficientEscrow);
        }

        let milestone_key = DataKey::Milestone(campaign_id, milestone_id);
        if env.storage().persistent().has(&milestone_key) {
            return Err(EscrowError::MilestoneAlreadyExists);
        }

        let milestone = Milestone {
            milestone_id,
            amount,
            status: MilestoneStatus::Pending,
            has_proof: false,
            voting_start: 0,
            voting_end: 0,
            votes_for: 0,
            votes_against: 0,
            released: false,
        };

        env.storage().persistent().set(&milestone_key, &milestone);

        let mut list: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::Milestones(campaign_id))
            .unwrap_or(Vec::new(&env));
        list.push_back(milestone_id);
        env.storage()
            .persistent()
            .set(&DataKey::Milestones(campaign_id), &list);

        MilestoneCreated {
            campaign_id,
            milestone_id,
            amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Backer deposits a pledge, transferring tokens to escrow and gaining voting weight.
    pub fn pledge(
        env: Env,
        campaign_id: u64,
        backer: Address,
        amount: i128,
    ) -> Result<(), EscrowError> {
        backer.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        // Verify campaign exists
        let current_balance = Self::get_balance_internal(&env, campaign_id)?;

        // If a token is configured, transfer tokens from backer to contract
        if let Some(token_addr) = env.storage().instance().get::<DataKey, Address>(&DataKey::Token) {
            let token_client = token::Client::new(&env, &token_addr);
            token_client.transfer(&backer, &env.current_contract_address(), &amount);
        }

        // Increment backer pledge
        let existing_pledge = Self::get_pledge_internal(&env, campaign_id, &backer);
        let new_pledge = existing_pledge.saturating_add(amount);
        env.storage()
            .persistent()
            .set(&DataKey::Pledge(campaign_id, backer.clone()), &new_pledge);

        // Increment total pledged
        let total_pledged = Self::get_total_pledged_internal(&env, campaign_id).saturating_add(amount);
        env.storage()
            .persistent()
            .set(&DataKey::TotalPledged(campaign_id), &total_pledged);

        // Update campaign balance
        let new_balance = current_balance.saturating_add(amount);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &new_balance);

        PledgeDeposited {
            campaign_id,
            backer,
            amount,
            total_pledged,
        }
        .publish(&env);

        Ok(())
    }

    /// Record backer pledge voting weight without token transfer (creator auth).
    pub fn record_pledge(
        env: Env,
        campaign_id: u64,
        backer: Address,
        amount: i128,
    ) -> Result<(), EscrowError> {
        let creator = Self::get_creator(&env, campaign_id)?;
        creator.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        // Ensure campaign exists
        Self::get_balance_internal(&env, campaign_id)?;

        let existing_pledge = Self::get_pledge_internal(&env, campaign_id, &backer);
        let new_pledge = existing_pledge.saturating_add(amount);
        env.storage()
            .persistent()
            .set(&DataKey::Pledge(campaign_id, backer.clone()), &new_pledge);

        let total_pledged = Self::get_total_pledged_internal(&env, campaign_id).saturating_add(amount);
        env.storage()
            .persistent()
            .set(&DataKey::TotalPledged(campaign_id), &total_pledged);

        PledgeDeposited {
            campaign_id,
            backer,
            amount,
            total_pledged,
        }
        .publish(&env);

        Ok(())
    }

    /// Creator submits milestone proof (demo link, commit hash, audit report) on-chain.
    /// This opens the 5-day voting window for backers.
    pub fn submit_milestone_proof(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
        demo_link: String,
        commit_hash: String,
        audit_report: String,
    ) -> Result<(), EscrowError> {
        let creator = Self::get_creator(&env, campaign_id)?;
        creator.require_auth();

        if demo_link.len() == 0 || commit_hash.len() == 0 || audit_report.len() == 0 {
            return Err(EscrowError::EmptyProof);
        }

        let mut milestone = Self::get_milestone_internal(&env, campaign_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Pending {
            return Err(EscrowError::InvalidState);
        }

        let now = env.ledger().timestamp();
        let voting_end = now.saturating_add(VOTING_WINDOW_SECS);

        let proof = MilestoneProof {
            demo_link: demo_link.clone(),
            commit_hash: commit_hash.clone(),
            audit_report: audit_report.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::MilestoneProof(campaign_id, milestone_id), &proof);

        milestone.status = MilestoneStatus::Voting;
        milestone.has_proof = true;
        milestone.voting_start = now;
        milestone.voting_end = voting_end;
        milestone.votes_for = 0;
        milestone.votes_against = 0;

        Self::save_milestone(&env, campaign_id, milestone_id, &milestone);

        MilestoneProofSubmitted {
            campaign_id,
            milestone_id,
            demo_link,
            commit_hash,
            audit_report,
            voting_end,
        }
        .publish(&env);

        Ok(())
    }

    /// Backer casts a vote proportional to their pledge amount during the 5-day window.
    /// Automatically releases funds to creator upon passing vote (>60% approval quorum),
    /// or escalates to dispute if rejection quorum is mathematically reached.
    pub fn vote_milestone(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
        backer: Address,
        approve: bool,
    ) -> Result<MilestoneStatus, EscrowError> {
        backer.require_auth();

        let mut milestone = Self::get_milestone_internal(&env, campaign_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Voting {
            return Err(EscrowError::InvalidState);
        }

        let now = env.ledger().timestamp();
        if now > milestone.voting_end {
            return Err(EscrowError::VotingPeriodExpired);
        }

        let weight = Self::get_pledge_internal(&env, campaign_id, &backer);
        if weight <= 0 {
            return Err(EscrowError::NoPledgeFound);
        }

        let vote_key = DataKey::HasVoted(campaign_id, milestone_id, backer.clone());
        if env.storage().persistent().has(&vote_key) {
            return Err(EscrowError::AlreadyVoted);
        }
        env.storage().persistent().set(&vote_key, &true);

        if approve {
            milestone.votes_for = milestone.votes_for.saturating_add(weight);
        } else {
            milestone.votes_against = milestone.votes_against.saturating_add(weight);
        }

        MilestoneVoteCast {
            campaign_id,
            milestone_id,
            backer,
            approve,
            weight,
        }
        .publish(&env);

        // Check if passing threshold or irrecoverable rejection reached
        let total_pledged = Self::get_total_pledged_internal(&env, campaign_id);
        let base_weight = if total_pledged > 0 {
            total_pledged
        } else {
            milestone.votes_for.saturating_add(milestone.votes_against)
        };

        // >60% approval quorum of total pledge weight triggers automated release
        if base_weight > 0 && milestone.votes_for.saturating_mul(100) > base_weight.saturating_mul(60) {
            Self::execute_release(&env, campaign_id, &mut milestone)?;
            Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
            return Ok(MilestoneStatus::Released);
        } else if total_pledged > 0 && milestone.votes_against.saturating_mul(100) >= total_pledged.saturating_mul(40) {
            // Rejection threshold reached: >=40% negative quorum makes >60% approval impossible.
            Self::execute_dispute_escalation(
                &env,
                campaign_id,
                &mut milestone,
                String::from_str(&env, "Voting rejected: >=40% rejection quorum"),
            );
            Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
            return Ok(MilestoneStatus::Disputed);
        }

        Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
        Ok(MilestoneStatus::Voting)
    }

    /// Resolve voting after the 5-day voting window has expired (or if quorum reached).
    /// Automated release upon passing vote (>60% approval) or dispute escalation if rejected.
    pub fn resolve_milestone_voting(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<MilestoneStatus, EscrowError> {
        let mut milestone = Self::get_milestone_internal(&env, campaign_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Voting {
            return Err(EscrowError::InvalidState);
        }

        let now = env.ledger().timestamp();
        let total_pledged = Self::get_total_pledged_internal(&env, campaign_id);
        let total_votes = milestone.votes_for.saturating_add(milestone.votes_against);
        let base_weight = if total_pledged > 0 { total_pledged } else { total_votes };

        if now <= milestone.voting_end {
            // While voting window is open, can only resolve if mathematical consensus is reached
            if base_weight > 0 && milestone.votes_for.saturating_mul(100) > base_weight.saturating_mul(60) {
                Self::execute_release(&env, campaign_id, &mut milestone)?;
                Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
                return Ok(MilestoneStatus::Released);
            } else if total_pledged > 0 && milestone.votes_against.saturating_mul(100) >= total_pledged.saturating_mul(40) {
                Self::execute_dispute_escalation(
                    &env,
                    campaign_id,
                    &mut milestone,
                    String::from_str(&env, "Voting rejected: >=40% rejection quorum"),
                );
                Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
                return Ok(MilestoneStatus::Disputed);
            } else {
                return Err(EscrowError::VotingPeriodActive);
            }
        }

        // 5-day window has expired: evaluate final votes
        let passed = base_weight > 0
            && milestone.votes_for.saturating_mul(100) > base_weight.saturating_mul(60)
            && (total_votes == 0 || milestone.votes_for.saturating_mul(100) > total_votes.saturating_mul(60));

        if passed {
            Self::execute_release(&env, campaign_id, &mut milestone)?;
            Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
            Ok(MilestoneStatus::Released)
        } else {
            Self::execute_dispute_escalation(
                &env,
                campaign_id,
                &mut milestone,
                String::from_str(&env, "Voting rejected: did not achieve >60% approval quorum"),
            );
            Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
            Ok(MilestoneStatus::Disputed)
        }
    }

    /// Explicitly trigger milestone release if already approved or passing.
    pub fn release_milestone(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        let mut milestone = Self::get_milestone_internal(&env, campaign_id, milestone_id)?;
        if milestone.status == MilestoneStatus::Released {
            return Ok(());
        }

        if milestone.status == MilestoneStatus::Voting {
            let status = Self::resolve_milestone_voting(env, campaign_id, milestone_id)?;
            if status == MilestoneStatus::Released {
                return Ok(());
            } else {
                return Err(EscrowError::QuorumNotReached);
            }
        }

        if milestone.status == MilestoneStatus::Approved {
            Self::execute_release(&env, campaign_id, &mut milestone)?;
            Self::save_milestone(&env, campaign_id, milestone_id, &milestone);
            return Ok(());
        }

        Err(EscrowError::InvalidState)
    }

    /// Mark a campaign as disputed, freezing the escrow.
    pub fn dispute(env: Env, campaign_id: u64, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let status: EscrowStatus = env
            .storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        if status != EscrowStatus::Closed && status != EscrowStatus::Active {
            return Err(EscrowError::InvalidState);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Disputed);

        Ok(())
    }

    /// Issue a partial or full refund from a disputed escrow.
    pub fn refund(
        env: Env,
        campaign_id: u64,
        refund_amount: i128,
        refund_type: RefundType,
    ) -> Result<(), EscrowError> {
        let mediator: Address = env
            .storage()
            .instance()
            .get(&DataKey::Mediator)
            .ok_or(EscrowError::Unauthorized)?;
        mediator.require_auth();

        let status: EscrowStatus = env
            .storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        if status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidState);
        }

        if refund_amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)?;

        if refund_amount > balance {
            return Err(EscrowError::InsufficientEscrow);
        }

        let (amount_to_refund, remaining_balance) = match refund_type {
            RefundType::Full => (balance, 0i128),
            RefundType::Partial => (refund_amount, balance.saturating_sub(refund_amount)),
        };

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::Unauthorized)?;
        let creator = Self::get_creator(&env, campaign_id)?;

        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &creator, &amount_to_refund);

        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &remaining_balance);
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Refunded);

        RefundIssued {
            campaign_id,
            refund_amount: amount_to_refund,
            refund_type,
            remaining_balance,
        }
        .publish(&env);

        Ok(())
    }

    /// Return the current status of a campaign escrow.
    pub fn get_status(env: Env, campaign_id: u64) -> Result<EscrowStatus, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)
    }

    /// Return the remaining escrow balance for a campaign.
    pub fn get_balance(env: Env, campaign_id: u64) -> Result<i128, EscrowError> {
        Self::get_balance_internal(&env, campaign_id)
    }

    /// Return details of a specific milestone.
    pub fn get_milestone(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        Self::get_milestone_internal(&env, campaign_id, milestone_id)
    }

    /// Return proof deliverables submitted for a milestone.
    pub fn get_milestone_proof(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<MilestoneProof, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::MilestoneProof(campaign_id, milestone_id))
            .ok_or(EscrowError::EmptyProof)
    }

    /// Return current vote tallies (approve_weight, reject_weight) for a milestone.
    pub fn get_milestone_votes(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<(i128, i128), EscrowError> {
        let milestone = Self::get_milestone_internal(&env, campaign_id, milestone_id)?;
        Ok((milestone.votes_for, milestone.votes_against))
    }

    /// Return the voting weight pledged by a specific backer.
    pub fn get_pledge(env: Env, campaign_id: u64, backer: Address) -> i128 {
        Self::get_pledge_internal(&env, campaign_id, &backer)
    }

    /// Return the total pledge weight registered for a campaign.
    pub fn get_total_pledged(env: Env, campaign_id: u64) -> i128 {
        Self::get_total_pledged_internal(&env, campaign_id)
    }

    /// Check if a backer has cast a vote on a milestone.
    pub fn has_voted(env: Env, campaign_id: u64, milestone_id: u32, backer: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::HasVoted(campaign_id, milestone_id, backer))
    }

    /// Return all milestone IDs configured for a campaign.
    pub fn get_milestones(env: Env, campaign_id: u64) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestones(campaign_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Return the constant 5-day voting window in seconds (432,000s).
    pub fn get_voting_window_secs(_env: Env) -> u64 {
        VOTING_WINDOW_SECS
    }

    // -------------------------------------------------------------------------
    // Internal Helper Functions
    // -------------------------------------------------------------------------

    fn get_creator(env: &Env, campaign_id: u64) -> Result<Address, EscrowError> {
        if let Some(creator) = env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::CampaignCreator(campaign_id))
        {
            Ok(creator)
        } else if let Some(creator) = env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::Creator)
        {
            Ok(creator)
        } else {
            Err(EscrowError::CampaignNotFound)
        }
    }

    fn get_balance_internal(env: &Env, campaign_id: u64) -> Result<i128, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(campaign_id))
            .ok_or(EscrowError::CampaignNotFound)
    }

    fn get_total_pledged_internal(env: &Env, campaign_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::TotalPledged(campaign_id))
            .unwrap_or(0)
    }

    fn get_pledge_internal(env: &Env, campaign_id: u64, backer: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Pledge(campaign_id, backer.clone()))
            .unwrap_or(0)
    }

    fn get_milestone_internal(
        env: &Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(campaign_id, milestone_id))
            .ok_or(EscrowError::MilestoneNotFound)
    }

    fn save_milestone(env: &Env, campaign_id: u64, milestone_id: u32, milestone: &Milestone) {
        env.storage()
            .persistent()
            .set(&DataKey::Milestone(campaign_id, milestone_id), milestone);
    }

    fn execute_release(
        env: &Env,
        campaign_id: u64,
        milestone: &mut Milestone,
    ) -> Result<(), EscrowError> {
        milestone.status = MilestoneStatus::Released;
        milestone.released = true;

        let balance = Self::get_balance_internal(env, campaign_id)?;
        let new_balance = balance.saturating_sub(milestone.amount);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &new_balance);

        let creator = Self::get_creator(env, campaign_id)?;

        if let Some(token_addr) = env.storage().instance().get::<DataKey, Address>(&DataKey::Token) {
            let token_client = token::Client::new(env, &token_addr);
            token_client.transfer(&env.current_contract_address(), &creator, &milestone.amount);
        }

        if new_balance == 0 {
            env.storage()
                .persistent()
                .set(&DataKey::Status(campaign_id), &EscrowStatus::Released);
        }

        MilestoneFundsReleased {
            campaign_id,
            milestone_id: milestone.milestone_id,
            creator,
            amount: milestone.amount,
            remaining_balance: new_balance,
        }
        .publish(env);

        Ok(())
    }

    fn execute_dispute_escalation(
        env: &Env,
        campaign_id: u64,
        milestone: &mut Milestone,
        reason: String,
    ) {
        milestone.status = MilestoneStatus::Disputed;
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &EscrowStatus::Disputed);

        MilestoneDisputed {
            campaign_id,
            milestone_id: milestone.milestone_id,
            reason,
        }
        .publish(env);
    }
}

#[cfg(test)]
mod test;

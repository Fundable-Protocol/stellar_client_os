#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, Map, String, Symbol, Vec,
};

/// Errors for the dispute arbiter consensus contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ArbiterError {
    /// Caller is not an assigned arbiter for this dispute.
    NotAssignedArbiter = 1,
    /// Arbiter has already voted on this dispute.
    AlreadyVoted = 2,
    /// The dispute has already been resolved.
    AlreadyResolved = 3,
    /// Not enough votes have been cast to reach consensus (need >= 3).
    NotEnoughVotes = 4,
    /// Invalid vote choice provided.
    InvalidVoteChoice = 5,
    /// Dispute not found.
    DisputeNotFound = 6,
    /// Caller is not authorized (admin-only operation).
    Unauthorized = 7,
    /// Voting period has expired.
    VotingPeriodExpired = 8,
    /// Dispute does not have enough assigned arbiters (need 5).
    NotEnoughArbiters = 9,
}

/// The possible vote choices for an arbiter on a disputed milestone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    /// Approve the milestone release.
    Approve,
    /// Reject the milestone release.
    Reject,
    /// Request additional evidence before deciding.
    RequestEvidence,
}

/// A single vote cast by an arbiter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub arbiter: Address,
    pub choice: VoteChoice,
    pub reason: String,
    pub timestamp: u64,
}

/// The current state of a dispute.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeState {
    /// Voting is open; arbiters may cast votes.
    Voting,
    /// Consensus reached: milestone approved (>= 3 approve votes).
    Approved,
    /// Consensus reached: milestone rejected (>= 3 reject votes).
    Rejected,
    /// Consensus reached: more evidence requested (>= 3 evidence votes).
    EvidenceRequested,
    /// Voting deadline passed without consensus.
    TimedOut,
}

/// A single disputed escrow milestone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub id: u64,
    pub milestone_id: u64,
    pub escrow_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub assigned_arbiters: Vec<Address>,
    pub state: DisputeState,
    pub votes_for_approve: u32,
    pub votes_for_reject: u32,
    pub votes_for_evidence: u32,
    pub created_at: u64,
    pub voting_deadline: u64,
    pub resolved_at: Option<u64>,
}

/// Storage keys for the contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Admin,
    DisputeCount,
    Dispute(u64),
    Votes(u64),
    HasVoted(u64, Address),
    MinVotingPeriod,
}

/// Default voting period: 7 days in seconds.
const DEFAULT_VOTING_PERIOD_SECS: u64 = 604_800;
/// Required number of arbiters for a dispute.
const REQUIRED_ARBITERS: u32 = 5;
/// Votes needed for consensus (majority of 5).
const CONSENSUS_THRESHOLD: u32 = 3;
/// TTL extension constants.
const TTL_THRESHOLD: u32 = 1_000;
const TTL_EXTEND_TO: u32 = 10_000;

fn bump_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[contract]
pub struct DisputeArbiterContract;

#[contractimpl]
impl DisputeArbiterContract {
    /// Initialize the dispute arbiter contract.
    ///
    /// # Arguments
    /// * `admin` - The administrator address with authority to configure the contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::DisputeCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::MinVotingPeriod, &DEFAULT_VOTING_PERIOD_SECS);
    }

    /// Create a new dispute for a milestone release, assigning 5 arbiters.
    ///
    /// # Arguments
    /// * `milestone_id` - The ID of the disputed milestone.
    /// * `escrow_id` - The ID of the escrow contract.
    /// * `client` - The client address.
    /// * `freelancer` - The freelancer address.
    /// * `assigned_arbiters` - Exactly 5 arbiter addresses.
    ///
    /// # Returns
    /// The new dispute ID.
    pub fn create_dispute(
        env: Env,
        milestone_id: u64,
        escrow_id: u64,
        client: Address,
        freelancer: Address,
        assigned_arbiters: Vec<Address>,
    ) -> Result<u64, ArbiterError> {
        client.require_auth();
        freelancer.require_auth();

        if assigned_arbiters.len() != REQUIRED_ARBITERS {
            return Err(ArbiterError::NotEnoughArbiters);
        }

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::DisputeCount)
            .unwrap_or(0);
        count += 1;

        let now = env.ledger().timestamp();
        let voting_period: u64 = env
            .storage()
            .instance()
            .get(&DataKey::MinVotingPeriod)
            .unwrap_or(DEFAULT_VOTING_PERIOD_SECS);

        let dispute = Dispute {
            id: count,
            milestone_id,
            escrow_id,
            client,
            freelancer,
            assigned_arbiters,
            state: DisputeState::Voting,
            votes_for_approve: 0,
            votes_for_reject: 0,
            votes_for_evidence: 0,
            created_at: now,
            voting_deadline: now.saturating_add(voting_period),
            resolved_at: None,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(count), &dispute);
        bump_ttl(&env, &DataKey::Dispute(count));

        env.storage()
            .persistent()
            .set(&DataKey::Votes(count), &Vec::<Vote>::new(&env));
        bump_ttl(&env, &DataKey::Votes(count));

        env.storage().instance().set(&DataKey::DisputeCount, &count);

        Ok(count)
    }

    /// Cast a vote on a dispute. Only assigned arbiters may vote.
    ///
    /// # Arguments
    /// * `dispute_id` - The ID of the dispute to vote on.
    /// * `arbiter` - The arbiter casting the vote (must be in assigned_arbiters).
    /// * `choice` - The vote choice (Approve, Reject, or RequestEvidence).
    /// * `reason` - A human-readable explanation for the vote.
    ///
    /// # Returns
    /// Ok if vote was recorded. Auto-resolves if consensus threshold is reached.
    pub fn cast_vote(
        env: Env,
        dispute_id: u64,
        arbiter: Address,
        choice: VoteChoice,
        reason: String,
    ) -> Result<(), ArbiterError> {
        arbiter.require_auth();

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(ArbiterError::DisputeNotFound)?;
        bump_ttl(&env, &DataKey::Dispute(dispute_id));

        // Validate voting is still open
        if dispute.state != DisputeState::Voting {
            return Err(ArbiterError::AlreadyResolved);
        }

        // Check voting deadline
        if env.ledger().timestamp() > dispute.voting_deadline {
            dispute.state = DisputeState::TimedOut;
            dispute.resolved_at = Some(env.ledger().timestamp());
            env.storage()
                .persistent()
                .set(&DataKey::Dispute(dispute_id), &dispute);
            bump_ttl(&env, &DataKey::Dispute(dispute_id));
            return Err(ArbiterError::VotingPeriodExpired);
        }

        // Verify arbiter is assigned
        if !dispute.assigned_arbiters.contains(&arbiter) {
            return Err(ArbiterError::NotAssignedArbiter);
        }

        // Prevent double voting
        let voted_key = DataKey::HasVoted(dispute_id, arbiter.clone());
        if env.storage().persistent().has(&voted_key) {
            return Err(ArbiterError::AlreadyVoted);
        }

        // Record the vote
        let vote = Vote {
            arbiter: arbiter.clone(),
            choice: choice.clone(),
            reason,
            timestamp: env.ledger().timestamp(),
        };

        let mut votes: Vec<Vote> = env
            .storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env));
        votes.push_back(vote);
        env.storage()
            .persistent()
            .set(&DataKey::Votes(dispute_id), &votes);
        bump_ttl(&env, &DataKey::Votes(dispute_id));

        // Update dispute tally
        match choice {
            VoteChoice::Approve => dispute.votes_for_approve += 1,
            VoteChoice::Reject => dispute.votes_for_reject += 1,
            VoteChoice::RequestEvidence => dispute.votes_for_evidence += 1,
        }

        // Mark arbiter as having voted
        env.storage().persistent().set(&voted_key, &true);

        // Check for 3-of-5 consensus
        let resolved = if dispute.votes_for_approve >= CONSENSUS_THRESHOLD {
            dispute.state = DisputeState::Approved;
            true
        } else if dispute.votes_for_reject >= CONSENSUS_THRESHOLD {
            dispute.state = DisputeState::Rejected;
            true
        } else if dispute.votes_for_evidence >= CONSENSUS_THRESHOLD {
            dispute.state = DisputeState::EvidenceRequested;
            true
        } else {
            false
        };

        if resolved {
            dispute.resolved_at = Some(env.ledger().timestamp());
        }

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        bump_ttl(&env, &DataKey::Dispute(dispute_id));

        Ok(())
    }

    /// Resolve a dispute that has not reached consensus after the voting deadline.
    ///
    /// # Arguments
    /// * `dispute_id` - The ID of the dispute to resolve.
    ///
    /// # Returns
    /// The final dispute state.
    pub fn force_resolve_timeout(
        env: Env,
        dispute_id: u64,
    ) -> Result<DisputeState, ArbiterError> {
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(ArbiterError::DisputeNotFound)?;
        bump_ttl(&env, &DataKey::Dispute(dispute_id));

        if dispute.state != DisputeState::Voting {
            return Err(ArbiterError::AlreadyResolved);
        }

        if env.ledger().timestamp() <= dispute.voting_deadline {
            return Err(ArbiterError::VotingPeriodExpired);
        }

        dispute.state = DisputeState::TimedOut;
        dispute.resolved_at = Some(env.ledger().timestamp());

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        bump_ttl(&env, &DataKey::Dispute(dispute_id));

        Ok(DisputeState::TimedOut)
    }

    /// Get the details of a dispute by its ID.
    pub fn get_dispute(env: Env, dispute_id: u64) -> Result<Dispute, ArbiterError> {
        let dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(ArbiterError::DisputeNotFound)?;
        bump_ttl(&env, &DataKey::Dispute(dispute_id));
        Ok(dispute)
    }

    /// Get all votes cast for a dispute.
    pub fn get_votes(env: Env, dispute_id: u64) -> Vec<Vote> {
        env.storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Get the total count of disputes created.
    pub fn get_dispute_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::DisputeCount)
            .unwrap_or(0)
    }

    /// Check if an arbiter has already voted on a specific dispute.
    pub fn has_voted(env: Env, dispute_id: u64, arbiter: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::HasVoted(dispute_id, arbiter))
    }

    /// Set the minimum voting period (admin only).
    pub fn set_voting_period(env: Env, admin: Address, seconds: u64) -> Result<(), ArbiterError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ArbiterError::Unauthorized)?;

        if admin != stored_admin {
            return Err(ArbiterError::Unauthorized);
        }

        env.storage()
            .instance()
            .set(&DataKey::MinVotingPeriod, &seconds);

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        Address, Env,
    };

    fn setup(env: &Env) -> (DisputeArbiterContractClient, Address) {
        let contract_id = env.register(DisputeArbiterContract, ());
        let client = DisputeArbiterContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    fn create_test_dispute(
        env: &Env,
        client: &DisputeArbiterContractClient,
        client_addr: &Address,
        freelancer: &Address,
    ) -> u64 {
        let mut arbiters = Vec::new(env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(env));
        }
        client.create_dispute(&1, &1, client_addr, freelancer, &arbiters).unwrap()
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);
        assert_eq!(client.get_dispute_count(), 0);
        client.set_voting_period(&admin, &3600).unwrap();
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);
        client.initialize(&admin);
    }

    #[test]
    fn test_create_dispute() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let dispute_id = create_test_dispute(&env, &client, &client_addr, &freelancer);
        assert_eq!(dispute_id, 1);
        assert_eq!(client.get_dispute_count(), 1);

        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert_eq!(dispute.state, DisputeState::Voting);
        assert_eq!(dispute.votes_for_approve, 0);
    }

    #[test]
    fn test_cast_vote_approve_consensus() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        // Cast 3 approve votes → should auto-resolve as Approved
        let reason = String::from_str(&env, "Milestone is complete");
        for i in 0..3 {
            client.cast_vote(
                &dispute_id,
                &arbiters.get(i).unwrap(),
                &VoteChoice::Approve,
                &reason,
            ).unwrap();
        }

        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert_eq!(dispute.state, DisputeState::Approved);
        assert_eq!(dispute.votes_for_approve, 3);
        assert!(dispute.resolved_at.is_some());
    }

    #[test]
    fn test_cast_vote_reject_consensus() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        let reason = String::from_str(&env, "Milestone not delivered");
        for i in 0..3 {
            client.cast_vote(
                &dispute_id,
                &arbiters.get(i).unwrap(),
                &VoteChoice::Reject,
                &reason,
            ).unwrap();
        }

        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert_eq!(dispute.state, DisputeState::Rejected);
        assert_eq!(dispute.votes_for_reject, 3);
    }

    #[test]
    fn test_double_vote_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        let reason = String::from_str(&env, "Looks good");
        let arbiter = arbiters.get(0).unwrap();

        client
            .cast_vote(&dispute_id, &arbiter, &VoteChoice::Approve, &reason)
            .unwrap();

        // Second vote from same arbiter should fail
        let result = client.try_cast_vote(&dispute_id, &arbiter, &VoteChoice::Approve, &reason);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_assigned_arbiter_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        let outsider = Address::generate(&env);
        let reason = String::from_str(&env, "I am not assigned");
        let result = client.try_cast_vote(&dispute_id, &outsider, &VoteChoice::Approve, &reason);
        assert!(result.is_err());
    }

    #[test]
    fn test_force_resolve_timeout() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        // Cast only 2 votes — not enough for consensus
        let reason = String::from_str(&env, "Approve");
        for i in 0..2 {
            client
                .cast_vote(&dispute_id, &arbiters.get(i).unwrap(), &VoteChoice::Approve, &reason)
                .unwrap();
        }

        // Advance time past voting deadline
        env.ledger().set(LedgerInfo {
            timestamp: 1_000_000,
            protocol_version: env.ledger().protocol_version(),
            sequence_number: env.ledger().sequence(),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 16,
            max_entry_ttl: 6312000,
        });

        let state = client.force_resolve_timeout(&dispute_id).unwrap();
        assert_eq!(state, DisputeState::TimedOut);
    }

    #[test]
    fn test_evidence_request_consensus() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..5 {
            arbiters.push_back(Address::generate(&env));
        }

        let dispute_id = client
            .create_dispute(&1, &1, &client_addr, &freelancer, &arbiters)
            .unwrap();

        let reason = String::from_str(&env, "Need more proof");
        for i in 0..3 {
            client
                .cast_vote(
                    &dispute_id,
                    &arbiters.get(i).unwrap(),
                    &VoteChoice::RequestEvidence,
                    &reason,
                )
                .unwrap();
        }

        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert_eq!(dispute.state, DisputeState::EvidenceRequested);
        assert_eq!(dispute.votes_for_evidence, 3);
    }

    #[test]
    fn test_not_enough_arbiters_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        for _ in 0..3 {
            arbiters.push_back(Address::generate(&env));
        }

        let result = client.try_create_dispute(&1, &1, &client_addr, &freelancer, &arbiters);
        assert!(result.is_err());
    }
}

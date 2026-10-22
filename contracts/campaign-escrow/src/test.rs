use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

fn setup_env<'a>() -> (
    Env,
    CampaignEscrowClient<'a>,
    Address,
    Address,
    Address,
    TokenClient<'a>,
    StellarAssetClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CampaignEscrow, ());
    let client = CampaignEscrowClient::new(&env, &contract_id);

    let mediator = Address::generate(&env);
    let creator = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = TokenClient::new(&env, &token_contract.address());
    let token_admin_client = StellarAssetClient::new(&env, &token_contract.address());

    client.initialize(&mediator, &token_contract.address());

    (
        env,
        client,
        mediator,
        creator,
        token_contract.address(),
        token_client,
        token_admin_client,
    )
}

#[test]
fn test_create_campaign_and_add_milestone() {
    let (_env, client, _mediator, creator, _token, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);

    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Active);
    assert_eq!(client.get_balance(&campaign_id), 10_000);

    // Add milestone tranche
    client.add_milestone(&campaign_id, &1, &5_000);

    let milestone = client.get_milestone(&campaign_id, &1);
    assert_eq!(milestone.milestone_id, 1);
    assert_eq!(milestone.amount, 5_000);
    assert_eq!(milestone.status, MilestoneStatus::Pending);
    assert_eq!(milestone.has_proof, false);
    assert_eq!(milestone.votes_for, 0);
    assert_eq!(milestone.votes_against, 0);
    assert_eq!(milestone.released, false);

    let milestones = client.get_milestones(&campaign_id);
    assert_eq!(milestones.len(), 1);
    assert_eq!(milestones.get(0).unwrap(), 1);
}

#[test]
fn test_creator_submits_milestone_proof_on_chain() {
    let (env, client, _mediator, creator, _token, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    // Set initial ledger time
    env.ledger().set_timestamp(1_000);

    let demo_link = String::from_str(&env, "https://demo.fundable.org/milestone-1");
    let commit_hash = String::from_str(&env, "a1b2c3d4e5f67890abcdef1234567890abcdef12");
    let audit_report = String::from_str(&env, "https://reports.fundable.org/audit-1.pdf");

    client.submit_milestone_proof(
        &campaign_id,
        &1,
        &demo_link,
        &commit_hash,
        &audit_report,
    );

    let milestone = client.get_milestone(&campaign_id, &1);
    assert_eq!(milestone.status, MilestoneStatus::Voting);
    assert_eq!(milestone.voting_start, 1_000);
    // 5-day voting window = 1_000 + 432_000 = 433_000
    assert_eq!(milestone.voting_end, 1_000 + VOTING_WINDOW_SECS);

    let proof = client.get_milestone_proof(&campaign_id, &1);
    assert_eq!(proof.demo_link, demo_link);
    assert_eq!(proof.commit_hash, commit_hash);
    assert_eq!(proof.audit_report, audit_report);
}

#[test]
fn test_empty_milestone_proof_rejected() {
    let (env, client, _mediator, creator, _token, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    let empty = String::from_str(&env, "");
    let valid = String::from_str(&env, "https://demo.org");

    let res = client.try_submit_milestone_proof(&campaign_id, &1, &empty, &valid, &valid);
    assert_eq!(res.unwrap_err().unwrap(), EscrowError::EmptyProof);
}

#[test]
fn test_backer_voting_weight_proportional_to_pledge_and_automated_release() {
    let (env, client, _mediator, creator, _token_addr, token_client, token_admin) = setup_env();

    let campaign_id = 42u64;
    client.create_campaign(&campaign_id, &creator, &0);

    // Register 3 backers with varying pledges:
    // Backer 1 pledges 6,500 (65% weight)
    // Backer 2 pledges 2,000 (20% weight)
    // Backer 3 pledges 1,500 (15% weight)
    // Total pledged = 10,000
    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    let backer3 = Address::generate(&env);

    token_admin.mint(&backer1, &10_000);
    token_admin.mint(&backer2, &10_000);
    token_admin.mint(&backer3, &10_000);

    client.pledge(&campaign_id, &backer1, &6_500);
    client.pledge(&campaign_id, &backer2, &2_000);
    client.pledge(&campaign_id, &backer3, &1_500);

    assert_eq!(client.get_pledge(&campaign_id, &backer1), 6_500);
    assert_eq!(client.get_pledge(&campaign_id, &backer2), 2_000);
    assert_eq!(client.get_pledge(&campaign_id, &backer3), 1_500);
    assert_eq!(client.get_total_pledged(&campaign_id), 10_000);
    assert_eq!(client.get_balance(&campaign_id), 10_000);

    // Creator adds milestone of 5,000 tokens
    client.add_milestone(&campaign_id, &1, &5_000);

    // Creator submits deliverables proof
    let demo_link = String::from_str(&env, "https://demo.example.com");
    let commit_hash = String::from_str(&env, "c0ffee1234567890");
    let audit_report = String::from_str(&env, "https://audit.example.com/v1");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    // Backer 1 votes approve (weight = 6,500, which is 65% of 10,000 total pledged).
    // Because 65% > 60% approval quorum, this passing vote triggers AUTOMATED RELEASE!
    let creator_balance_before = token_client.balance(&creator);
    assert_eq!(creator_balance_before, 0);

    let status = client.vote_milestone(&campaign_id, &1, &backer1, &true);
    assert_eq!(status, MilestoneStatus::Released);

    // Verify automated release: creator received 5,000 tokens directly!
    let creator_balance_after = token_client.balance(&creator);
    assert_eq!(creator_balance_after, 5_000);

    // Verify remaining escrow balance is now 5,000
    assert_eq!(client.get_balance(&campaign_id), 5_000);

    let milestone = client.get_milestone(&campaign_id, &1);
    assert_eq!(milestone.status, MilestoneStatus::Released);
    assert_eq!(milestone.released, true);
    assert_eq!(milestone.votes_for, 6_500);
}

#[test]
fn test_5_day_voting_window_expiration() {
    let (env, client, _mediator, creator, _, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    let start_time = 100_000u64;
    env.ledger().set_timestamp(start_time);

    let demo_link = String::from_str(&env, "https://demo.link");
    let commit_hash = String::from_str(&env, "commit123");
    let audit_report = String::from_str(&env, "audit123");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    let backer = Address::generate(&env);
    client.record_pledge(&campaign_id, &backer, &1_000);

    // 4 days later: voting is still within the 5-day window -> success!
    let within_window = start_time + (4 * 24 * 60 * 60);
    env.ledger().set_timestamp(within_window);

    let backer2 = Address::generate(&env);
    client.record_pledge(&campaign_id, &backer2, &1_000);
    let vote_res = client.try_vote_milestone(&campaign_id, &1, &backer2, &true);
    assert!(vote_res.is_ok());

    // 5 days + 1 second later: window has expired -> voting fails with VotingPeriodExpired!
    let after_window = start_time + VOTING_WINDOW_SECS + 1;
    env.ledger().set_timestamp(after_window);

    let err = client.try_vote_milestone(&campaign_id, &1, &backer, &true);
    assert_eq!(err.unwrap_err().unwrap(), EscrowError::VotingPeriodExpired);
}

#[test]
fn test_rejection_escalates_to_dispute() {
    let (env, client, _mediator, creator, _, _, _) = setup_env();

    let campaign_id = 99u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    let backer3 = Address::generate(&env);

    // Backer 1: 3,000 pledge
    // Backer 2: 4,500 pledge (rejects deliverable)
    // Backer 3: 2,500 pledge
    // Total: 10,000
    client.record_pledge(&campaign_id, &backer1, &3_000);
    client.record_pledge(&campaign_id, &backer2, &4_500);
    client.record_pledge(&campaign_id, &backer3, &2_500);

    let demo_link = String::from_str(&env, "https://demo.link");
    let commit_hash = String::from_str(&env, "commit123");
    let audit_report = String::from_str(&env, "audit123");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    // Backer 2 rejects (weight = 4,500 = 45% of total pledge).
    // Because >40% rejected, it is mathematically impossible to reach >60% approval quorum.
    // Automated dispute escalation triggers!
    let status = client.vote_milestone(&campaign_id, &1, &backer2, &false);
    assert_eq!(status, MilestoneStatus::Disputed);

    // Both milestone and campaign are now Disputed
    let milestone = client.get_milestone(&campaign_id, &1);
    assert_eq!(milestone.status, MilestoneStatus::Disputed);
    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Disputed);
}

#[test]
fn test_resolve_after_5_days_releases_if_passed_or_disputes_if_quorum_missed() {
    let (env, client, _mediator, creator, _, _token_client, _) = setup_env();

    let campaign_id = 7u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &4_000);

    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    // Backer 1 (5,000), Backer 2 (5,000). Total = 10,000.
    client.record_pledge(&campaign_id, &backer1, &5_000);
    client.record_pledge(&campaign_id, &backer2, &5_000);

    let start_time = 1_000u64;
    env.ledger().set_timestamp(start_time);

    let demo_link = String::from_str(&env, "https://demo.link");
    let commit_hash = String::from_str(&env, "commit123");
    let audit_report = String::from_str(&env, "audit123");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    // Only Backer 1 votes approve (5,000 = 50% of 10,000).
    // During voting, 50% <= 60%, so status remains Voting.
    let vote_status = client.vote_milestone(&campaign_id, &1, &backer1, &true);
    assert_eq!(vote_status, MilestoneStatus::Voting);

    // Fast-forward past the 5-day voting window
    env.ledger().set_timestamp(start_time + VOTING_WINDOW_SECS + 10);

    // 50% does not satisfy >60% approval quorum -> escalates to Disputed!
    let final_status = client.resolve_milestone_voting(&campaign_id, &1);
    assert_eq!(final_status, MilestoneStatus::Disputed);
    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Disputed);
}

#[test]
fn test_double_voting_prevented() {
    let (env, client, _mediator, creator, _, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    client.record_pledge(&campaign_id, &backer1, &2_000);
    client.record_pledge(&campaign_id, &backer2, &8_000);

    let demo_link = String::from_str(&env, "https://demo.link");
    let commit_hash = String::from_str(&env, "hash");
    let audit_report = String::from_str(&env, "audit");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    // First vote succeeds (20% weight, milestone remains in Voting state)
    let vote1 = client.try_vote_milestone(&campaign_id, &1, &backer1, &true);
    assert!(vote1.is_ok());
    assert_eq!(vote1.unwrap().unwrap(), MilestoneStatus::Voting);
    assert!(client.has_voted(&campaign_id, &1, &backer1));

    // Second vote fails with AlreadyVoted
    let vote2 = client.try_vote_milestone(&campaign_id, &1, &backer1, &true);
    assert_eq!(vote2.unwrap_err().unwrap(), EscrowError::AlreadyVoted);
}

#[test]
fn test_unpledged_caller_cannot_vote() {
    let (env, client, _mediator, creator, _, _, _) = setup_env();

    let campaign_id = 1u64;
    client.create_campaign(&campaign_id, &creator, &10_000);
    client.add_milestone(&campaign_id, &1, &5_000);

    let demo_link = String::from_str(&env, "https://demo.link");
    let commit_hash = String::from_str(&env, "hash");
    let audit_report = String::from_str(&env, "audit");
    client.submit_milestone_proof(&campaign_id, &1, &demo_link, &commit_hash, &audit_report);

    let stranger = Address::generate(&env);
    let vote_res = client.try_vote_milestone(&campaign_id, &1, &stranger, &true);
    assert_eq!(vote_res.unwrap_err().unwrap(), EscrowError::NoPledgeFound);
}

#[test]
fn test_mediator_refund_after_dispute() {
    let (env, client, _mediator, creator, _token, token_client, token_admin) = setup_env();

    let campaign_id = 55u64;
    client.create_campaign(&campaign_id, &creator, &10_000);

    // Fund the contract balance
    token_admin.mint(&client.address, &10_000);

    // Dispute campaign
    let caller = Address::generate(&env);
    client.dispute(&campaign_id, &caller);
    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Disputed);

    // Mediator issues partial refund of 4,000 to creator
    client.refund(&campaign_id, &4_000, &RefundType::Partial);

    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Refunded);
    assert_eq!(client.get_balance(&campaign_id), 6_000);
    assert_eq!(token_client.balance(&creator), 4_000);
}

#[test]
fn test_multiple_milestones_independent_lifecycle() {
    let (env, client, _mediator, creator, _token, token_client, token_admin) = setup_env();

    let campaign_id = 101u64;
    client.create_campaign(&campaign_id, &creator, &0);

    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    token_admin.mint(&backer1, &10_000);
    token_admin.mint(&backer2, &10_000);

    // Total pledged = 10,000 (backer1: 7,000 = 70%, backer2: 3,000 = 30%)
    client.pledge(&campaign_id, &backer1, &7_000);
    client.pledge(&campaign_id, &backer2, &3_000);

    // Creator configures 2 milestones of 5,000 each
    client.add_milestone(&campaign_id, &1, &5_000);
    client.add_milestone(&campaign_id, &2, &5_000);

    let milestones = client.get_milestones(&campaign_id);
    assert_eq!(milestones.len(), 2);

    // Milestone 1: proof submitted & passed by backer 1 (70% > 60%)
    let demo1 = String::from_str(&env, "https://demo1.org");
    let hash1 = String::from_str(&env, "commit1");
    let audit1 = String::from_str(&env, "audit1");
    client.submit_milestone_proof(&campaign_id, &1, &demo1, &hash1, &audit1);

    let status1 = client.vote_milestone(&campaign_id, &1, &backer1, &true);
    assert_eq!(status1, MilestoneStatus::Released);
    assert_eq!(token_client.balance(&creator), 5_000);
    assert_eq!(client.get_balance(&campaign_id), 5_000);

    // Milestone 2: proof submitted & rejected by backer 1 (70% reject)
    let demo2 = String::from_str(&env, "https://demo2.org");
    let hash2 = String::from_str(&env, "commit2");
    let audit2 = String::from_str(&env, "audit2");
    client.submit_milestone_proof(&campaign_id, &2, &demo2, &hash2, &audit2);

    let status2 = client.vote_milestone(&campaign_id, &2, &backer1, &false);
    assert_eq!(status2, MilestoneStatus::Disputed);
    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Disputed);

    // Milestone 1 remains Released, Milestone 2 is Disputed
    assert_eq!(client.get_milestone(&campaign_id, &1).status, MilestoneStatus::Released);
    assert_eq!(client.get_milestone(&campaign_id, &2).status, MilestoneStatus::Disputed);
}

#[test]
fn test_full_release_depletes_balance_and_updates_campaign_status() {
    let (env, client, _mediator, creator, _token, token_client, token_admin) = setup_env();

    let campaign_id = 202u64;
    client.create_campaign(&campaign_id, &creator, &0);

    let backer = Address::generate(&env);
    token_admin.mint(&backer, &10_000);
    client.pledge(&campaign_id, &backer, &10_000);

    client.add_milestone(&campaign_id, &1, &10_000);

    let demo = String::from_str(&env, "https://demo.org");
    let hash = String::from_str(&env, "commit");
    let audit = String::from_str(&env, "audit");
    client.submit_milestone_proof(&campaign_id, &1, &demo, &hash, &audit);

    let status = client.vote_milestone(&campaign_id, &1, &backer, &true);
    assert_eq!(status, MilestoneStatus::Released);

    assert_eq!(client.get_balance(&campaign_id), 0);
    assert_eq!(client.get_status(&campaign_id), EscrowStatus::Released);
    assert_eq!(token_client.balance(&creator), 10_000);
}


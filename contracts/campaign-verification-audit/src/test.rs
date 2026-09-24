#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String};

#[test]
fn test_verification_audit_flow() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1700000000);

    let contract_id = env.register_contract(None, CampaignVerificationAuditContract);
    let client = CampaignVerificationAuditContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    let verifier = Address::generate(&env);

    client.initialize(&admin);

    let campaign_id = 101u64;

    // 1. Initial status check
    assert_eq!(
        client.get_verification_status(&campaign_id),
        VerificationStatus::Unsubmitted
    );
    assert_eq!(client.get_activity_count(&campaign_id), 0);

    // 2. Submit for review
    let sub_notes = String::from_str(&env, "Campaign milestone 1 planting completed, requesting review");
    let act_id1 = client.log_submitted_for_review(&campaign_id, &submitter, &sub_notes);
    assert_eq!(act_id1, 1);
    assert_eq!(
        client.get_verification_status(&campaign_id),
        VerificationStatus::UnderReview
    );

    // 3. Verifier comments
    let comments = String::from_str(&env, "Please upload clear geotagged photos of row 4");
    let act_id2 = client.log_verifier_comments(&campaign_id, &verifier, &comments);
    assert_eq!(act_id2, 2);

    // 4. Photo uploaded
    let photo_hash = String::from_str(&env, "a1b2c3d4e5f60718");
    let act_id3 = client.log_photo_uploaded(&campaign_id, &submitter, &photo_hash);
    assert_eq!(act_id3, 3);

    // 5. Approved
    let approval_note = String::from_str(&env, "Geotagged photos verified, tree counts match milestone target.");
    let act_id4 = client.log_approved(&campaign_id, &verifier, &approval_note);
    assert_eq!(act_id4, 4);
    assert_eq!(
        client.get_verification_status(&campaign_id),
        VerificationStatus::Approved
    );

    // 6. Verify audit trail immutability & count
    assert_eq!(client.get_activity_count(&campaign_id), 4);
    let trail = client.get_audit_trail(&campaign_id);
    assert_eq!(trail.len(), 4);

    let entry1 = trail.get(0).unwrap();
    assert_eq!(entry1.id, 1);
    assert_eq!(entry1.activity_type, ActivityType::SubmittedForReview);
    assert_eq!(entry1.actor, submitter);
    assert_eq!(entry1.timestamp, 1700000000);

    let entry2 = trail.get(1).unwrap();
    assert_eq!(entry2.id, 2);
    assert_eq!(entry2.activity_type, ActivityType::VerifierComments);
    assert_eq!(entry2.actor, verifier);

    let entry3 = trail.get(2).unwrap();
    assert_eq!(entry3.id, 3);
    assert_eq!(entry3.activity_type, ActivityType::PhotoUploaded);
    assert_eq!(entry3.actor, submitter);

    let entry4 = trail.get(3).unwrap();
    assert_eq!(entry4.id, 4);
    assert_eq!(entry4.activity_type, ActivityType::Approved);
    assert_eq!(entry4.actor, verifier);
}

#[test]
fn test_rejection_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CampaignVerificationAuditContract);
    let client = CampaignVerificationAuditContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    let verifier = Address::generate(&env);

    client.initialize(&admin);

    let campaign_id = 202u64;
    client.log_submitted_for_review(
        &campaign_id,
        &submitter,
        &String::from_str(&env, "Submit milestone"),
    );

    let reason = String::from_str(&env, "Perceptual photo hash indicates stock photo duplicate");
    client.log_rejected(&campaign_id, &verifier, &reason);

    assert_eq!(
        client.get_verification_status(&campaign_id),
        VerificationStatus::Rejected
    );
    assert_eq!(client.get_activity_count(&campaign_id), 2);
}

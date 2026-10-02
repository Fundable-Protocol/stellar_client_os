#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Bytes, Env, String, Vec};

fn setup_tree_env(env: &Env) -> CampaignVerificationAuditContractClient<'_> {
    env.mock_all_auths();
    env.ledger().set_timestamp(1700000000);
    let contract_id = env.register_contract(None, CampaignVerificationAuditContract);
    let client = CampaignVerificationAuditContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

fn tree_ids(env: &Env, values: &[u32]) -> Vec<u32> {
    let mut ids = Vec::new(env);
    for value in values {
        ids.push_back(*value);
    }
    ids
}

fn photo_hashes(env: &Env, count: u32) -> Vec<Bytes> {
    let mut hashes = Vec::new(env);
    for i in 0..count {
        hashes.push_back(Bytes::from_slice(env, &[i as u8, 1, 2, 3]));
    }
    hashes
}

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
    let sub_notes = String::from_str(
        &env,
        "Campaign milestone 1 planting completed, requesting review",
    );
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
    let approval_note = String::from_str(
        &env,
        "Geotagged photos verified, tree counts match milestone target.",
    );
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

    let reason = String::from_str(
        &env,
        "Perceptual photo hash indicates stock photo duplicate",
    );
    client.log_rejected(&campaign_id, &verifier, &reason);

    assert_eq!(
        client.get_verification_status(&campaign_id),
        VerificationStatus::Rejected
    );
    assert_eq!(client.get_activity_count(&campaign_id), 2);
}

#[test]
fn test_verify_trees_batch_happy_path() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);

    let ids = tree_ids(&env, &[11, 22, 33]);
    let gps = String::from_str(&env, "12.9716,77.5946");
    let photos = photo_hashes(&env, 5);

    let verified = client.verify_trees_batch(&verifier, &ids, &gps, &photos);
    assert_eq!(verified, 3);

    for tree_id in [11u32, 22, 33] {
        let record = client.get_tree_verification(&tree_id).unwrap();
        assert_eq!(record.tree_id, tree_id);
        assert_eq!(record.gps, gps);
        assert_eq!(record.verifier, verifier);
        assert_eq!(record.photo_hashes.len(), 5);
        assert_eq!(record.timestamp, 1700000000);
    }

    assert!(client.get_tree_verification(&44).is_none());
}

#[test]
fn test_verify_trees_batch_empty_batch_rejected() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);

    let result = client.try_verify_trees_batch(
        &verifier,
        &Vec::<u32>::new(&env),
        &String::from_str(&env, "12.9716,77.5946"),
        &photo_hashes(&env, 1),
    );
    assert_eq!(result, Err(Ok(AuditError::EmptyBatch)));
}

#[test]
fn test_verify_trees_batch_over_max_rejected() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);

    let mut ids = Vec::new(&env);
    for i in 0..(MAX_BATCH_SIZE + 1) {
        ids.push_back(i + 1);
    }

    let result = client.try_verify_trees_batch(
        &verifier,
        &ids,
        &String::from_str(&env, "12.9716,77.5946"),
        &photo_hashes(&env, 5),
    );
    assert_eq!(result, Err(Ok(AuditError::BatchTooLarge)));
}

#[test]
fn test_verify_trees_batch_duplicate_ids_rejected() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);

    let result = client.try_verify_trees_batch(
        &verifier,
        &tree_ids(&env, &[5, 6, 5]),
        &String::from_str(&env, "12.9716,77.5946"),
        &photo_hashes(&env, 1),
    );
    assert_eq!(result, Err(Ok(AuditError::DuplicateTreeId)));

    assert!(client.get_tree_verification(&5).is_none());
    assert!(client.get_tree_verification(&6).is_none());
}

#[test]
fn test_verify_trees_batch_unauthorized_verifier_rejected() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);

    // Disable the auth mocking used for setup so the unsigned call fails.
    env.set_auths(&[]);

    let result = client.try_verify_trees_batch(
        &verifier,
        &tree_ids(&env, &[7, 8]),
        &String::from_str(&env, "12.9716,77.5946"),
        &photo_hashes(&env, 1),
    );
    assert!(result.is_err());
    assert!(client.get_tree_verification(&7).is_none());
    assert!(client.get_tree_verification(&8).is_none());
}

#[test]
fn test_verify_trees_batch_is_atomic_on_mid_batch_failure() {
    let env = Env::default();
    let client = setup_tree_env(&env);
    let verifier = Address::generate(&env);
    let gps = String::from_str(&env, "12.9716,77.5946");

    // Tree id 0 is invalid and sits in the middle of the batch. Because the
    // whole batch is validated before any write, trees 100 and 200 must not
    // be persisted.
    let result = client.try_verify_trees_batch(
        &verifier,
        &tree_ids(&env, &[100, 0, 200]),
        &gps,
        &photo_hashes(&env, 2),
    );
    assert_eq!(result, Err(Ok(AuditError::InvalidTreeId)));
    assert!(client.get_tree_verification(&100).is_none());
    assert!(client.get_tree_verification(&200).is_none());

    // A tree that is already verified also aborts the whole batch before any
    // sibling record is written.
    client.verify_tree(&verifier, &300, &gps, &photo_hashes(&env, 1));
    let result = client.try_verify_trees_batch(
        &verifier,
        &tree_ids(&env, &[400, 300]),
        &gps,
        &photo_hashes(&env, 1),
    );
    assert_eq!(result, Err(Ok(AuditError::TreeAlreadyVerified)));
    assert!(client.get_tree_verification(&400).is_none());
}

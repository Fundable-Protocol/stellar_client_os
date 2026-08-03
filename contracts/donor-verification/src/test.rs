#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec, Bytes};

fn sha256(env: &Env, data: &[u8]) -> BytesN<32> {
    let b = Bytes::from_slice(env, data);
    env.crypto().sha256(&b).into()
}

fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &left.to_array()));
    buf.append(&Bytes::from_array(env, &right.to_array()));
    env.crypto().sha256(&buf).into()
}

/// Builds a depth-`TREE_DEPTH` Merkle tree from a single real leaf at
/// `leaf_index`, padding all other leaves/siblings with a fixed zero
/// value, and returns (root, proof).
fn build_proof(
    env: &Env,
    leaf: &BytesN<32>,
    leaf_index: u32,
) -> (BytesN<32>, Vec<BytesN<32>>) {
    let zero = BytesN::from_array(env, &[0u8; 32]);
    let mut proof = vec![env];
    let mut current = leaf.clone();
    let mut index = leaf_index;

    for _ in 0..TREE_DEPTH {
        let sibling = zero.clone();
        current = if index % 2 == 0 {
            hash_pair(env, &current, &sibling)
        } else {
            hash_pair(env, &sibling, &current)
        };
        proof.push_back(sibling);
        index /= 2;
    }

    (current, proof)
}

#[test]
fn test_initialize_and_get_root() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let root = BytesN::from_array(&env, &[1u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &root);

    assert_eq!(client.get_current_root(), root);
}

#[test]
fn test_cannot_initialize_twice() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let root = BytesN::from_array(&env, &[1u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &root);

    let result = client.try_initialize(&admin, &root);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn test_verify_and_donate_success() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);

    let secret = sha256(&env, b"donor-secret");
    let nullifier = sha256(&env, b"donor-nullifier");
    let leaf = hash_pair(&env, &secret, &nullifier);
    let (root, proof) = build_proof(&env, &leaf, 0);

    env.mock_all_auths();
    client.initialize(&admin, &root);

    client.verify_and_donate(&donor, &leaf, &proof, &0u32, &nullifier);

    assert!(client.is_nullifier_used(&nullifier));
}

#[test]
fn test_verify_and_donate_rejects_invalid_proof() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);

    let secret = sha256(&env, b"donor-secret");
    let nullifier = sha256(&env, b"donor-nullifier");
    let leaf = hash_pair(&env, &secret, &nullifier);
    let (_correct_root, proof) = build_proof(&env, &leaf, 0);

    // A different, unrelated root — the proof won't resolve to it.
    let wrong_root = BytesN::from_array(&env, &[9u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &wrong_root);

    let result = client.try_verify_and_donate(&donor, &leaf, &proof, &0u32, &nullifier);
    assert_eq!(result, Err(Ok(Error::InvalidMerkleProof)));
}

#[test]
fn test_verify_and_donate_rejects_reused_nullifier() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);

    let secret = sha256(&env, b"donor-secret");
    let nullifier = sha256(&env, b"donor-nullifier");
    let leaf = hash_pair(&env, &secret, &nullifier);
    let (root, proof) = build_proof(&env, &leaf, 0);

    env.mock_all_auths();
    client.initialize(&admin, &root);
    client.verify_and_donate(&donor, &leaf, &proof, &0u32, &nullifier);

    // Second attempt with the same nullifier must fail.
    let result = client.try_verify_and_donate(&donor, &leaf, &proof, &0u32, &nullifier);
    assert_eq!(result, Err(Ok(Error::NullifierAlreadyUsed)));
}

#[test]
fn test_verify_and_donate_rejects_wrong_proof_length() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let root = BytesN::from_array(&env, &[1u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &root);

    let leaf = sha256(&env, b"leaf");
    let nullifier = sha256(&env, b"nullifier");
    let short_proof = vec![&env, BytesN::from_array(&env, &[0u8; 32])]; // too short

    let result = client.try_verify_and_donate(&donor, &leaf, &short_proof, &0u32, &nullifier);
    assert_eq!(result, Err(Ok(Error::InvalidProofLength)));
}

#[test]
fn test_update_root_requires_admin() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let not_admin = Address::generate(&env);
    let root = BytesN::from_array(&env, &[1u8; 32]);
    let new_root = BytesN::from_array(&env, &[2u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &root);

    let result = client.try_update_root(&not_admin, &new_root);
    assert_eq!(result, Err(Ok(Error::NotAdmin)));
}

#[test]
fn test_functions_fail_before_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonorVerificationContract);
    let client = DonorVerificationContractClient::new(&env, &contract_id);

    let result = client.try_get_current_root();
    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}
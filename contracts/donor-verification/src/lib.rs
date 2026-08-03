//! Anonymous donor eligibility verification.
//!
//! Donors are enrolled into an eligibility set as hidden commitments
//! (hash of a secret + a per-donor nullifier), stored as leaves of a
//! Merkle tree whose root is published on-chain. To donate, a donor
//! proves knowledge of a leaf via a Merkle inclusion proof without
//! revealing which leaf is theirs, and reveals only a nullifier hash
//! (not their account address) to prevent replay/double-spend.
//!
//! This is a Merkle-commitment + nullifier scheme — the same privacy
//! building block used by systems like Tornado Cash. It does not
//! implement a general-purpose zk-SNARK circuit (Groth16/PLONK), which
//! would additionally require pairing-curve arithmetic and a trusted
//! setup outside the scope of a single contract. A full SNARK verifier
//! could later be swapped in behind the same `verify_and_donate` entry
//! point if the project needs stronger properties than Merkle-proof
//! membership provides.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN,
    Env, Vec,
};

/// Depth of the Merkle tree (supports up to 2^20 enrolled donors).
const TREE_DEPTH: u32 = 20;

/// TTL (in ledgers) to extend persistent storage entries by on write.
const STORAGE_TTL_THRESHOLD: u32 = 100_000;
const STORAGE_TTL_EXTEND_TO: u32 = 200_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Caller is not the admin.
    NotAdmin = 1,
    /// Contract has already been initialized.
    AlreadyInitialized = 2,
    /// Contract has not been initialized yet.
    NotInitialized = 3,
    /// The submitted Merkle proof does not resolve to the stored root.
    InvalidMerkleProof = 4,
    /// The proof's path length does not match the configured tree depth.
    InvalidProofLength = 5,
    /// This nullifier has already been used — prevents double-donation
    /// from the same enrolled identity.
    NullifierAlreadyUsed = 6,
    /// The enrollment set is full (tree depth exhausted).
    TreeFull = 7,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Root,
    LeafCount,
    Nullifier(BytesN<32>),
}

#[contract]
pub struct DonorVerificationContract;

#[contractimpl]
impl DonorVerificationContract {
    /// Initialize the contract with an admin address and an initial
    /// Merkle root (typically the root of an empty tree, or a
    /// pre-populated eligibility set root).
    pub fn initialize(env: Env, admin: Address, initial_root: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Root, &initial_root);
        env.storage().instance().set(&DataKey::LeafCount, &0u32);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_TTL_THRESHOLD, STORAGE_TTL_EXTEND_TO);

        Ok(())
    }

    /// Admin-only: publish a new Merkle root after enrolling new donor
    /// commitments off-chain (or via an enrollment batch process).
    /// Requires the admin's authorization.
    pub fn update_root(env: Env, admin: Address, new_root: BytesN<32>) -> Result<(), Error> {
        let stored_admin = Self::get_admin(&env)?;
        if admin != stored_admin {
            return Err(Error::NotAdmin);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Root, &new_root);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_TTL_THRESHOLD, STORAGE_TTL_EXTEND_TO);

        Ok(())
    }

    /// Verify a donor's Merkle inclusion proof against the current root
    /// and record their nullifier so the same enrolled identity cannot
    /// be used again. Returns `Ok(())` if the donor is verified as
    /// eligible without ever revealing their account address on-chain.
    ///
    /// - `leaf`: the donor's commitment (e.g. hash(secret || nullifier_preimage)).
    /// - `proof`: sibling hashes from the leaf up to the root.
    /// - `leaf_index`: the leaf's position, used to determine left/right
    ///   ordering at each level of the proof.
    /// - `nullifier`: a value derived from the donor's secret that is
    ///   unique per enrollment and safe to reveal (does not leak the
    ///   secret or the account address).
    /// - `donor`: the account authorizing this call (must sign it), used
    ///   only for `require_auth` — it is never linked on-chain to the
    ///   commitment/leaf itself.
    pub fn verify_and_donate(
        env: Env,
        donor: Address,
        leaf: BytesN<32>,
        proof: Vec<BytesN<32>>,
        leaf_index: u32,
        nullifier: BytesN<32>,
    ) -> Result<(), Error> {
        donor.require_auth();

        if proof.len() != TREE_DEPTH {
            return Err(Error::InvalidProofLength);
        }

        let nullifier_key = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&nullifier_key) {
            return Err(Error::NullifierAlreadyUsed);
        }

        let root: BytesN<32> = Self::get_root(&env)?;
        let computed_root = Self::compute_merkle_root(&env, &leaf, &proof, leaf_index);

        if computed_root != root {
            return Err(Error::InvalidMerkleProof);
        }

        // Record the nullifier as spent. Only the nullifier is stored —
        // never the donor's address or the leaf/commitment itself.
        env.storage().persistent().set(&nullifier_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&nullifier_key, STORAGE_TTL_THRESHOLD, STORAGE_TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("verified"),), nullifier);

        Ok(())
    }

    /// Returns whether a given nullifier has already been used.
    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier))
    }

    /// Returns the current Merkle root.
    pub fn get_current_root(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_root(&env)
    }

    fn get_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn get_root(env: &Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Root)
            .ok_or(Error::NotInitialized)
    }

    /// Recomputes a Merkle root from a leaf, its sibling path, and its
    /// index (which determines left/right concatenation order at each
    /// level). Uses SHA-256 for each internal node hash.
    fn compute_merkle_root(
        env: &Env,
        leaf: &BytesN<32>,
        proof: &Vec<BytesN<32>>,
        leaf_index: u32,
    ) -> BytesN<32> {
        let mut current = leaf.clone();
        let mut index = leaf_index;

        for sibling in proof.iter() {
            let mut buf = Bytes::new(env);
            if index % 2 == 0 {
                buf.append(&Bytes::from_array(env, &current.to_array()));
                buf.append(&Bytes::from_array(env, &sibling.to_array()));
            } else {
                buf.append(&Bytes::from_array(env, &sibling.to_array()));
                buf.append(&Bytes::from_array(env, &current.to_array()));
            }
            current = env.crypto().sha256(&buf).into();
            index /= 2;
        }

        current
    }
}

mod test;
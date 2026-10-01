#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String,
    Vec,
};

/// Errors returned by the Campaign Verification Audit contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuditError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidCampaignId = 4,
    EmptyDetails = 5,
    /// A batch verification was submitted with no tree ids.
    EmptyBatch = 6,
    /// A batch verification exceeded [`MAX_BATCH_SIZE`] trees.
    BatchTooLarge = 7,
    /// The same tree id appeared more than once in a batch.
    DuplicateTreeId = 8,
    /// A tree verification was submitted without a GPS coordinate.
    EmptyGps = 9,
    /// A tree verification was submitted without any photo hash.
    EmptyPhotos = 10,
    /// More photo hashes than [`MAX_PHOTO_HASHES`] were submitted.
    PhotoBatchTooLarge = 11,
    /// Tree id `0` is reserved and invalid.
    InvalidTreeId = 12,
    /// The tree already has a verification record.
    TreeAlreadyVerified = 13,
}

/// The immutable activity type logged in the verification audit trail.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ActivityType {
    /// Campaign submitted for initial or milestone review.
    SubmittedForReview = 1,
    /// Feedback or notes recorded by an authorized verifier.
    VerifierComments = 2,
    /// Evidence/milestone photo uploaded with hash or IPFS CID.
    PhotoUploaded = 3,
    /// Verification approved.
    Approved = 4,
    /// Verification rejected.
    Rejected = 5,
}

/// Verification lifecycle status for a campaign.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VerificationStatus {
    Unsubmitted = 0,
    UnderReview = 1,
    Approved = 2,
    Rejected = 3,
}

/// A single immutable audit entry recorded on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuditEntry {
    /// Sequential activity ID within this campaign.
    pub id: u32,
    /// The ID of the campaign being verified.
    pub campaign_id: u64,
    /// Category of verification activity.
    pub activity_type: ActivityType,
    /// The wallet address that performed or authorized the activity.
    pub actor: Address,
    /// Details, notes, perceptual hash, or comments.
    pub details: String,
    /// Ledger Unix timestamp at the moment of recording.
    pub timestamp: u64,
}

/// The verification record for a single tree.
///
/// A tree is identified by its id and shares the region-level GPS coordinate
/// and bounded photo-hash set supplied by the verifier.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreeVerification {
    /// The unique tree id being verified.
    pub tree_id: u32,
    /// Region-level GPS coordinate shared by the batch.
    pub gps: String,
    /// The verifier wallet that authorized the submission.
    pub verifier: Address,
    /// Bounded set of supporting photo hashes / IPFS CIDs.
    pub photo_hashes: Vec<Bytes>,
    /// Ledger Unix timestamp at the moment of recording.
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    AuditTrail(u64),
    ActivityCount(u64),
    Status(u64),
    TreeVerification(u32),
}

/// Maximum number of trees a single batch verification may contain.
pub const MAX_BATCH_SIZE: u32 = 100;

/// Maximum number of photo hashes accepted per verification submission.
pub const MAX_PHOTO_HASHES: u32 = 50;

#[contract]
pub struct CampaignVerificationAuditContract;

#[contractimpl]
impl CampaignVerificationAuditContract {
    /// Initialize the audit trail contract with a global administrator.
    pub fn initialize(env: Env, admin: Address) -> Result<(), AuditError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(AuditError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Retrieve the current administrator address.
    pub fn get_admin(env: &Env) -> Result<Address, AuditError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(AuditError::NotInitialized)
    }

    /// Log a campaign submitted for review.
    pub fn log_submitted_for_review(
        env: Env,
        campaign_id: u64,
        submitter: Address,
        notes: String,
    ) -> Result<u32, AuditError> {
        submitter.require_auth();
        let count = Self::record_activity(
            &env,
            campaign_id,
            ActivityType::SubmittedForReview,
            submitter,
            notes,
        )?;
        env.storage().persistent().set(
            &DataKey::Status(campaign_id),
            &VerificationStatus::UnderReview,
        );
        Ok(count)
    }

    /// Log verifier comments.
    pub fn log_verifier_comments(
        env: Env,
        campaign_id: u64,
        verifier: Address,
        comments: String,
    ) -> Result<u32, AuditError> {
        verifier.require_auth();
        Self::record_activity(
            &env,
            campaign_id,
            ActivityType::VerifierComments,
            verifier,
            comments,
        )
    }

    /// Log a milestone proof photo uploaded with perceptual hash / identifier.
    pub fn log_photo_uploaded(
        env: Env,
        campaign_id: u64,
        uploader: Address,
        photo_hash: String,
    ) -> Result<u32, AuditError> {
        uploader.require_auth();
        Self::record_activity(
            &env,
            campaign_id,
            ActivityType::PhotoUploaded,
            uploader,
            photo_hash,
        )
    }

    /// Log verification approval.
    pub fn log_approved(
        env: Env,
        campaign_id: u64,
        verifier: Address,
        comments: String,
    ) -> Result<u32, AuditError> {
        verifier.require_auth();
        let count = Self::record_activity(
            &env,
            campaign_id,
            ActivityType::Approved,
            verifier,
            comments,
        )?;
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &VerificationStatus::Approved);
        Ok(count)
    }

    /// Log verification rejection with a reason.
    pub fn log_rejected(
        env: Env,
        campaign_id: u64,
        verifier: Address,
        reason: String,
    ) -> Result<u32, AuditError> {
        verifier.require_auth();
        let count =
            Self::record_activity(&env, campaign_id, ActivityType::Rejected, verifier, reason)?;
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &VerificationStatus::Rejected);
        Ok(count)
    }

    /// Retrieve the full, immutable verification audit trail for a campaign.
    pub fn get_audit_trail(env: Env, campaign_id: u64) -> Vec<AuditEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::AuditTrail(campaign_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Get the total number of logged activities for a campaign.
    pub fn get_activity_count(env: Env, campaign_id: u64) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ActivityCount(campaign_id))
            .unwrap_or(0u32)
    }

    /// Get current verification status for a campaign.
    pub fn get_verification_status(env: Env, campaign_id: u64) -> VerificationStatus {
        env.storage()
            .persistent()
            .get(&DataKey::Status(campaign_id))
            .unwrap_or(VerificationStatus::Unsubmitted)
    }

    /// Verify a single tree, recording its region GPS and bounded photo set.
    ///
    /// # Arguments
    /// * `verifier`     — Authorized verifier wallet (must sign).
    /// * `tree_id`      — Tree being verified (must be non-zero and not already verified).
    /// * `gps`          — Region GPS coordinate shared with the tree's region.
    /// * `photo_hashes` — Bounded set of supporting photo hashes.
    pub fn verify_tree(
        env: Env,
        verifier: Address,
        tree_id: u32,
        gps: String,
        photo_hashes: Vec<Bytes>,
    ) -> Result<(), AuditError> {
        verifier.require_auth();
        Self::validate_tree_submission(&env, tree_id, &gps, &photo_hashes)?;
        Self::write_tree_verification(&env, tree_id, gps, verifier, photo_hashes);
        Ok(())
    }

    /// Verify many trees in one batch sharing a single region GPS coordinate
    /// and one bounded photo set (e.g. 100 trees, 1 GPS, 5 photos).
    ///
    /// All validation is performed before any record is written, so the batch
    /// is atomic (all-or-nothing): a rejected submission leaves no partial
    /// state behind.
    ///
    /// # Arguments
    /// * `verifier`     — Authorized verifier wallet (must sign).
    /// * `tree_ids`     — Non-empty, bounded, duplicate-free list of tree ids.
    /// * `gps`          — Region GPS coordinate shared by every tree in the batch.
    /// * `photo_hashes` — Bounded non-empty set of supporting photo hashes.
    ///
    /// Returns the number of trees verified in the batch.
    pub fn verify_trees_batch(
        env: Env,
        verifier: Address,
        tree_ids: Vec<u32>,
        gps: String,
        photo_hashes: Vec<Bytes>,
    ) -> Result<u32, AuditError> {
        verifier.require_auth();

        let count = tree_ids.len();
        if count == 0 {
            return Err(AuditError::EmptyBatch);
        }
        if count > MAX_BATCH_SIZE {
            return Err(AuditError::BatchTooLarge);
        }
        if gps.len() == 0 {
            return Err(AuditError::EmptyGps);
        }
        if photo_hashes.len() == 0 {
            return Err(AuditError::EmptyPhotos);
        }
        if photo_hashes.len() > MAX_PHOTO_HASHES {
            return Err(AuditError::PhotoBatchTooLarge);
        }

        // Validate the whole batch before writing anything so the operation is
        // atomic even if a later tree id turns out to be invalid or duplicated.
        for i in 0..count {
            let tree_id = tree_ids.get(i).unwrap();
            if tree_id == 0 {
                return Err(AuditError::InvalidTreeId);
            }
            if env
                .storage()
                .persistent()
                .has(&DataKey::TreeVerification(tree_id))
            {
                return Err(AuditError::TreeAlreadyVerified);
            }
            for j in (i + 1)..count {
                if tree_ids.get(j).unwrap() == tree_id {
                    return Err(AuditError::DuplicateTreeId);
                }
            }
        }

        for i in 0..count {
            let tree_id = tree_ids.get(i).unwrap();
            Self::write_tree_verification(
                &env,
                tree_id,
                gps.clone(),
                verifier.clone(),
                photo_hashes.clone(),
            );
        }

        Ok(count)
    }

    /// Fetch the verification record for a tree, if one exists.
    pub fn get_tree_verification(env: Env, tree_id: u32) -> Option<TreeVerification> {
        env.storage()
            .persistent()
            .get(&DataKey::TreeVerification(tree_id))
    }

    /// Shared validation for single and batch tree verification submissions.
    fn validate_tree_submission(
        env: &Env,
        tree_id: u32,
        gps: &String,
        photo_hashes: &Vec<Bytes>,
    ) -> Result<(), AuditError> {
        if tree_id == 0 {
            return Err(AuditError::InvalidTreeId);
        }
        if gps.len() == 0 {
            return Err(AuditError::EmptyGps);
        }
        if photo_hashes.len() == 0 {
            return Err(AuditError::EmptyPhotos);
        }
        if photo_hashes.len() > MAX_PHOTO_HASHES {
            return Err(AuditError::PhotoBatchTooLarge);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::TreeVerification(tree_id))
        {
            return Err(AuditError::TreeAlreadyVerified);
        }
        Ok(())
    }

    /// Persist one tree verification record and publish its event.
    fn write_tree_verification(
        env: &Env,
        tree_id: u32,
        gps: String,
        verifier: Address,
        photo_hashes: Vec<Bytes>,
    ) {
        let timestamp = env.ledger().timestamp();
        let record = TreeVerification {
            tree_id,
            gps: gps.clone(),
            verifier: verifier.clone(),
            photo_hashes,
            timestamp,
        };
        env.storage()
            .persistent()
            .set(&DataKey::TreeVerification(tree_id), &record);
        env.events().publish(
            (symbol_short!("treevrfy"), tree_id, verifier),
            (gps, timestamp),
        );
    }

    /// Internal append-only helper ensuring strictly immutable activity logging.
    fn record_activity(
        env: &Env,
        campaign_id: u64,
        activity_type: ActivityType,
        actor: Address,
        details: String,
    ) -> Result<u32, AuditError> {
        if campaign_id == 0 {
            return Err(AuditError::InvalidCampaignId);
        }
        if details.len() == 0 {
            return Err(AuditError::EmptyDetails);
        }

        let mut trail: Vec<AuditEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::AuditTrail(campaign_id))
            .unwrap_or(Vec::new(env));

        let current_count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ActivityCount(campaign_id))
            .unwrap_or(0u32);

        let next_id = current_count + 1;
        let timestamp = env.ledger().timestamp();

        let entry = AuditEntry {
            id: next_id,
            campaign_id,
            activity_type,
            actor: actor.clone(),
            details: details.clone(),
            timestamp,
        };

        trail.push_back(entry);

        env.storage()
            .persistent()
            .set(&DataKey::AuditTrail(campaign_id), &trail);
        env.storage()
            .persistent()
            .set(&DataKey::ActivityCount(campaign_id), &next_id);

        // Publish Soroban contract event for off-chain indexers and mobile push notifications
        env.events().publish(
            (symbol_short!("audit"), campaign_id, activity_type as u32),
            (actor, timestamp, details),
        );

        Ok(next_id)
    }
}

#[cfg(test)]
mod test;

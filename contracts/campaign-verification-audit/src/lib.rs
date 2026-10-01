#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
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

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    AuditTrail(u64),
    ActivityCount(u64),
    Status(u64),
}

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
        env.storage()
            .persistent()
            .set(&DataKey::Status(campaign_id), &VerificationStatus::UnderReview);
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
        let count = Self::record_activity(
            &env,
            campaign_id,
            ActivityType::Rejected,
            verifier,
            reason,
        )?;
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

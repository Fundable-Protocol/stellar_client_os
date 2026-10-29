-- Optional, badge-earning creator identity verification (email, phone, government ID).
--
-- Verification belongs to a creator's Stellar address. Completing all three
-- steps earns the "Verified Creator" badge shown on campaigns and in search.
-- Only outcomes are public: contact details are stored masked + salted-hash,
-- one-time codes are stored hashed, and ID documents are referenced by a
-- private storage key. See docs/creator-identity-verification.md.
--
-- PostgreSQL-compatible; idempotent.

CREATE TABLE IF NOT EXISTS creator_identity_verifications (
  creator_address          text PRIMARY KEY,
  -- Email step
  email_status             text NOT NULL DEFAULT 'not_started'
                           CHECK (email_status IN ('not_started', 'pending', 'verified', 'rejected')),
  email_masked             text,
  email_hash               text,
  email_verified_at        timestamptz,
  -- Phone step
  phone_status             text NOT NULL DEFAULT 'not_started'
                           CHECK (phone_status IN ('not_started', 'pending', 'verified', 'rejected')),
  phone_masked             text,
  phone_hash               text,
  phone_verified_at        timestamptz,
  -- Government ID step (manual review)
  government_id_status     text NOT NULL DEFAULT 'not_started'
                           CHECK (government_id_status IN ('not_started', 'pending', 'verified', 'rejected')),
  government_id_document_type text
                           CHECK (government_id_document_type IS NULL
                                  OR government_id_document_type IN ('passport', 'national_id', 'drivers_license')),
  government_id_country    char(2),
  government_id_document_key text,
  government_id_submitted_at timestamptz,
  government_id_reviewed_by text,
  government_id_reviewed_at timestamptz,
  government_id_rejection_reason text,
  government_id_verified_at timestamptz,
  -- Set when all three steps are verified (badge earned)
  verified_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Short-lived one-time code challenges (hashed; at most one active per step).
CREATE TABLE IF NOT EXISTS creator_verification_challenges (
  creator_address  text NOT NULL REFERENCES creator_identity_verifications(creator_address) ON DELETE CASCADE,
  step             text NOT NULL CHECK (step IN ('email', 'phone')),
  code_hash        text NOT NULL,
  salt             text NOT NULL,
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  PRIMARY KEY (creator_address, step)
);

-- Admin review queue (pending government IDs, oldest first).
CREATE INDEX IF NOT EXISTS idx_creator_identity_pending_review
  ON creator_identity_verifications (government_id_submitted_at)
  WHERE government_id_status = 'pending';

-- Fast "Verified creators only" filtering.
CREATE INDEX IF NOT EXISTS idx_creator_identity_verified
  ON creator_identity_verifications (creator_address)
  WHERE verified_at IS NOT NULL;

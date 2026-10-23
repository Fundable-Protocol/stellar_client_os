-- Migration 009: Ambassador & influencer program
-- Lets a creator recruit ambassadors who promote a campaign in exchange for
-- perks or a commission. PostgreSQL-compatible and idempotent.
--
-- An ambassador is invited by email, accepts the invitation through a unique
-- token, and every pledge they bring in is tracked against them. When the
-- ambassador's pledged total crosses a tier threshold, the matching reward is
-- assigned automatically.

BEGIN;

-- The invitations sent by email.
CREATE TABLE IF NOT EXISTS ambassador_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_title text NOT NULL,
  email text NOT NULL,
  name text,
  tier text NOT NULL DEFAULT 'SEED'
    CONSTRAINT ambassador_invites_tier_check CHECK (tier IN ('SEED', 'SPROUT', 'BLOOM', 'CANOPY')),
  invited_by text NOT NULL,
  invited_by_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT ambassador_invites_status_check
      CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  ambassador_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ambassador_invites_campaign_idx
  ON ambassador_invites (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ambassador_invites_email_idx
  ON ambassador_invites (email);

-- The ambassadors themselves.
CREATE TABLE IF NOT EXISTS ambassadors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  stellar_address text,
  tier text NOT NULL DEFAULT 'SEED'
    CONSTRAINT ambassadors_tier_check CHECK (tier IN ('SEED', 'SPROUT', 'BLOOM', 'CANOPY')),
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT ambassadors_status_check
      CHECK (status IN ('invited', 'active', 'paused', 'completed', 'declined')),
  referral_code text NOT NULL,
  invited_by text NOT NULL,
  invited_by_name text,
  pledged_amount numeric(78, 0) NOT NULL DEFAULT 0,
  pledge_count int NOT NULL DEFAULT 0,
  reward_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  joined_at timestamptz,
  CONSTRAINT ambassadors_referral_code_unique UNIQUE (campaign_id, referral_code)
);

CREATE INDEX IF NOT EXISTS ambassadors_campaign_idx
  ON ambassadors (campaign_id, pledged_amount DESC);
CREATE INDEX IF NOT EXISTS ambassadors_email_idx
  ON ambassadors (email);

-- Pledges attributed to an ambassador.
CREATE TABLE IF NOT EXISTS ambassador_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ambassador_id uuid NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  backer_address text NOT NULL,
  amount numeric(78, 0) NOT NULL
    CONSTRAINT ambassador_pledges_amount_check CHECK (amount > 0),
  token text NOT NULL DEFAULT 'XLM',
  source text NOT NULL DEFAULT 'referral_link'
    CONSTRAINT ambassador_pledges_source_check
      CHECK (source IN ('referral_link', 'referral_code', 'direct')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ambassador_pledges_ambassador_idx
  ON ambassador_pledges (ambassador_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ambassador_pledges_campaign_idx
  ON ambassador_pledges (campaign_id, created_at DESC);

-- Rewards assigned to ambassadors once a tier threshold is reached.
CREATE TABLE IF NOT EXISTS ambassador_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ambassador_id uuid NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'commission'
    CONSTRAINT ambassador_rewards_type_check CHECK (type IN ('perk', 'commission')),
  tier text NOT NULL
    CONSTRAINT ambassador_rewards_tier_check CHECK (tier IN ('SEED', 'SPROUT', 'BLOOM', 'CANOPY')),
  amount numeric(78, 0) NOT NULL DEFAULT 0,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'assigned'
    CONSTRAINT ambassador_rewards_status_check
      CHECK (status IN ('assigned', 'fulfilled', 'revoked')),
  threshold_amount numeric(78, 0) NOT NULL DEFAULT 0,
  assigned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A tier is only rewarded once per ambassador.
  CONSTRAINT ambassador_rewards_tier_unique UNIQUE (ambassador_id, tier)
);

CREATE INDEX IF NOT EXISTS ambassador_rewards_campaign_idx
  ON ambassador_rewards (campaign_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS ambassador_rewards_ambassador_idx
  ON ambassador_rewards (ambassador_id);

COMMIT;

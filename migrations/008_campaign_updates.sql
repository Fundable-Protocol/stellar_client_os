-- Migration 008: Campaign update posts
-- Rich-text progress posts a creator publishes on a campaign during (and
-- after) the campaign is live. PostgreSQL-compatible and idempotent.
--
-- An update carries a Markdown body, optional uploaded images and a
-- notification mode. Backers can opt into an instant email, a daily or
-- weekly digest, or no email at all; every published update is also stored
-- as an in-app notification for the backers that follow the campaign.

BEGIN;

-- The update posts themselves.
CREATE TABLE IF NOT EXISTS campaign_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_address text NOT NULL,
  title text NOT NULL,
  body_markdown text NOT NULL,
  excerpt text,
  image_urls text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT campaign_updates_status_check CHECK (status IN ('draft', 'published', 'archived')),
  visibility text NOT NULL DEFAULT 'public'
    CONSTRAINT campaign_updates_visibility_check CHECK (visibility IN ('public', 'backers_only')),
  notify_backers boolean NOT NULL DEFAULT true,
  notification_mode text NOT NULL DEFAULT 'instant'
    CONSTRAINT campaign_updates_notification_mode_check
      CHECK (notification_mode IN ('instant', 'daily_digest', 'weekly_digest', 'off')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at timestamptz
);

-- The chronological feed reads a campaign's published updates oldest first.
CREATE INDEX IF NOT EXISTS campaign_updates_campaign_published_idx
  ON campaign_updates (campaign_id, published_at DESC);
CREATE INDEX IF NOT EXISTS campaign_updates_creator_idx
  ON campaign_updates (creator_address);
CREATE INDEX IF NOT EXISTS campaign_updates_tags_idx
  ON campaign_updates USING GIN (tags);

-- Per-backer notification preference for campaign updates.
CREATE TABLE IF NOT EXISTS campaign_update_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  backer_id text NOT NULL,
  email text,
  mode text NOT NULL DEFAULT 'instant'
    CONSTRAINT campaign_update_preferences_mode_check
      CHECK (mode IN ('instant', 'daily_digest', 'weekly_digest', 'off')),
  in_app_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'UTC',
  last_sent_period text,
  last_sent_at bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT campaign_update_preferences_unique UNIQUE (campaign_id, backer_id)
);

CREATE INDEX IF NOT EXISTS campaign_update_preferences_campaign_idx
  ON campaign_update_preferences (campaign_id);

-- In-app notifications delivered to a backer.
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  update_id uuid REFERENCES campaign_updates(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'campaign_update'
    CONSTRAINT in_app_notifications_kind_check
      CHECK (kind IN ('campaign_update', 'ambassador_reward', 'ambassador_invite')),
  title text NOT NULL,
  body text NOT NULL,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS in_app_notifications_recipient_idx
  ON in_app_notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS in_app_notifications_unread_idx
  ON in_app_notifications (recipient_id) WHERE read = false;

-- Updates queued for a digest period, grouped per backer.
CREATE TABLE IF NOT EXISTS campaign_update_digest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backer_id text NOT NULL,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES campaign_updates(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT campaign_update_digest_queue_unique UNIQUE (backer_id, period_key, update_id)
);

CREATE INDEX IF NOT EXISTS campaign_update_digest_queue_period_idx
  ON campaign_update_digest_queue (period_key, backer_id);

COMMIT;

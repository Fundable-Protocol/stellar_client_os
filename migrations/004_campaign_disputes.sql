-- Migration 004: Campaign dispute resolution system
-- Idempotent migration for PostgreSQL

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_disputes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    backer_address text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('undelivered_reward', 'fraud', 'other')),
    description text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'creator_responded', 'under_review', 'resolved', 'rejected')),
    filed_at timestamptz NOT NULL DEFAULT now(),
    creator_response_deadline timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    creator_response text,
    mediator_id text,
    mediator_decision text,
    refund_type text CHECK (refund_type IN ('partial', 'full')),
    refund_amount numeric(78,0),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_campaign_disputes_campaign_status
    ON campaign_disputes (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_disputes_creator_response_deadline
    ON campaign_disputes (creator_response_deadline);

COMMIT;
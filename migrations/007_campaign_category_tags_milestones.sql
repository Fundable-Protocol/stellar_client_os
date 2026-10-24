-- Migration 007: Campaign categories, tags, and milestones
-- Adds category, tags, and milestones support to campaigns.
-- This migration is idempotent and safe to run multiple times.

BEGIN;

-- Add category column (primary category for browse filtering)
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS category text;

-- Add tags column (up to 10 custom tags, stored as text array)
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Add milestones column (creator-defined funding milestones stored as JSONB)
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]';

-- GIN index on tags to support tag-based browse filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_tags
    ON campaigns USING GIN (tags);

-- Btree index on category to support category-based browse filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_category
    ON campaigns (category);

COMMIT;
-- Campaign geolocation & creator grant programs: underrepresented community tags
--
-- Adds the creator-declared underrepresented-community tags that qualify a
-- campaign for the platform-funded grant matching programs (match the first
-- 10% of funds for campaigns from underrepresented communities).
--
-- PostgreSQL-compatible; idempotent.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS underrepresented_tags text[] NOT NULL DEFAULT '{}';

-- Index for discovery/filtering campaigns by an eligibility tag.
CREATE INDEX IF NOT EXISTS campaigns_underrepresented_tags_idx
  ON campaigns USING GIN (underrepresented_tags);
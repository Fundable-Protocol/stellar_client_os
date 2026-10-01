-- Creator grant programs: platform-funded matching for underrepresented
-- creators. PostgreSQL-compatible; idempotent.
--
-- A grant_program reserves a pool funded by platform profits. A matching
-- allocation matches the first `matchPercentage`% of a qualifying campaign's
-- funds, capped per campaign (per_campaign_cap) and by the remaining pool.

CREATE TABLE IF NOT EXISTS grant_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  match_percentage int NOT NULL DEFAULT 10
    CONSTRAINT grant_programs_match_percentage_check CHECK (match_percentage BETWEEN 1 AND 50),
  per_campaign_cap numeric(78, 0) NOT NULL DEFAULT 0,
  total_pool numeric(78, 0) NOT NULL,
  allocated numeric(78, 0) NOT NULL DEFAULT 0,
  eligibility_criteria text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'OPEN'
    CONSTRAINT grant_programs_status_check CHECK (status IN ('OPEN', 'PAUSED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS grant_programs_status_idx ON grant_programs (status);

CREATE TABLE IF NOT EXISTS grant_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES grant_programs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  base_contribution numeric(78, 0) NOT NULL,
  matched_amount numeric(78, 0) NOT NULL,
  allocated_by text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS grant_allocations_program_idx
  ON grant_allocations (program_id, allocated_at DESC);
CREATE INDEX IF NOT EXISTS grant_allocations_campaign_idx
  ON grant_allocations (campaign_id, allocated_at DESC);
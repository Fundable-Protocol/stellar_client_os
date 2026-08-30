-- Schema for tracking sponsor cohorts

CREATE TABLE IF NOT EXISTS sponsor_signups (
  sponsor_address TEXT PRIMARY KEY,
  signup_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsorships (
  id              BIGSERIAL PRIMARY KEY,
  sponsor_address TEXT        NOT NULL REFERENCES sponsor_signups(sponsor_address),
  stream_id       TEXT        NOT NULL,
  amount          NUMERIC     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsorships_sponsor_address ON sponsorships(sponsor_address);
CREATE INDEX IF NOT EXISTS idx_sponsorships_created_at ON sponsorships(created_at);

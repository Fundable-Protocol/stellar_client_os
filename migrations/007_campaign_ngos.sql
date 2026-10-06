-- Campaign partnership marketplace: NGO directory & partnership requests
--
-- Adds the NGO profiles a campaign can partner with (land access, planting
-- labor, verification services) and the partnership request lifecycle that
-- links a campaign to a verified NGO. Partners power the planting/verification
-- side of campaigns; only VERIFIED NGOs can be partnered with.
--
-- PostgreSQL-compatible; idempotent.

-- NGO directory profiles with an admin-review verification flow.
CREATE TABLE IF NOT EXISTS ngos (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  description        text NOT NULL DEFAULT '',
  services           text[] NOT NULL DEFAULT '{}',
  country            text,
  website            text,
  verification_status text NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  reviewed_by        text,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Partnership requests between a campaign and an NGO, with a finite
-- lifecycle: PENDING -> ACCEPTED | REJECTED | CANCELED, ACCEPTED -> COMPLETED | CANCELED.
CREATE TABLE IF NOT EXISTS campaign_partnerships (
  id                 text PRIMARY KEY,
  campaign_id        text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ngo_id             text NOT NULL REFERENCES ngos(id) ON DELETE RESTRICT,
  services_requested text[] NOT NULL DEFAULT '{}',
  proposed_terms     text,
  status             text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELED')),
  initiated_by       text NOT NULL,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes for filtering the NGO directory and a campaign's requests.
CREATE INDEX IF NOT EXISTS ngos_verification_status_idx ON ngos (verification_status);
CREATE INDEX IF NOT EXISTS ngos_services_idx ON ngos USING GIN (services);
CREATE INDEX IF NOT EXISTS ngos_country_idx ON ngos (country);
CREATE INDEX IF NOT EXISTS campaign_partnerships_campaign_idx ON campaign_partnerships (campaign_id, status);
CREATE INDEX IF NOT EXISTS campaign_partnerships_ngo_idx ON campaign_partnerships (ngo_id);
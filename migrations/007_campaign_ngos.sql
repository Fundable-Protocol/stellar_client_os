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

-- Non-profit verification flag on campaigns, set during onboarding and
-- reviewed by an admin. Only VERIFIED campaigns are eligible to issue tax
-- receipts for their contributions.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_status text NOT NULL DEFAULT 'NONE' CHECK (nonprofit_status IN ('NONE', 'PENDING', 'VERIFIED', 'REJECTED'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_legal_name text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_registration_number text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_country text;

CREATE INDEX IF NOT EXISTS campaigns_nonprofit_status_idx ON campaigns (nonprofit_status);

-- Tax receipts issued to backers of non-profit campaigns. One receipt per
-- (campaign, backer, tax year, token); pdf_ref points at the stored PDF.
CREATE TABLE IF NOT EXISTS tax_receipts (
  id            text PRIMARY KEY,
  campaign_id   text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  backer_address text NOT NULL,
  amount        numeric(38, 18) NOT NULL,
  token         text NOT NULL,
  tax_year      integer NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  pdf_ref       text,
  certificate_id text NOT NULL,
  CONSTRAINT tax_receipts_campaign_backer_year_token_key UNIQUE (campaign_id, backer_address, tax_year, token)
);

CREATE INDEX IF NOT EXISTS tax_receipts_backer_address_idx ON tax_receipts (backer_address);
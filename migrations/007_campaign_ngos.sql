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

-- Non-profit / charitable registration details on campaigns. The flag is set
-- during onboarding once the campaign's non-profit status is verified; only
-- flagged campaigns generate tax receipts for their backers.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_non_profit boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_legal_name text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_registration_number text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS nonprofit_country text;

-- Tax receipts issued to backers of non-profit campaigns, one per confirmed
-- pledge. Receipts are generated and emailed on pledge confirmation and can be
-- re-downloaded by the backer from their dashboard at any time.
CREATE TABLE IF NOT EXISTS tax_receipts (
  id                            text PRIMARY KEY,
  campaign_id                   text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  pledge_id                     text NOT NULL,
  backer_address                text NOT NULL,
  amount                        numeric(20, 7) NOT NULL,
  token                         text NOT NULL,
  tax_year                      integer NOT NULL,
  receipt_url                   text,
  issued_at                     timestamptz NOT NULL DEFAULT now(),
  emailed_at                    timestamptz,
  UNIQUE (pledge_id)
);

-- Indexes for a backer's receipts by tax year and for a campaign's receipts.
CREATE INDEX IF NOT EXISTS tax_receipts_backer_year_idx ON tax_receipts (backer_address, tax_year);
CREATE INDEX IF NOT EXISTS tax_receipts_campaign_idx ON tax_receipts (campaign_id);
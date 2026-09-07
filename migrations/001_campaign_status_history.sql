-- Campaign persistence for status history and exportable sponsor/impact data.
-- PostgreSQL-compatible migration; timestamps are stored as UTC timestamptz.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS campaign_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason text,
  CONSTRAINT campaign_status_history_status_check CHECK (
    to_status IN ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED')
  )
);

CREATE INDEX IF NOT EXISTS campaign_status_history_campaign_changed_at_idx
  ON campaign_status_history (campaign_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS campaign_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  address text NOT NULL,
  amount numeric(78, 0) NOT NULL,
  token text NOT NULL,
  sponsored_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS campaign_sponsors_campaign_idx
  ON campaign_sponsors (campaign_id, sponsored_at DESC);

-- Backfill the initial state so every campaign has a queryable history.
INSERT INTO campaign_status_history (campaign_id, from_status, to_status, changed_by, changed_at, reason)
SELECT id, NULL, status, COALESCE(creator, 'system'), COALESCE(status_changed_at, CURRENT_TIMESTAMP), 'Initial campaign status'
FROM campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM campaign_status_history h WHERE h.campaign_id = c.id
);

CREATE OR REPLACE FUNCTION record_campaign_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = CURRENT_TIMESTAMP;
    INSERT INTO campaign_status_history (campaign_id, from_status, to_status, changed_by, changed_at)
    VALUES (NEW.id, OLD.status, NEW.status, COALESCE(current_setting('app.current_user', true), 'system'), CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_status_history_trigger ON campaigns;
CREATE TRIGGER campaigns_status_history_trigger
BEFORE UPDATE OF status ON campaigns
FOR EACH ROW EXECUTE FUNCTION record_campaign_status_change();

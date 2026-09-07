-- Campaign analytics persistence for the creator analytics dashboard.
-- PostgreSQL-compatible; idempotent.
--
-- Vertex metrics (views/contributions/refunds) already live in
-- campaign_status_history / campaign_sponsors. These tables add the daily
-- funding trend, traffic-source attribution, and conversion funnel steps
-- needed to render the full creator dashboard.

CREATE TABLE IF NOT EXISTS campaign_traffic_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source text NOT NULL
    CONSTRAINT campaign_traffic_sources_source_check CHECK (
      source IN ('direct', 'search', 'social', 'referral', 'newsletter')
    ),
  viewer_id text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS campaign_traffic_sources_campaign_idx
  ON campaign_traffic_sources (campaign_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS campaign_traffic_sources_source_idx
  ON campaign_traffic_sources (source, viewed_at DESC);

CREATE TABLE IF NOT EXISTS campaign_funnel_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  stage text NOT NULL
    CONSTRAINT campaign_funnel_steps_stage_check CHECK (
      stage IN ('view', 'click_sponsor', 'contribute', 'confirm')
    ),
  viewer_id text NOT NULL,
  stepped_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS campaign_funnel_steps_campaign_idx
  ON campaign_funnel_steps (campaign_id, stage, stepped_at DESC);

CREATE TABLE IF NOT EXISTS campaign_daily_analytics (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  day date NOT NULL,
  contributions int NOT NULL DEFAULT 0,
  funded_amount numeric(78, 0) NOT NULL DEFAULT 0,
  views int NOT NULL DEFAULT 0,
  unique_viewers int NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day)
);
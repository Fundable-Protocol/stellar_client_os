-- Campaign sequel/franchise persistence for linking related and
-- follow-up campaigns. PostgreSQL-compatible; idempotent.
--
-- Sequels are directed edges (source -> target) so creators can model
-- series ("part 2 continues part 1"), prequels, spin-offs, and loose
-- universe references. Edges can be grouped into named franchises.

CREATE TABLE IF NOT EXISTS campaign_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  creator text NOT NULL,
  organization text,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_sequels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'SEQUEL',
  sort_order int,
  series_id uuid REFERENCES campaign_series(id) ON DELETE SET NULL,
  notes text,
  linked_by text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT campaign_sequels_relation_check CHECK (
    relation IN ('SEQUEL', 'PREQUEL', 'SPINOFF', 'RELATED')
  ),
  CONSTRAINT campaign_sequels_distinct_check CHECK (source_campaign_id <> target_campaign_id),
  CONSTRAINT campaign_sequels_unique_pair UNIQUE (source_campaign_id, target_campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_sequels_source_idx
  ON campaign_sequels (source_campaign_id, relation, sort_order);
CREATE INDEX IF NOT EXISTS campaign_sequels_target_idx
  ON campaign_sequels (target_campaign_id);
CREATE INDEX IF NOT EXISTS campaign_sequels_series_idx
  ON campaign_sequels (series_id);

-- Seed a default universe for the demo campaigns so the "next in series"
-- surface has content out of the box.
INSERT INTO campaign_series (id, name, description, creator)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Eco Guardians',
  'Community-led conservation franchise.',
  'GD6W...X892'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_sequels (
  id, source_campaign_id, target_campaign_id, relation, sort_order, series_id, linked_by
)
SELECT
  '00000000-0000-0000-0000-000000000002',
  c1.id, c2.id, 'SEQUEL', 1, '00000000-0000-0000-0000-000000000001', 'GD6W...X892'
FROM campaigns c1, campaigns c2
WHERE c1.name = 'Save the Amazon RainForest Reserve'
  AND c2.name = 'Amazon Guardian Program'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_sequels
    WHERE source_campaign_id = c1.id AND target_campaign_id = c2.id
  );
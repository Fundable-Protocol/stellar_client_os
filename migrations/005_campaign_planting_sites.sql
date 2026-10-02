-- Campaign geolocation: GPS coordinates for planting sites (v1)
--
-- Stores the GPS coordinates of each campaign's planting site(s) and the
-- species planted there, so the global planting map can show every active
-- planting location with tree counts and a species breakdown.
--
-- PostgreSQL-compatible; idempotent.

-- GPS coordinates per campaign planting site.
CREATE TABLE IF NOT EXISTS campaign_gps_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  latitude numeric(9, 6) NOT NULL
    CONSTRAINT campaign_gps_locations_latitude_check CHECK (
      latitude BETWEEN -90 AND 90
    ),
  longitude numeric(9, 6) NOT NULL
    CONSTRAINT campaign_gps_locations_longitude_check CHECK (
      longitude BETWEEN -180 AND 180
    ),
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS campaign_gps_locations_campaign_idx
  ON campaign_gps_locations (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_gps_locations_geo_idx
  ON campaign_gps_locations (latitude, longitude);

-- Species planted per campaign (parsed/denormalized from tree species input).
CREATE TABLE IF NOT EXISTS campaign_planting_species (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  species text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, species)
);

CREATE INDEX IF NOT EXISTS campaign_planting_species_species_idx
  ON campaign_planting_species (species);
-- Create Creator Portfolio Tables
-- Adds support for creator bios, social links, and achievements

-- Creator profiles table
CREATE TABLE IF NOT EXISTS creator_profiles (
  creator_address text PRIMARY KEY,
  display_name text,
  bio text,
  profile_image_url text,
  website_url text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  CONSTRAINT bio_max_length CHECK (char_length(bio) <= 500),
  CONSTRAINT display_name_max_length CHECK (char_length(display_name) <= 100)
);

-- Social links table
CREATE TABLE IF NOT EXISTS creator_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address text NOT NULL REFERENCES creator_profiles(creator_address) ON DELETE CASCADE,
  platform text NOT NULL,
  username text,
  url text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  CONSTRAINT valid_platform CHECK (
    platform IN ('twitter', 'instagram', 'facebook', 'linkedin', 'website', 'github')
  ),
  CONSTRAINT max_social_links UNIQUE (creator_address, platform)
);

-- Creator achievements table
CREATE TABLE IF NOT EXISTS creator_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address text NOT NULL REFERENCES creator_profiles(creator_address) ON DELETE CASCADE,
  achievement_name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  rarity text NOT NULL,
  unlocked_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  CONSTRAINT valid_rarity CHECK (
    rarity IN ('common', 'rare', 'epic', 'legendary')
  )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_creator_profiles_created_at ON creator_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_achievements_creator_address ON creator_achievements(creator_address);
CREATE INDEX IF NOT EXISTS idx_creator_achievements_unlocked_at ON creator_achievements(unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_social_links_creator_address ON creator_social_links(creator_address);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_creator_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER creator_profiles_updated_at_trigger
BEFORE UPDATE ON creator_profiles
FOR EACH ROW
EXECUTE FUNCTION update_creator_profiles_updated_at();

-- Migration: Add episode_guests table
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS episode_guests (
  guest_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_role TEXT NOT NULL DEFAULT 'guest' CHECK (guest_role IN ('guest', 'co-host', 'host')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_guests_episode ON episode_guests(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_guests_name ON episode_guests(guest_name);

-- Add trigger for updated_at
CREATE TRIGGER update_episode_guests_updated_at BEFORE UPDATE ON episode_guests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

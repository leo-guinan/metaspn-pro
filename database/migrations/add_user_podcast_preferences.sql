-- Migration: Add user_podcast_preferences table
-- Created: 2026-01-23

CREATE TABLE IF NOT EXISTS user_podcast_preferences (
  preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(podcast_id) ON DELETE CASCADE,
  started_listening_date DATE,
  listen_regularity TEXT CHECK (listen_regularity IN ('every-episode', 'most-episodes', 'occasional', 'rarely')),
  typical_listen_speed TEXT CHECK (typical_listen_speed IN ('same-day', '1-3-days', '1-week', 'long-tail')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, podcast_id)
);

CREATE INDEX IF NOT EXISTS idx_user_podcast_preferences_user ON user_podcast_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_podcast_preferences_podcast ON user_podcast_preferences(podcast_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_podcast_preferences_updated_at BEFORE UPDATE ON user_podcast_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

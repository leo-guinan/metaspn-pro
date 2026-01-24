-- Migration: Add podcast_ownership table
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS podcast_ownership (
  ownership_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(podcast_id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed')),
  verification_method TEXT NOT NULL DEFAULT 'meta_tag' CHECK (verification_method IN ('meta_tag')),
  verification_token TEXT UNIQUE NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, podcast_id)
);

CREATE INDEX IF NOT EXISTS idx_podcast_ownership_user ON podcast_ownership(user_id);
CREATE INDEX IF NOT EXISTS idx_podcast_ownership_podcast ON podcast_ownership(podcast_id);
CREATE INDEX IF NOT EXISTS idx_podcast_ownership_status ON podcast_ownership(verification_status);
CREATE INDEX IF NOT EXISTS idx_podcast_ownership_token ON podcast_ownership(verification_token);

-- Add trigger for updated_at
CREATE TRIGGER update_podcast_ownership_updated_at BEFORE UPDATE ON podcast_ownership
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

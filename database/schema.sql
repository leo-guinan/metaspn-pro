-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: pgvector extension removed - using Chroma Cloud for vector storage

-- Users table
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Podcasts table
CREATE TABLE podcasts (
  podcast_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  rss_feed_url TEXT,
  website_url TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Episodes table
CREATE TABLE episodes (
  episode_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES podcasts(podcast_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration_sec DECIMAL NOT NULL,
  release_time TIMESTAMPTZ,
  audio_url TEXT,
  transcript_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events table (append-only event ledger)
CREATE TABLE events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(podcast_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('play', 'pause', 'finish', 'bounce', 'highlight', 'note', 'share')),
  timestamp_utc TIMESTAMPTZ NOT NULL,
  playhead_sec DECIMAL,
  episode_duration_sec DECIMAL,
  client TEXT NOT NULL CHECK (client IN ('web', 'ios', 'import')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transcript chunks table
CREATE TABLE transcript_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  start_sec DECIMAL NOT NULL,
  end_sec DECIMAL NOT NULL,
  text TEXT NOT NULL,
  chroma_id TEXT, -- Reference to Chroma Cloud collection item (embeddings stored in Chroma)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expressions table (user-generated content)
CREATE TABLE expressions (
  expression_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  timestamp_utc TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'twitter', 'bluesky', 'github')),
  chroma_id TEXT, -- Reference to Chroma Cloud collection item (embeddings stored in Chroma)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Influence links table
CREATE TABLE influence_links (
  link_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  expression_id UUID NOT NULL REFERENCES expressions(expression_id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES transcript_chunks(chunk_id) ON DELETE SET NULL,
  similarity DECIMAL NOT NULL,
  days_after_listen DECIMAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reports table
CREATE TABLE reports (
  report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'monthly', 'influence_digest')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for events table
CREATE INDEX idx_events_user_episode ON events(user_id, episode_id);
CREATE INDEX idx_events_timestamp ON events(timestamp_utc);
CREATE INDEX idx_events_user_timestamp ON events(user_id, timestamp_utc);
CREATE INDEX idx_events_episode ON events(episode_id);

-- Indexes for transcript chunks
CREATE INDEX idx_transcript_chunks_episode ON transcript_chunks(episode_id);
CREATE INDEX idx_transcript_chunks_chroma_id ON transcript_chunks(chroma_id);

-- Indexes for expressions
CREATE INDEX idx_expressions_user ON expressions(user_id);
CREATE INDEX idx_expressions_timestamp ON expressions(timestamp_utc);
CREATE INDEX idx_expressions_chroma_id ON expressions(chroma_id);

-- Indexes for influence links
CREATE INDEX idx_influence_links_episode ON influence_links(episode_id);
CREATE INDEX idx_influence_links_expression ON influence_links(expression_id);
CREATE INDEX idx_influence_links_similarity ON influence_links(similarity);

-- Indexes for episodes
CREATE INDEX idx_episodes_podcast ON episodes(podcast_id);
CREATE INDEX idx_episodes_release_time ON episodes(release_time);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_podcasts_updated_at BEFORE UPDATE ON podcasts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON episodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: Additional tables are created via migrations:
-- - podcast_ownership: Tracks podcast ownership and verification status (see migrations/add_podcast_ownership.sql)
-- - episode_guests: Tracks guests appearing on episodes (see migrations/add_episode_guests.sql)
-- - user_podcast_preferences: User preferences for podcasts (see migrations/add_user_podcast_preferences.sql)

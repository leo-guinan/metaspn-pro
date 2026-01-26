-- Migration: Add network protocol tables
-- Created: 2026-01-26
-- GitHub Network Protocol: Watch relationships, gates, feeds, hubs, and network events

-- Network watches: Who watches whom
CREATE TABLE IF NOT EXISTS network_watches (
  watch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watcher_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  watched_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  watched_repo_owner TEXT NOT NULL,
  watched_repo_name TEXT NOT NULL,
  watch_type TEXT NOT NULL CHECK (watch_type IN ('full', 'selective', 'minimal')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(watcher_user_id, watched_user_id)
);

-- Network gates: Gate configurations per watch
CREATE TABLE IF NOT EXISTS network_gates (
  gate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_id UUID NOT NULL REFERENCES network_watches(watch_id) ON DELETE CASCADE,
  gate_type TEXT NOT NULL CHECK (gate_type IN (
    'game_filter',
    'quality_threshold',
    'relevance_matcher',
    'network_trust',
    'temporal',
    'emergence_detector'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0, -- Order of evaluation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(watch_id, gate_type)
);

-- Network feeds: Feed repositories per user
CREATE TABLE IF NOT EXISTS network_feeds (
  feed_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  access_token_encrypted TEXT NOT NULL,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Network hubs: Hub repositories per user (control panel)
CREATE TABLE IF NOT EXISTS network_hubs (
  hub_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  access_token_encrypted TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'selective', 'public')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Feed items: Individual feed entries
CREATE TABLE IF NOT EXISTS feed_items (
  item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_id UUID NOT NULL REFERENCES network_feeds(feed_id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  source_repo_owner TEXT NOT NULL,
  source_repo_name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('artifact', 'source', 'report', 'trajectory_shift')),
  content_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  gate_pass_info JSONB DEFAULT '{}'::jsonb, -- Which gates passed
  network_context JSONB DEFAULT '{}'::jsonb, -- Mutual watchers, shared influences
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'processed', 'saved')),
  timestamp_utc TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Network events: Processed GitHub webhook events
CREATE TABLE IF NOT EXISTS network_events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  github_event_type TEXT NOT NULL, -- 'push', 'release', etc.
  github_event_id TEXT, -- GitHub's event ID
  commit_sha TEXT,
  changes_detected JSONB DEFAULT '{}'::jsonb, -- What changed (artifacts, sources, reports)
  analysis_results JSONB DEFAULT '{}'::jsonb, -- Game signature, themes, quality scores
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for network_watches
CREATE INDEX IF NOT EXISTS idx_network_watches_watcher ON network_watches(watcher_user_id);
CREATE INDEX IF NOT EXISTS idx_network_watches_watched ON network_watches(watched_user_id);
CREATE INDEX IF NOT EXISTS idx_network_watches_active ON network_watches(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_network_watches_repo ON network_watches(watched_repo_owner, watched_repo_name);

-- Indexes for network_gates
CREATE INDEX IF NOT EXISTS idx_network_gates_watch ON network_gates(watch_id);
CREATE INDEX IF NOT EXISTS idx_network_gates_type ON network_gates(gate_type);
CREATE INDEX IF NOT EXISTS idx_network_gates_enabled ON network_gates(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_network_gates_priority ON network_gates(watch_id, priority);

-- Indexes for network_feeds
CREATE INDEX IF NOT EXISTS idx_network_feeds_user ON network_feeds(user_id);

-- Indexes for network_hubs
CREATE INDEX IF NOT EXISTS idx_network_hubs_user ON network_hubs(user_id);

-- Indexes for feed_items
CREATE INDEX IF NOT EXISTS idx_feed_items_feed ON feed_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_source_user ON feed_items(source_user_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_status ON feed_items(status);
CREATE INDEX IF NOT EXISTS idx_feed_items_timestamp ON feed_items(timestamp_utc);
CREATE INDEX IF NOT EXISTS idx_feed_items_type ON feed_items(item_type);

-- Indexes for network_events
CREATE INDEX IF NOT EXISTS idx_network_events_user ON network_events(user_id);
CREATE INDEX IF NOT EXISTS idx_network_events_repo ON network_events(repo_owner, repo_name);
CREATE INDEX IF NOT EXISTS idx_network_events_processed ON network_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_network_events_type ON network_events(github_event_type);

-- Triggers for updated_at
CREATE TRIGGER update_network_watches_updated_at BEFORE UPDATE ON network_watches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_network_gates_updated_at BEFORE UPDATE ON network_gates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_network_feeds_updated_at BEFORE UPDATE ON network_feeds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_network_hubs_updated_at BEFORE UPDATE ON network_hubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

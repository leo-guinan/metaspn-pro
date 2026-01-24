-- Migration: Add user_github_repos table
-- Created: 2026-01-24
-- GitHub repo connections for append-only listening log push.

CREATE TABLE IF NOT EXISTS user_github_repos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  is_created_by_us BOOLEAN NOT NULL DEFAULT false,
  access_token_encrypted TEXT NOT NULL,
  last_push_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, repo_owner, repo_name)
);

CREATE INDEX IF NOT EXISTS idx_user_github_repos_user ON user_github_repos(user_id);

CREATE TRIGGER update_user_github_repos_updated_at BEFORE UPDATE ON user_github_repos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

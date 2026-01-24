-- Migration: Add Twitter sync tracking to user_github_repos table
-- Created: 2026-01-24
-- Tracks when Twitter archive was last synced to GitHub repository

-- Add last_twitter_sync_at column to track Twitter archive syncs
ALTER TABLE user_github_repos 
ADD COLUMN IF NOT EXISTS last_twitter_sync_at TIMESTAMPTZ;

-- Add index for querying repos that need syncing
CREATE INDEX IF NOT EXISTS idx_user_github_repos_twitter_sync 
ON user_github_repos(user_id, last_twitter_sync_at) 
WHERE last_twitter_sync_at IS NOT NULL;

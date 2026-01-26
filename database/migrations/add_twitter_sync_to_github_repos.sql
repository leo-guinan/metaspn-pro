-- Migration: Add Twitter sync tracking to user_github_repos table
-- Created: 2026-01-24
-- Tracks when Twitter archive was last synced to GitHub repository
-- NOTE: This migration depends on add_user_github_repos.sql (table must exist first)

-- Add last_twitter_sync_at column to track Twitter archive syncs
-- Only add if table exists (migration may run before table is created)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_github_repos') THEN
    ALTER TABLE user_github_repos 
    ADD COLUMN IF NOT EXISTS last_twitter_sync_at TIMESTAMPTZ;
    
    -- Add index for querying repos that need syncing
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = 'user_github_repos' 
      AND indexname = 'idx_user_github_repos_twitter_sync'
    ) THEN
      CREATE INDEX idx_user_github_repos_twitter_sync 
      ON user_github_repos(user_id, last_twitter_sync_at) 
      WHERE last_twitter_sync_at IS NOT NULL;
    END IF;
  END IF;
END $$;

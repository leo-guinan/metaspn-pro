-- Migration: Add enhancement tracking columns to user_github_repos
-- Purpose: Track when repositories were last enhanced with game classification
-- Run this migration to enable the repo enhancement worker to track its progress

-- Add last_enhancement_at timestamp to track when the repo was last processed
ALTER TABLE user_github_repos
ADD COLUMN IF NOT EXISTS last_enhancement_at TIMESTAMPTZ;

-- Add enhancement_status to track the current state
-- Values: 'pending', 'in_progress', 'completed', 'no_changes', 'failed'
ALTER TABLE user_github_repos
ADD COLUMN IF NOT EXISTS enhancement_status TEXT DEFAULT 'pending';

-- Add index for efficient querying of repos needing enhancement
CREATE INDEX IF NOT EXISTS idx_user_github_repos_enhancement 
ON user_github_repos (last_enhancement_at NULLS FIRST, enhancement_status);

-- Comment on columns for documentation
COMMENT ON COLUMN user_github_repos.last_enhancement_at IS 'Timestamp of the last successful enhancement run';
COMMENT ON COLUMN user_github_repos.enhancement_status IS 'Current enhancement status: pending, in_progress, completed, no_changes, failed';

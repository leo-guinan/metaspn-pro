-- Migration: Add user_oauth_accounts table and update users table
-- Created: 2026-01-24
-- OAuth account connections for multi-provider authentication

-- Create user_oauth_accounts table
CREATE TABLE IF NOT EXISTS user_oauth_accounts (
  account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('twitter', 'github')),
  provider_user_id TEXT NOT NULL, -- Twitter user ID, GitHub login
  provider_username TEXT, -- Twitter handle, GitHub username
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT, -- If provider supports it
  token_expires_at TIMESTAMPTZ,
  profile_data JSONB DEFAULT '{}'::jsonb, -- Store provider profile info
  verified BOOLEAN NOT NULL DEFAULT true, -- Account verified with provider
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id) -- One account per provider user
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_user ON user_oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_provider ON user_oauth_accounts(provider, provider_user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_oauth_accounts_updated_at BEFORE UPDATE ON user_oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update users table with new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_provider TEXT CHECK (primary_provider IN ('twitter', 'github'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

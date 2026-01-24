import { pool } from '../db/index.js'
import { encryptToken, decryptToken } from './github.js'

export type OAuthProvider = 'twitter' | 'github'

export interface OAuthAccountData {
  provider_user_id: string
  provider_username: string | null
  access_token: string
  refresh_token?: string
  token_expires_at?: Date
  profile_data?: Record<string, any>
}

export interface OAuthAccount {
  account_id: string
  provider: OAuthProvider
  provider_user_id: string
  provider_username: string | null
  verified: boolean
  profile_data: Record<string, any>
  created_at: Date
}

// Re-export encryption functions for consistency
export { encryptToken, decryptToken }

// Find or create user from OAuth account
export async function findOrCreateUserFromOAuth(
  provider: OAuthProvider,
  accountData: OAuthAccountData
): Promise<{ user_id: string; is_new: boolean }> {
  // First, check if this OAuth account is already linked
  const existingAccount = await pool.query(
    `SELECT user_id FROM user_oauth_accounts 
     WHERE provider = $1 AND provider_user_id = $2`,
    [provider, accountData.provider_user_id]
  )

  if (existingAccount.rows.length > 0) {
    // Account already exists, return existing user
    return { user_id: existingAccount.rows[0].user_id, is_new: false }
  }

  // Create new user
  const email = `${accountData.provider_user_id}@${provider}.oauth` // Placeholder email
  const displayName = accountData.provider_username || accountData.provider_user_id
  const avatarUrl = accountData.profile_data?.profile_image_url || accountData.profile_data?.avatar_url || null

  const userResult = await pool.query(
    `INSERT INTO users (email, name, display_name, avatar_url, primary_provider)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       primary_provider = COALESCE(users.primary_provider, EXCLUDED.primary_provider)
     RETURNING user_id`,
    [email, displayName, displayName, avatarUrl, provider]
  )

  const user_id = userResult.rows[0].user_id

  // Create OAuth account record
  const encryptedAccessToken = encryptToken(accountData.access_token)
  const encryptedRefreshToken = accountData.refresh_token ? encryptToken(accountData.refresh_token) : null

  await pool.query(
    `INSERT INTO user_oauth_accounts (
      user_id, provider, provider_user_id, provider_username,
      access_token_encrypted, refresh_token_encrypted, token_expires_at, profile_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      user_id,
      provider,
      accountData.provider_user_id,
      accountData.provider_username,
      encryptedAccessToken,
      encryptedRefreshToken,
      accountData.token_expires_at || null,
      JSON.stringify(accountData.profile_data || {}),
    ]
  )

  return { user_id, is_new: true }
}

// Link OAuth account to existing user
export async function linkOAuthAccount(
  user_id: string,
  provider: OAuthProvider,
  accountData: OAuthAccountData
): Promise<void> {
  // Check if this OAuth account is already linked to another user
  const existingAccount = await pool.query(
    `SELECT user_id FROM user_oauth_accounts 
     WHERE provider = $1 AND provider_user_id = $2`,
    [provider, accountData.provider_user_id]
  )

  if (existingAccount.rows.length > 0) {
    if (existingAccount.rows[0].user_id !== user_id) {
      throw new Error(`This ${provider} account is already linked to another user`)
    }
    // Already linked to this user, update tokens
    await updateOAuthAccountTokens(provider, accountData.provider_user_id, accountData)
    return
  }

  // Link new account
  const encryptedAccessToken = encryptToken(accountData.access_token)
  const encryptedRefreshToken = accountData.refresh_token ? encryptToken(accountData.refresh_token) : null

  await pool.query(
    `INSERT INTO user_oauth_accounts (
      user_id, provider, provider_user_id, provider_username,
      access_token_encrypted, refresh_token_encrypted, token_expires_at, profile_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (provider, provider_user_id) DO UPDATE SET
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      token_expires_at = EXCLUDED.token_expires_at,
      profile_data = EXCLUDED.profile_data,
      updated_at = NOW()`,
    [
      user_id,
      provider,
      accountData.provider_user_id,
      accountData.provider_username,
      encryptedAccessToken,
      encryptedRefreshToken,
      accountData.token_expires_at || null,
      JSON.stringify(accountData.profile_data || {}),
    ]
  )
}

// Update OAuth account tokens (for refresh scenarios)
export async function updateOAuthAccountTokens(
  provider: OAuthProvider,
  provider_user_id: string,
  accountData: Pick<OAuthAccountData, 'access_token' | 'refresh_token' | 'token_expires_at'>
): Promise<void> {
  const encryptedAccessToken = encryptToken(accountData.access_token)
  const encryptedRefreshToken = accountData.refresh_token ? encryptToken(accountData.refresh_token) : null

  await pool.query(
    `UPDATE user_oauth_accounts
     SET access_token_encrypted = $1,
         refresh_token_encrypted = $2,
         token_expires_at = $3,
         updated_at = NOW()
     WHERE provider = $4 AND provider_user_id = $5`,
    [
      encryptedAccessToken,
      encryptedRefreshToken,
      accountData.token_expires_at || null,
      provider,
      provider_user_id,
    ]
  )
}

// Get all OAuth accounts for a user
export async function getUserOAuthAccounts(user_id: string): Promise<OAuthAccount[]> {
  const result = await pool.query(
    `SELECT account_id, provider, provider_user_id, provider_username, verified, profile_data, created_at
     FROM user_oauth_accounts
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [user_id]
  )

  return result.rows.map((row) => ({
    account_id: row.account_id,
    provider: row.provider as OAuthProvider,
    provider_user_id: row.provider_user_id,
    provider_username: row.provider_username,
    verified: row.verified,
    profile_data: row.profile_data || {},
    created_at: row.created_at,
  }))
}

// Get OAuth account by provider and user_id
export async function getOAuthAccount(
  user_id: string,
  provider: OAuthProvider
): Promise<OAuthAccount | null> {
  const result = await pool.query(
    `SELECT account_id, provider, provider_user_id, provider_username, verified, profile_data, created_at
     FROM user_oauth_accounts
     WHERE user_id = $1 AND provider = $2
     LIMIT 1`,
    [user_id, provider]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    account_id: row.account_id,
    provider: row.provider as OAuthProvider,
    provider_user_id: row.provider_user_id,
    provider_username: row.provider_username,
    verified: row.verified,
    profile_data: row.profile_data || {},
    created_at: row.created_at,
  }
}

// Unlink OAuth account
export async function unlinkOAuthAccount(user_id: string, provider: OAuthProvider): Promise<void> {
  // Check if this is the only account
  const accountCount = await pool.query(
    `SELECT COUNT(*) as count FROM user_oauth_accounts WHERE user_id = $1`,
    [user_id]
  )

  if (parseInt(accountCount.rows[0].count) <= 1) {
    throw new Error('Cannot unlink the only OAuth account. Please link another account first.')
  }

  await pool.query(`DELETE FROM user_oauth_accounts WHERE user_id = $1 AND provider = $2`, [user_id, provider])
}

// Get decrypted access token for a user's OAuth account
export async function getDecryptedAccessToken(
  user_id: string,
  provider: OAuthProvider
): Promise<string | null> {
  const result = await pool.query(
    `SELECT access_token_encrypted FROM user_oauth_accounts
     WHERE user_id = $1 AND provider = $2
     LIMIT 1`,
    [user_id, provider]
  )

  if (result.rows.length === 0) return null

  try {
    return decryptToken(result.rows[0].access_token_encrypted)
  } catch {
    return null
  }
}

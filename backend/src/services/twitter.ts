import { createHash, randomBytes } from 'crypto'

const TWITTER_API_BASE = 'https://api.twitter.com/2'

// Generate PKCE code verifier and challenge
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

// Generate Twitter OAuth 2.0 authorization URL with PKCE
export function getOAuthAuthUrl(state: string, codeChallenge: string): string {
  const clientId = process.env.TWITTER_CLIENT_ID
  const callback = process.env.TWITTER_CALLBACK_URL || 'http://localhost:3001/api/auth/twitter/callback'
  if (!clientId) throw new Error('TWITTER_CLIENT_ID is not set')

  const scopes = ['tweet.read', 'users.read', 'offline.access'].join(' ')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callback,
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256', // Using SHA256 hash method for PKCE
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

// Exchange authorization code for access token
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET
  const callback = process.env.TWITTER_CALLBACK_URL || 'http://localhost:3001/api/auth/twitter/callback'

  if (!clientId || !clientSecret) {
    throw new Error('TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET is not set')
  }

  // Twitter uses Basic Auth for client credentials
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: callback,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Twitter OAuth token exchange failed: ${error}`)
  }

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Twitter OAuth exchange failed')
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  }
}

// Get Twitter user profile
export async function getUserProfile(accessToken: string): Promise<{
  id: string
  username: string
  name: string
  profile_image_url?: string
}> {
  const response = await fetch(`${TWITTER_API_BASE}/users/me?user.fields=profile_image_url`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Twitter API error: ${error}`)
  }

  const data = (await response.json()) as {
    data?: {
      id: string
      username: string
      name: string
      profile_image_url?: string
    }
    errors?: Array<{ message: string }>
  }

  if (data.errors || !data.data) {
    throw new Error(data.errors?.[0]?.message || 'Failed to get Twitter user profile')
  }

  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name,
    profile_image_url: data.data.profile_image_url,
  }
}

// Verify token is still valid by making a lightweight API call
export async function verifyToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${TWITTER_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

// Refresh access token using refresh token
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET is not set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Twitter token refresh failed: ${error}`)
  }

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Twitter token refresh failed')
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  }
}

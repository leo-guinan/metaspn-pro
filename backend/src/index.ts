import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type {
  HonoBindings,
  HonoVariables,
} from '@mastra/hono'

// Mastra imports - made optional for simple build
// Set USE_MASTRA=false to disable Mastra and run in simple mode
const USE_MASTRA = process.env.USE_MASTRA !== 'false'

let MastraServer: any
let mastra: any
let podcastDiscoveryWorkflow: any
let parseRSSFeed: any
let createPodcast: any
let getUserPodcastPreferences: any
let saveUserPodcastPreferences: any
let safeExecuteTool: any
let getDashboardData: any

// Load Mastra modules asynchronously (if enabled)
async function loadMastraModules() {
  if (!USE_MASTRA) {
    console.log('ℹ️  Mastra disabled (USE_MASTRA=false) - running in simple mode')
    return
  }

  try {
    const mastraModule = await import('@mastra/hono')
    MastraServer = mastraModule.MastraServer
    const mastraIndex = await import('./mastra/index.js')
    mastra = mastraIndex.mastra
    const workflowModule = await import('./mastra/workflows/podcast-discovery-workflow.js')
    podcastDiscoveryWorkflow = workflowModule.podcastDiscoveryWorkflow
    const toolsModule = await import('./mastra/tools/podcast-discovery-tools.js')
    parseRSSFeed = toolsModule.parseRSSFeed
    createPodcast = toolsModule.createPodcast
    const prefToolsModule = await import('./mastra/tools/user-preference-tools.js')
    getUserPodcastPreferences = prefToolsModule.getUserPodcastPreferences
    saveUserPodcastPreferences = prefToolsModule.saveUserPodcastPreferences
    const toolHelpersModule = await import('./mastra/utils/tool-helpers.js')
    safeExecuteTool = toolHelpersModule.safeExecuteTool
    const dashboardToolsModule = await import('./mastra/tools/dashboard-tools.js')
    getDashboardData = dashboardToolsModule.getDashboardData
    console.log('✅ Mastra modules loaded successfully')
  } catch (error) {
    console.warn('⚠️  Mastra modules failed to load - running in simple mode (OAuth routes will work, Mastra features disabled)')
    console.warn('   Error:', (error as Error).message)
  }
}
import { pool } from './db/index.js'
import {
  getOAuthAuthUrl,
  exchangeCodeForToken,
  createOctokit,
  createRepo,
  getRepo,
  seedRepo,
  encryptToken,
  decryptToken,
  seedFeedRepo,
  setupWebhook,
} from './services/github.js'
import { pushToGitHubForUser } from './services/github-push.js'
import { getRepoStats } from './services/github-repo-stats.js'
import { syncTwitterArchiveToGitHub, checkArchiveAvailable } from './services/twitter-github-sync.js'
import { generatePKCE, getOAuthAuthUrl as getTwitterOAuthAuthUrl, exchangeCodeForToken as exchangeTwitterCodeForToken, getUserProfile as getTwitterUserProfile } from './services/twitter.js'
import { findOrCreateUserFromOAuth, linkOAuthAccount, getUserOAuthAccounts, unlinkOAuthAccount, getOAuthAccount, type OAuthProvider } from './services/oauth.js'
import { generateToken } from './services/jwt.js'
import { requireAuth } from './middleware/auth.js'
import { requirePodcastOwnership } from './middleware/ownership.js'
import { requireAdmin } from './middleware/admin.js'
import {
  getRuns,
  getRunDetail,
  getStats,
  getWorkflowNames,
  isUserAdmin,
  startRun,
  endRun,
  type RunsFilter,
} from './services/tracking.js'
import { verifyToken } from './services/jwt.js'
import {
  claimPodcastOwnership,
  verifyOwnershipViaMetaTag,
  getOwnedPodcasts,
  checkOwnership,
  checkExistingVerifiedOwnership,
  validateDomainConsistency,
} from './services/podcast-ownership.js'
import {
  getHostPodcastAnalytics,
  getEpisodeAnalytics,
  getGuestAnalytics,
} from './mastra/tools/host-analytics-tools.js'
import {
  addEpisodeGuest,
  getEpisodeGuests,
  getPodcastGuests,
  updateEpisodeGuest,
} from './mastra/tools/guest-management-tools.js'

import {
  FRONTEND_URL,
  getGitHubCallbackUrl,
  getTwitterCallbackUrl,
  getCorsOrigins,
} from './config/oauth-urls.js'
import { processWebhookEvent, type GitHubPushEvent } from './services/network-processor.js'
import { createHmac } from 'crypto'
import {
  addWatch,
  removeWatch,
  listWatches,
  listWatchers,
  updateWatchGates,
} from './services/network-watch.js'
import { createHubRepo, syncHubRepo, getHubStatus } from './services/hub-manager.js'
import { markFeedItemProcessed, saveFeedItem } from './services/feed-generator.js'
import {
  findSimilarUsers,
  getWatchSuggestions,
  getEmergingTopics,
} from './services/network-discovery.js'

// OAuth store: state -> { user_id?, codeVerifier? (for Twitter), isLinking?: boolean, token?: string }
const oauthStore = new Map<string, { user_id?: string; codeVerifier?: string; isLinking?: boolean; token?: string }>()
const OAUTH_TTL_MS = 10 * 60 * 1000

function pruneOAuthStore() {
  // In production, use Redis or similar with TTL. Here we just prune size.
  if (oauthStore.size > 1000) {
    const keys = [...oauthStore.keys()]
    keys.slice(0, 500).forEach((k) => oauthStore.delete(k))
  }
}

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>()

app.use(
  '*',
  cors({
    origin: getCorsOrigins(),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// Initialize MastraServer if available (optional) - will be set in startServer()
let server: any = null

// Health check endpoint (before init)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

function normalizeUserId(userId: string): string {
  return userId === 'demo-user-id' ? '00000000-0000-0000-0000-000000000000' : userId
}

// ============================================================================
// Authentication Endpoints
// ============================================================================

// Start OAuth login flow
app.get('/api/auth/:provider/login', (c) => {
  try {
    const provider = c.req.param('provider') as OAuthProvider
    if (provider !== 'twitter' && provider !== 'github') {
      return c.json({ error: 'Invalid provider. Use "twitter" or "github"' }, 400)
    }

    const state = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    
    if (provider === 'twitter') {
      // Twitter uses PKCE
      const { codeVerifier, codeChallenge } = generatePKCE()
      oauthStore.set(state, { codeVerifier, isLinking: false })
      pruneOAuthStore()
      const callbackUrl = getTwitterCallbackUrl()
      console.log(`[OAuth Login] Twitter - FRONTEND_URL: ${FRONTEND_URL}, Callback URL: ${callbackUrl}`)
      const url = getTwitterOAuthAuthUrl(state, codeChallenge)
      console.log(`[OAuth Login] Twitter - Redirecting to OAuth provider: ${url}`)
      return c.redirect(url, 302)
    } else {
      // GitHub OAuth
      oauthStore.set(state, { isLinking: false })
      pruneOAuthStore()
      const callbackUrl = getGitHubCallbackUrl()
      console.log(`[OAuth Login] GitHub - FRONTEND_URL: ${FRONTEND_URL}, Callback URL: ${callbackUrl}`)
      const url = getOAuthAuthUrl(state, callbackUrl)
      console.log(`[OAuth Login] GitHub - Redirecting to OAuth provider: ${url}`)
      return c.redirect(url, 302)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// OAuth callback handler
app.get('/api/auth/:provider/callback', async (c) => {
  try {
    const provider = c.req.param('provider') as OAuthProvider
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    console.log(`[OAuth Callback] Provider: ${provider}, FRONTEND_URL: ${FRONTEND_URL}, env.FRONTEND_URL: ${process.env.FRONTEND_URL}`)

    if (error) {
      const redirectUrl = `${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error)}`
      console.log(`[OAuth Callback] Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }

    if (!code || !state) {
      const redirectUrl = `${FRONTEND_URL}/auth/callback?error=missing_code_or_state`
      console.log(`[OAuth Callback] Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }

    const entry = oauthStore.get(state)
    if (!entry) {
      const redirectUrl = `${FRONTEND_URL}/auth/callback?error=invalid_state`
      console.log(`[OAuth Callback] Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }

    let accountData: {
      provider_user_id: string
      provider_username: string | null
      access_token: string
      refresh_token?: string
      token_expires_at?: Date
      profile_data?: Record<string, any>
    }

    if (provider === 'twitter') {
      if (!entry.codeVerifier) {
        return c.redirect(`${FRONTEND_URL}/auth/callback?error=missing_code_verifier`, 302)
      }

      const tokenData = await exchangeTwitterCodeForToken(code, entry.codeVerifier)
      const profile = await getTwitterUserProfile(tokenData.access_token)

      accountData = {
        provider_user_id: profile.id,
        provider_username: profile.username,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        profile_data: {
          name: profile.name,
          profile_image_url: profile.profile_image_url,
        },
      }
    } else {
      // GitHub
      const { access_token, login } = await exchangeCodeForToken(code)
      const octokit = createOctokit(access_token)
      const user = await octokit.rest.users.getAuthenticated()

      accountData = {
        provider_user_id: login,
        provider_username: login,
        access_token,
        profile_data: {
          name: user.data.name,
          avatar_url: user.data.avatar_url,
          email: user.data.email,
        },
      }
    }

    // Check if this is for integrations (has user_id but not isLinking flag)
    if (entry.user_id && !entry.isLinking && !entry.token) {
      // This is a GitHub integrations flow - store token and redirect to integrations page
      const { access_token } = accountData
      oauthStore.set(state, { ...entry, token: access_token })
      const redirectUrl = `${FRONTEND_URL}/settings/integrations?github=complete&code=${encodeURIComponent(state)}`
      console.log(`[OAuth Callback] GitHub integrations flow - Redirecting to: ${redirectUrl}`)
      console.log(`[OAuth Callback] FRONTEND_URL value: ${FRONTEND_URL}`)
      if (!FRONTEND_URL || FRONTEND_URL === '/' || FRONTEND_URL.startsWith('/')) {
        console.error(`[OAuth Callback] ERROR: FRONTEND_URL is invalid: "${FRONTEND_URL}"`)
        console.error(`[OAuth Callback] This will cause redirects to fail. Check environment variables.`)
      }
      return c.redirect(redirectUrl, 302)
    }

    oauthStore.delete(state)

    if (entry.isLinking && entry.user_id) {
      // Linking account to existing user
      await linkOAuthAccount(entry.user_id, provider, accountData)
      const token = generateToken(entry.user_id, provider)
      const redirectUrl = `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}&linked=true`
      console.log(`[OAuth Callback] Linking account - Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    } else {
      // New login - find or create user
      const { user_id, is_new } = await findOrCreateUserFromOAuth(provider, accountData)
      const token = generateToken(user_id, provider)
      const redirectUrl = `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}&is_new=${is_new}`
      console.log(`[OAuth Callback] Login success - Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('OAuth callback error:', e)
    const redirectUrl = `${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(msg)}`
    console.log(`[OAuth Callback] Error - Redirecting to: ${redirectUrl}`)
    return c.redirect(redirectUrl, 302)
  }
})

// Get current user info
app.get('/api/auth/me', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')

    const userResult = await pool.query(
      `SELECT user_id, email, name, display_name, avatar_url, primary_provider, created_at
       FROM users WHERE user_id = $1`,
      [user_id]
    )

    if (userResult.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404)
    }

    const user = userResult.rows[0]
    const accounts = await getUserOAuthAccounts(user_id)

    return c.json({
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        primary_provider: user.primary_provider,
        created_at: user.created_at,
      },
      accounts: accounts.map((acc) => ({
        account_id: acc.account_id,
        provider: acc.provider,
        provider_username: acc.provider_username,
        verified: acc.verified,
        created_at: acc.created_at,
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Link additional OAuth account
// Accepts token via query parameter (for browser redirects) or Authorization header
app.get('/api/auth/:provider/link', async (c) => {
  try {
    const provider = c.req.param('provider') as OAuthProvider
    
    // Try to get token from query parameter (for browser redirects) or Authorization header
    let token: string | null = null
    const tokenParam = c.req.query('token')
    const authHeader = c.req.header('Authorization')
    
    if (tokenParam) {
      token = tokenParam
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
    
    if (!token) {
      return c.json({ error: 'Unauthorized: Token required. Provide token as query parameter ?token=... or Authorization header' }, 401)
    }
    
    const payload = verifyToken(token)
    if (!payload || !payload.user_id) {
      return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401)
    }
    
    const user_id = payload.user_id

    if (provider !== 'twitter' && provider !== 'github') {
      return c.json({ error: 'Invalid provider. Use "twitter" or "github"' }, 400)
    }

    const state = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    oauthStore.set(state, { user_id, isLinking: true })
    pruneOAuthStore()

    if (provider === 'twitter') {
      const { codeVerifier, codeChallenge } = generatePKCE()
      oauthStore.set(state, { user_id, codeVerifier, isLinking: true })
      const url = getTwitterOAuthAuthUrl(state, codeChallenge)
      return c.redirect(url, 302)
    } else {
      // For account linking, use the auth callback URL
      const callbackUrl = getGitHubCallbackUrl()
      const url = getOAuthAuthUrl(state, callbackUrl)
      return c.redirect(url, 302)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Unlink OAuth account
app.delete('/api/auth/:provider/unlink', requireAuth, async (c) => {
  try {
    const provider = c.req.param('provider') as OAuthProvider
    const user_id = c.get('user_id')

    if (provider !== 'twitter' && provider !== 'github') {
      return c.json({ error: 'Invalid provider. Use "twitter" or "github"' }, 400)
    }

    await unlinkOAuthAccount(user_id, provider)
    return c.json({ success: true, message: `Unlinked ${provider} account` })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 400)
  }
})

// Logout (client-side token removal, this is just for consistency)
app.post('/api/auth/logout', requireAuth, (c) => {
  // In a production system, you might want to blacklist the token here
  // For now, we just return success - the client removes the token
  return c.json({ success: true, message: 'Logged out successfully' })
})

// GitHub OAuth: start flow
app.get('/api/integrations/github/auth', (c) => {
  try {
    const user_id = c.req.query('user_id')
    if (!user_id) return c.json({ error: 'user_id required' }, 400)
    const uid = normalizeUserId(user_id)
    const state = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    oauthStore.set(state, { user_id: uid })
    pruneOAuthStore()
    
    // For GitHub integrations, use the same callback URL as login
    // The main OAuth callback handler will detect this is an integrations flow
    // based on the state (entry.user_id is set but isLinking is false)
    const callbackUrl = getGitHubCallbackUrl()
    console.log(`[GitHub Integrations Auth] Starting OAuth flow for user_id: ${uid}`)
    console.log(`[GitHub Integrations Auth] Callback URL: ${callbackUrl}`)
    console.log(`[GitHub Integrations Auth] FRONTEND_URL: ${FRONTEND_URL}`)
    
    const url = getOAuthAuthUrl(state, callbackUrl)
    console.log(`[GitHub Integrations Auth] Redirecting to GitHub OAuth: ${url}`)
    return c.redirect(url, 302)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[GitHub Integrations Auth] Error: ${msg}`)
    return c.json({ error: msg }, 500)
  }
})

// GitHub OAuth: callback (dedicated endpoint for integrations)
app.get('/api/integrations/github/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    console.log(`[GitHub Integrations Callback] Received callback - code: ${code ? 'present' : 'missing'}, state: ${state ? 'present' : 'missing'}`)
    console.log(`[GitHub Integrations Callback] FRONTEND_URL: ${FRONTEND_URL}`)
    
    if (!code || !state) {
      const redirectUrl = `${FRONTEND_URL}/settings/integrations?github=error&error=missing`
      console.log(`[GitHub Integrations Callback] Missing code or state - Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }
    
    const entry = oauthStore.get(state)
    if (!entry || !entry.user_id) {
      const redirectUrl = `${FRONTEND_URL}/settings/integrations?github=error&error=invalid_state`
      console.log(`[GitHub Integrations Callback] Invalid state or missing user_id - Redirecting to: ${redirectUrl}`)
      return c.redirect(redirectUrl, 302)
    }
    
    const user_id = entry.user_id
    const { access_token } = await exchangeCodeForToken(code)
    oauthStore.set(state, { ...entry, token: access_token })
    
    const redirectUrl = `${FRONTEND_URL}/settings/integrations?github=complete&code=${encodeURIComponent(state)}`
    console.log(`[GitHub Integrations Callback] Success - Redirecting to: ${redirectUrl}`)
    
    if (!FRONTEND_URL || FRONTEND_URL === '/' || FRONTEND_URL.startsWith('/')) {
      console.error(`[GitHub Integrations Callback] ERROR: FRONTEND_URL is invalid: "${FRONTEND_URL}"`)
      console.error(`[GitHub Integrations Callback] This will cause redirects to fail. Check environment variables.`)
    }
    
    return c.redirect(redirectUrl, 302)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[GitHub Integrations Callback] Error: ${msg}`)
    const redirectUrl = `${FRONTEND_URL}/settings/integrations?github=error&error=${encodeURIComponent(msg)}`
    console.log(`[GitHub Integrations Callback] Error redirect - Redirecting to: ${redirectUrl}`)
    return c.redirect(redirectUrl, 302)
  }
})

// GitHub: connect repo (create new or existing) + seed + save. Uses code from OAuth or PAT.
app.post('/api/integrations/github/connect', requireAuth, async (c) => {
  try {
    const body = (await c.req.json()) as {
      code?: string
      personal_access_token?: string
      create_new?: boolean
      repo_name?: string
      is_private?: boolean
      owner?: string
      repo?: string
    }
    const user_id = c.get('user_id')

    let token: string
    if (body.personal_access_token) {
      const octo = createOctokit(body.personal_access_token)
      await octo.rest.users.getAuthenticated()
      token = body.personal_access_token
    } else if (body.code) {
      const entry = oauthStore.get(body.code)
      if (!entry || !entry.token) return c.json({ error: 'Invalid or expired code' }, 400)
      if (entry.user_id !== user_id) return c.json({ error: 'user_id mismatch' }, 400)
      token = entry.token
      oauthStore.delete(body.code)
    } else {
      return c.json({ error: 'Provide code (OAuth) or personal_access_token' }, 400)
    }

    const octokit = createOctokit(token)
    let owner: string
    let repo: string
    let branch: string
    let is_created_by_us: boolean

    if (body.create_new) {
      const name = body.repo_name || 'metaspn-content'
      const isPrivate = !!body.is_private
      try {
        const created = await createRepo(octokit, name, isPrivate)
        owner = created.owner
        repo = created.repo
        const info = await getRepo(octokit, owner, repo)
        branch = info.default_branch
        is_created_by_us = true
      } catch (repoError: any) {
        if (repoError?.status === 403 || repoError?.message?.includes('not accessible by integration')) {
          throw new Error('Repository creation failed: Your GitHub OAuth app needs the "repo" scope. Please re-authorize the app at https://github.com/settings/connections/applications and grant repository access permissions.')
        }
        throw repoError
      }
    } else if (body.owner && body.repo) {
      owner = body.owner
      repo = body.repo
      const info = await getRepo(octokit, owner, repo)
      branch = info.default_branch
      is_created_by_us = false
    } else {
      return c.json({ error: 'Provide create_new + repo_name or owner + repo' }, 400)
    }

    await seedRepo(octokit, owner, repo, branch, user_id)
    const encrypted = encryptToken(token)
    await pool.query(
      `INSERT INTO user_github_repos (user_id, repo_owner, repo_name, branch, is_created_by_us, access_token_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, repo_owner, repo_name) DO UPDATE SET
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         branch = EXCLUDED.branch,
         is_created_by_us = EXCLUDED.is_created_by_us,
         last_error = NULL`,
      [user_id, owner, repo, branch, is_created_by_us, encrypted]
    )

    // Automatically trigger Twitter archive sync if user has Twitter account
    // Fire and forget - don't wait for it to complete
    syncTwitterArchiveToGitHub(user_id).catch((error) => {
      console.error('Automatic Twitter archive sync failed:', error)
      // Don't fail the repo connection if sync fails
    })

    return c.json({ repo_owner: owner, repo_name: repo, branch })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('GitHub connect error:', e)
    return c.json({ error: msg }, 500)
  }
})

// GitHub: status (connected repos)
app.get('/api/integrations/github/status', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const uid = user_id
    const result = await pool.query(
      `SELECT id, repo_owner, repo_name, branch, is_created_by_us, last_push_at, last_twitter_sync_at, last_error
       FROM user_github_repos WHERE user_id = $1 ORDER BY created_at DESC`,
      [uid]
    )
    const repos = result.rows.map((r) => ({
      id: r.id,
      repo_owner: r.repo_owner,
      repo_name: r.repo_name,
      full_name: `${r.repo_owner}/${r.repo_name}`,
      branch: r.branch,
      is_created_by_us: r.is_created_by_us,
      last_push_at: r.last_push_at ? new Date(r.last_push_at).toISOString() : null,
      last_twitter_sync_at: r.last_twitter_sync_at ? new Date(r.last_twitter_sync_at).toISOString() : null,
      last_error: r.last_error,
    }))
    return c.json({ repos })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// GitHub: repo stats (read content from connected repo)
app.get('/api/integrations/github/repo-stats', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const stats = await getRepoStats(user_id)
    return c.json(stats)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// GitHub: push now
app.post('/api/integrations/github/push', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const result = await pushToGitHubForUser(user_id)
    return c.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// GitHub: webhook endpoint (no auth required - uses signature verification)
app.post('/api/webhooks/github', async (c) => {
  try {
    // Verify webhook signature
    const signature = c.req.header('X-Hub-Signature-256')
    const eventType = c.req.header('X-GitHub-Event')
    const deliveryId = c.req.header('X-GitHub-Delivery')
    
    if (!signature || !eventType) {
      return c.json({ error: 'Missing required headers' }, 400)
    }
    
    // Get webhook secret from environment
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('GITHUB_WEBHOOK_SECRET not configured')
      return c.json({ error: 'Webhook secret not configured' }, 500)
    }
    
    // Get raw body for signature verification
    const rawBody = await c.req.text()
    
    // Verify signature
    const expectedSignature = 'sha256=' + createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')
    
    if (signature !== expectedSignature) {
      console.error('Webhook signature verification failed')
      return c.json({ error: 'Invalid signature' }, 401)
    }
    
    // Parse event
    const event = JSON.parse(rawBody) as GitHubPushEvent
    
    // Only process push events for now
    if (eventType === 'push') {
      // Process asynchronously (don't block response)
      processWebhookEvent(event).catch((error) => {
        console.error('Error processing webhook event:', error)
      })
      
      return c.json({ status: 'received', delivery_id: deliveryId })
    }
    
    // Ignore other event types
    return c.json({ status: 'ignored', event_type: eventType })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Webhook error:', msg)
    return c.json({ error: msg }, 500)
  }
})

// ============================================================================
// Network Protocol Endpoints
// ============================================================================

// Network: Create hub repo
app.post('/api/network/hub/create', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const body = (await c.req.json()) as {
      repo_name?: string
      is_private?: boolean
      code?: string
      personal_access_token?: string
    }
    
    // Get GitHub token
    let token: string
    if (body.personal_access_token) {
      token = body.personal_access_token
    } else if (body.code) {
      const entry = oauthStore.get(body.code)
      if (!entry || !entry.token) return c.json({ error: 'Invalid or expired code' }, 400)
      token = entry.token
      oauthStore.delete(body.code)
    } else {
      // Try to get from existing repo connection
      const repoResult = await pool.query(
        `SELECT access_token_encrypted FROM user_github_repos WHERE user_id = $1 LIMIT 1`,
        [user_id]
      )
      if (repoResult.rows.length === 0) {
        return c.json({ error: 'No GitHub token available. Provide code or personal_access_token' }, 400)
      }
      token = decryptToken(repoResult.rows[0].access_token_encrypted)
    }
    
    const octokit = createOctokit(token)
    const repoName = body.repo_name || 'metaspn-hub'
    const isPrivate = body.is_private ?? true
    
    const hub = await createHubRepo(user_id, octokit, repoName, isPrivate)
    
    // Save to database
    const encrypted = encryptToken(token)
    await pool.query(
      `INSERT INTO network_hubs (user_id, repo_owner, repo_name, branch, access_token_encrypted)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         repo_owner = EXCLUDED.repo_owner,
         repo_name = EXCLUDED.repo_name,
         branch = EXCLUDED.branch,
         access_token_encrypted = EXCLUDED.access_token_encrypted`,
      [user_id, hub.owner, hub.repo, hub.branch, encrypted]
    )
    
    return c.json({ repo_owner: hub.owner, repo_name: hub.repo, branch: hub.branch })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Get hub status
app.get('/api/network/hub/status', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const status = await getHubStatus(user_id)
    return c.json(status)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Sync hub
app.post('/api/network/hub/sync', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    await syncHubRepo(user_id)
    return c.json({ status: 'synced' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Create feed repo
app.post('/api/network/feed/create', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const body = (await c.req.json()) as {
      repo_name?: string
      is_private?: boolean
      code?: string
      personal_access_token?: string
    }
    
    // Get GitHub token (similar to hub creation)
    let token: string
    if (body.personal_access_token) {
      token = body.personal_access_token
    } else if (body.code) {
      const entry = oauthStore.get(body.code)
      if (!entry || !entry.token) return c.json({ error: 'Invalid or expired code' }, 400)
      token = entry.token
      oauthStore.delete(body.code)
    } else {
      const repoResult = await pool.query(
        `SELECT access_token_encrypted FROM user_github_repos WHERE user_id = $1 LIMIT 1`,
        [user_id]
      )
      if (repoResult.rows.length === 0) {
        return c.json({ error: 'No GitHub token available' }, 400)
      }
      token = decryptToken(repoResult.rows[0].access_token_encrypted)
    }
    
    const octokit = createOctokit(token)
    const repoName = body.repo_name || 'metaspn-feed'
    const isPrivate = body.is_private ?? true
    
    const created = await createRepo(octokit, repoName, isPrivate)
    const info = await getRepo(octokit, created.owner, created.repo)
    const branch = info.default_branch
    
    await seedFeedRepo(octokit, created.owner, created.repo, branch, user_id)
    
    // Save to database
    const encrypted = encryptToken(token)
    await pool.query(
      `INSERT INTO network_feeds (user_id, repo_owner, repo_name, branch, access_token_encrypted)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         repo_owner = EXCLUDED.repo_owner,
         repo_name = EXCLUDED.repo_name,
         branch = EXCLUDED.branch,
         access_token_encrypted = EXCLUDED.access_token_encrypted`,
      [user_id, created.owner, created.repo, branch, encrypted]
    )
    
    return c.json({ repo_owner: created.owner, repo_name: created.repo, branch })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Add watch
app.post('/api/network/watch', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const body = (await c.req.json()) as {
      watched_user_id: string
      watched_repo_owner: string
      watched_repo_name: string
      watch_type: 'full' | 'selective' | 'minimal'
      gates?: Array<{
        gate_type: string
        config: Record<string, unknown>
        is_enabled?: boolean
        priority?: number
      }>
    }
    
    const watch = await addWatch(user_id, body)
    return c.json(watch)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Remove watch
app.delete('/api/network/watch/:watch_id', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const watch_id = c.req.param('watch_id')
    await removeWatch(watch_id, user_id)
    return c.json({ status: 'deleted' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: List watches
app.get('/api/network/watching', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const watches = await listWatches(user_id)
    return c.json(watches)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: List watchers
app.get('/api/network/watchers', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const watchers = await listWatchers(user_id)
    return c.json(watchers)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Update watch gates
app.put('/api/network/watch/:watch_id/gates', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const watch_id = c.req.param('watch_id')
    const body = (await c.req.json()) as {
      gates: Array<{
        gate_type: string
        config: Record<string, unknown>
        is_enabled?: boolean
        priority?: number
      }>
    }
    
    const watch = await updateWatchGates(watch_id, user_id, body.gates)
    return c.json(watch)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Process feed item
app.post('/api/network/feed/:item_id/process', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const item_id = c.req.param('item_id')
    await markFeedItemProcessed(user_id, item_id)
    return c.json({ status: 'processed' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Save feed item
app.post('/api/network/feed/:item_id/save', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const item_id = c.req.param('item_id')
    await saveFeedItem(user_id, item_id)
    return c.json({ status: 'saved' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Discover similar users
app.get('/api/network/discover/similar', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const limit = parseInt(c.req.query('limit') || '10', 10)
    const similar = await findSimilarUsers(user_id, limit)
    return c.json(similar)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Get watch suggestions
app.get('/api/network/discover/suggestions', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const limit = parseInt(c.req.query('limit') || '10', 10)
    const suggestions = await getWatchSuggestions(user_id, limit)
    return c.json(suggestions)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Network: Get emerging topics
app.get('/api/network/discover/emerging', requireAuth, async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7', 10)
    const limit = parseInt(c.req.query('limit') || '10', 10)
    const topics = await getEmergingTopics(days, limit)
    return c.json(topics)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Twitter: check archive availability
app.get('/api/integrations/twitter/archive-status', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const twitterAccount = await getOAuthAccount(user_id, 'twitter')
    if (!twitterAccount || !twitterAccount.provider_username) {
      console.log(`[ArchiveStatus] No Twitter account found for user_id: ${user_id}`)
      return c.json({ available: false, username: null })
    }
    console.log(`[ArchiveStatus] Checking archive for user_id: ${user_id}, username: "${twitterAccount.provider_username}"`)
    const available = await checkArchiveAvailable(twitterAccount.provider_username)
    console.log(`[ArchiveStatus] Result for "${twitterAccount.provider_username}": available=${available}`)
    return c.json({ available, username: twitterAccount.provider_username })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[ArchiveStatus] Error:`, msg)
    return c.json({ error: msg }, 500)
  }
})

// Twitter: debug archive check (for testing)
app.get('/api/integrations/twitter/archive-status-debug', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const twitterAccount = await getOAuthAccount(user_id, 'twitter')
    if (!twitterAccount || !twitterAccount.provider_username) {
      return c.json({ error: 'No Twitter account found', username: null })
    }
    
    const username = twitterAccount.provider_username
    const normalizedUsername = username.replace(/^@/, '').toLowerCase()
    const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${normalizedUsername}/archive.json`
    
    // Try to fetch directly to see what happens
    let directCheck: { status: number; error?: string; found?: boolean } | null = null
    try {
      const response = await fetch(archiveUrl)
      directCheck = {
        status: response.status,
        found: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      }
    } catch (error: any) {
      directCheck = {
        status: 0,
        error: error.message,
        found: false,
      }
    }
    
    // Check via tool
    const toolResult = await checkArchiveAvailable(username)
    
    return c.json({
      username,
      normalizedUsername,
      archiveUrl,
      directCheck,
      toolResult,
      accountInfo: {
        provider_username: twitterAccount.provider_username,
        provider_user_id: twitterAccount.provider_user_id,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Twitter: sync archive to GitHub
app.post('/api/integrations/twitter/sync', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const result = await syncTwitterArchiveToGitHub(user_id)
    return c.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 500)
  }
})

// Podcast discovery endpoint
app.post('/api/podcasts/discover', requireAuth, async (c) => {
  try {
    const body = await c.req.json()
    const user_id = c.get('user_id') // Use authenticated user_id

    const { podcast_name, preferences, rss_feed_url } = body

    // Step 1: Create a minimal podcast entry if it doesn't exist
    let podcast_id: string
    const existingPodcast = await pool.query(
      'SELECT podcast_id FROM podcasts WHERE title = $1 LIMIT 1',
      [podcast_name]
    )

    if (existingPodcast.rows.length > 0) {
      podcast_id = existingPodcast.rows[0].podcast_id
    } else {
      // Create minimal podcast entry
      const newPodcast = await pool.query(
        `INSERT INTO podcasts (title, description, rss_feed_url)
         VALUES ($1, $2, $3)
         RETURNING podcast_id`,
        [podcast_name, null, rss_feed_url || null]
      )
      podcast_id = newPodcast.rows[0].podcast_id
    }

    // Step 2: Save user preferences immediately
    const existingPref = await pool.query(
      'SELECT preference_id FROM user_podcast_preferences WHERE user_id = $1 AND podcast_id = $2',
      [user_id, podcast_id]
    )

    let preference_id: string
    if (existingPref.rows.length > 0) {
      preference_id = existingPref.rows[0].preference_id
      // Update existing preference
      await pool.query(
        `UPDATE user_podcast_preferences
         SET started_listening_date = $1,
             listen_regularity = $2,
             typical_listen_speed = $3
         WHERE preference_id = $4`,
        [
          preferences?.started_listening_date ? new Date(preferences.started_listening_date) : null,
          preferences?.listen_regularity || null,
          preferences?.typical_listen_speed || null,
          preference_id,
        ]
      )
    } else {
      // Create new preference
      const newPref = await pool.query(
        `INSERT INTO user_podcast_preferences (user_id, podcast_id, started_listening_date, listen_regularity, typical_listen_speed)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING preference_id`,
        [
          user_id,
          podcast_id,
          preferences?.started_listening_date ? new Date(preferences.started_listening_date) : null,
          preferences?.listen_regularity || null,
          preferences?.typical_listen_speed || null,
        ]
      )
      preference_id = newPref.rows[0].preference_id
    }

    // Step 3: Run discovery workflow asynchronously (don't wait for it)
    // This will populate episodes and update podcast metadata in the background
    // Only run if we don't have an RSS feed URL yet (to avoid duplicate work)
    if (!rss_feed_url && podcastDiscoveryWorkflow) {
      podcastDiscoveryWorkflow
        .createRun()
        .then((run: any) =>
          run.start({
            inputData: {
              podcast_name,
              user_id,
              preferences,
              rss_feed_url,
            },
          })
        )
        .catch((error: unknown) => {
          console.error('Background podcast discovery failed:', error)
          // Log error but don't fail the request - preference is already saved
        })
    }

    // Return immediately with the saved preference
    return c.json({
      podcast_id,
      preference_id,
      created_count: 0, // Will be updated by background process
      status: 'saved',
      message: 'Podcast added successfully. Discovery is running in the background.',
    })
  } catch (error: any) {
    console.error('Podcast discovery error:', error)
    return c.json({ error: error.message || 'Failed to discover podcast' }, 500)
  }
})

// Get user podcast preferences
app.get('/api/users/:user_id/podcast-preferences', requireAuth, async (c) => {
  try {
    const authenticated_user_id = c.get('user_id')
    const requested_user_id = c.req.param('user_id')
    const podcast_id = c.req.query('podcast_id')

    // Users can only access their own preferences
    // Support backward compatibility: if param is 'me' or matches authenticated user, use authenticated user_id
    const user_id =
      requested_user_id === 'me' || requested_user_id === authenticated_user_id
        ? authenticated_user_id
        : requested_user_id === 'demo-user-id'
          ? '00000000-0000-0000-0000-000000000000' // Backward compat
          : authenticated_user_id // Default to authenticated user for security

    // Query database directly to bypass Mastra tool validation issues
    let query = `
      SELECT 
        up.preference_id,
        up.podcast_id,
        p.title as podcast_title,
        up.started_listening_date,
        up.listen_regularity,
        up.typical_listen_speed
      FROM user_podcast_preferences up
      JOIN podcasts p ON up.podcast_id = p.podcast_id
      WHERE up.user_id = $1
    `
    const params: any[] = [user_id]

    if (podcast_id) {
      query += ' AND up.podcast_id = $2'
      params.push(podcast_id)
    }

    query += ' ORDER BY up.created_at DESC'

    const result = await pool.query(query, params)

    return c.json({
      preferences: result.rows.map((row) => ({
        preference_id: row.preference_id,
        podcast_id: row.podcast_id,
        podcast_title: row.podcast_title,
        started_listening_date: row.started_listening_date
          ? row.started_listening_date.toISOString().split('T')[0]
          : null,
        listen_regularity: row.listen_regularity,
        typical_listen_speed: row.typical_listen_speed,
      })),
    })
  } catch (error: any) {
    console.error('Get preferences error:', error)
    return c.json({ error: error.message || 'Failed to get preferences' }, 500)
  }
})

// Update user podcast preferences
app.put('/api/users/:user_id/podcast-preferences/:podcast_id', requireAuth, async (c) => {
  try {
    const authenticated_user_id = c.get('user_id')
    let user_id = c.req.param('user_id')
    const podcast_id = c.req.param('podcast_id')
    const body = await c.req.json()

    // Users can only update their own preferences
    // Support backward compatibility
    if (user_id === 'me' || user_id === authenticated_user_id) {
      user_id = authenticated_user_id
    } else if (user_id === 'demo-user-id') {
      user_id = '00000000-0000-0000-0000-000000000000' // Backward compat
    } else {
      user_id = authenticated_user_id // Default to authenticated user for security
    }

    // Query database directly to bypass Mastra tool validation issues
    // Check if preference already exists
    const existing = await pool.query(
      'SELECT preference_id FROM user_podcast_preferences WHERE user_id = $1 AND podcast_id = $2',
      [user_id, podcast_id]
    )

    let preference_id: string
    let created: boolean

    if (existing.rows.length > 0) {
      // Update existing preference
      preference_id = existing.rows[0].preference_id
      const result = await pool.query(
        `UPDATE user_podcast_preferences
         SET started_listening_date = $1,
             listen_regularity = $2,
             typical_listen_speed = $3
         WHERE preference_id = $4
         RETURNING preference_id`,
        [
          body.started_listening_date ? new Date(body.started_listening_date) : null,
          body.listen_regularity || null,
          body.typical_listen_speed || null,
          preference_id,
        ]
      )
      created = false
    } else {
      // Create new preference
      const result = await pool.query(
        `INSERT INTO user_podcast_preferences (user_id, podcast_id, started_listening_date, listen_regularity, typical_listen_speed)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING preference_id`,
        [
          user_id,
          podcast_id,
          body.started_listening_date ? new Date(body.started_listening_date) : null,
          body.listen_regularity || null,
          body.typical_listen_speed || null,
        ]
      )
      preference_id = result.rows[0].preference_id
      created = true
    }

    return c.json({ preference_id, created })
  } catch (error: any) {
    console.error('Update preferences error:', error)
    return c.json({ error: error.message || 'Failed to update preferences' }, 500)
  }
})

// Get user dashboard data
app.get('/api/users/:user_id/dashboard', requireAuth, async (c) => {
  try {
    const authenticated_user_id = c.get('user_id')
    const requested_user_id = c.req.param('user_id')

    // Users can only access their own dashboard
    const user_id =
      requested_user_id === 'me' || requested_user_id === authenticated_user_id
        ? authenticated_user_id
        : authenticated_user_id // Default to authenticated user for security

    // Execute the dashboard tool (if available)
    if (!getDashboardData) {
      return c.json({ error: 'Dashboard feature requires Mastra (currently running in simple mode)' }, 503)
    }
    
    const result = await (getDashboardData as any).execute({
      context: { user_id },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Dashboard error:', error)
    return c.json({ error: error.message || 'Failed to get dashboard data' }, 500)
  }
})

// Get user influence report
app.get('/api/users/:user_id/influence-report', requireAuth, async (c) => {
  try {
    const authenticated_user_id = c.get('user_id')
    const requested_user_id = c.req.param('user_id')

    // Users can only access their own reports
    const user_id =
      requested_user_id === 'me' || requested_user_id === authenticated_user_id
        ? authenticated_user_id
        : authenticated_user_id

    // Get influence timeline data (similar to dashboard but focused on influence)
    const influenceResult = await pool.query(
      `SELECT e.episode_id, e.title, e.release_time,
              COALESCE(SUM(il.similarity), 0) as influence_score,
              AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) as completion_ratio,
              COUNT(DISTINCT il.expression_id) as linked_expressions
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       LEFT JOIN influence_links il ON e.episode_id = il.episode_id
       WHERE ev.user_id = $1
       GROUP BY e.episode_id, e.title, e.release_time
       HAVING COUNT(ev.event_id) > 0
       ORDER BY influence_score DESC, e.release_time DESC
       LIMIT 100`,
      [user_id]
    )

    return c.json({
      influence_timeline: influenceResult.rows.map((row) => ({
        episode_id: row.episode_id,
        episode_title: row.title,
        date: row.release_time?.toISOString() || new Date().toISOString(),
        influence_score: parseFloat(row.influence_score || 0),
        completion_ratio: parseFloat(row.completion_ratio || 0),
        linked_expressions: parseInt(row.linked_expressions || 0, 10),
      })),
    })
  } catch (error: any) {
    console.error('Influence report error:', error)
    return c.json({ error: error.message || 'Failed to get influence report' }, 500)
  }
})

// ============================================================================
// Podcast Ownership Endpoints
// ============================================================================

// Claim podcast ownership
app.post('/api/podcasts/claim', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const body = await c.req.json()
    const { podcast_id, rss_feed_url, podcast_name } = body

    let final_podcast_id: string

    // If podcast_id is provided, use it directly
    if (podcast_id) {
      const podcastCheck = await pool.query('SELECT podcast_id FROM podcasts WHERE podcast_id = $1', [
        podcast_id,
      ])

      if (podcastCheck.rows.length === 0) {
        return c.json({ error: 'Podcast not found with the provided ID' }, 404)
      }

      final_podcast_id = podcast_id
    } else if (rss_feed_url) {
      // If RSS feed URL is provided, find or create podcast
      const existingPodcast = await pool.query(
        'SELECT podcast_id FROM podcasts WHERE rss_feed_url = $1 LIMIT 1',
        [rss_feed_url]
      )

      if (existingPodcast.rows.length > 0) {
        final_podcast_id = existingPodcast.rows[0].podcast_id
      } else {
        // Create new podcast from RSS feed
        try {
          const parseResult = await (parseRSSFeed as any).execute({ context: { rss_feed_url } })
          
          // Validate that RSS feed contains website URL (required for verification)
          if (!parseResult.podcast.website_url) {
            return c.json(
              {
                error:
                  'RSS feed does not contain a website URL. Please ensure your RSS feed includes a website link, or provide the website URL manually.',
              },
              400
            )
          }

          // Validate domain consistency before creating podcast
          const domainValidation = validateDomainConsistency(rss_feed_url, parseResult.podcast.website_url)
          if (!domainValidation.valid) {
            return c.json({ error: domainValidation.message }, 400)
          }

          const createResult = await (createPodcast as any).execute({
            context: {
              title: parseResult.podcast.title || podcast_name || 'Unknown Podcast',
              description: parseResult.podcast.description,
              rss_feed_url,
              website_url: parseResult.podcast.website_url,
              image_url: parseResult.podcast.image_url,
            },
          })

          final_podcast_id = createResult.podcast_id
        } catch (error: any) {
          return c.json({ 
            error: `Failed to create podcast from RSS feed: ${error.message || 'Invalid RSS feed'}` 
          }, 400)
        }
      }
    } else if (podcast_name) {
      // If podcast name is provided, try to find existing podcast
      const existingPodcast = await pool.query(
        'SELECT podcast_id FROM podcasts WHERE title ILIKE $1 LIMIT 1',
        [podcast_name]
      )

      if (existingPodcast.rows.length > 0) {
        final_podcast_id = existingPodcast.rows[0].podcast_id
      } else {
        return c.json({ 
          error: 'Podcast not found. Please provide an RSS feed URL to create a new podcast entry.' 
        }, 404)
      }
    } else {
      return c.json({ 
        error: 'Please provide either a podcast_id, RSS feed URL, or podcast name' 
      }, 400)
    }

    // Validation checks before allowing claim
    // 1. Check if podcast has website URL (required for verification)
    const podcastInfo = await pool.query(
      'SELECT website_url, rss_feed_url FROM podcasts WHERE podcast_id = $1',
      [final_podcast_id]
    )

    if (podcastInfo.rows.length === 0) {
      return c.json({ error: 'Podcast not found' }, 404)
    }

    const { website_url, rss_feed_url: stored_rss } = podcastInfo.rows[0]

    if (!website_url) {
      return c.json(
        {
          error:
            'Podcast must have a website URL for ownership verification. Please provide an RSS feed URL that includes website information.',
        },
        400
      )
    }

    // 2. If RSS feed provided, validate domain consistency
    if (rss_feed_url && stored_rss) {
      const domainValidation = validateDomainConsistency(stored_rss, website_url)
      if (!domainValidation.valid) {
        return c.json({ error: domainValidation.message }, 400)
      }
    }

    // 3. Check for existing verified ownership
    const verifiedCheck = await checkExistingVerifiedOwnership(final_podcast_id)
    if (verifiedCheck.hasVerifiedOwner && verifiedCheck.owner_user_id !== user_id) {
      return c.json(
        {
          error:
            'This podcast is already verified by another owner. Please contact support if you believe this is an error.',
        },
        403
      )
    }

    // All validation passed, proceed with claim
    const result = await claimPodcastOwnership(user_id, final_podcast_id)

    return c.json({
      ...result,
      podcast_id: final_podcast_id,
    })
  } catch (error: any) {
    console.error('Claim podcast error:', error)
    return c.json({ error: error.message || 'Failed to claim podcast' }, 500)
  }
})

// Verify podcast ownership
app.post('/api/podcasts/:podcast_id/verify', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const podcast_id = c.req.param('podcast_id')

    // Check ownership
    const { owns } = await checkOwnership(user_id, podcast_id)
    if (!owns) {
      return c.json({ error: 'You do not own this podcast' }, 403)
    }

    // Get verification token
    const ownershipResult = await pool.query(
      'SELECT verification_token FROM podcast_ownership WHERE user_id = $1 AND podcast_id = $2',
      [user_id, podcast_id]
    )

    if (ownershipResult.rows.length === 0) {
      return c.json({ error: 'Ownership record not found' }, 404)
    }

    const verification_token = ownershipResult.rows[0].verification_token

    // Verify ownership
    const result = await verifyOwnershipViaMetaTag(podcast_id, verification_token)

    return c.json(result)
  } catch (error: any) {
    console.error('Verify ownership error:', error)
    return c.json({ error: error.message || 'Failed to verify ownership' }, 500)
  }
})

// Get owned podcasts
app.get('/api/podcasts/owned', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const podcasts = await getOwnedPodcasts(user_id)

    return c.json({ podcasts })
  } catch (error: any) {
    console.error('Get owned podcasts error:', error)
    return c.json({ error: error.message || 'Failed to get owned podcasts' }, 500)
  }
})

// Get ownership details for a specific podcast
app.get('/api/podcasts/:podcast_id/ownership', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const podcast_id = c.req.param('podcast_id')

    const result = await pool.query(
      `SELECT 
        po.ownership_id,
        po.verification_status,
        po.verification_token,
        po.verified_at,
        po.created_at
      FROM podcast_ownership po
      WHERE po.user_id = $1 AND po.podcast_id = $2`,
      [user_id, podcast_id]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Ownership record not found' }, 404)
    }

    const ownership = result.rows[0]

    return c.json({
      ownership_id: ownership.ownership_id,
      verification_status: ownership.verification_status,
      verification_token: ownership.verification_token,
      verified_at: ownership.verified_at?.toISOString() || null,
      created_at: ownership.created_at.toISOString(),
    })
  } catch (error: any) {
    console.error('Get ownership error:', error)
    return c.json({ error: error.message || 'Failed to get ownership details' }, 500)
  }
})

// ============================================================================
// Host Features Endpoints
// ============================================================================

// Get host analytics for a podcast
app.get('/api/podcasts/:podcast_id/host/analytics', requireAuth, requirePodcastOwnership, async (c) => {
  try {
    const user_id = c.get('user_id')
    const podcast_id = c.req.param('podcast_id')

    const result = await (getHostPodcastAnalytics as any).execute({
      context: { podcast_id, user_id },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Get host analytics error:', error)
    return c.json({ error: error.message || 'Failed to get host analytics' }, 500)
  }
})

// Get host episodes with analytics
app.get('/api/podcasts/:podcast_id/host/episodes', requireAuth, requirePodcastOwnership, async (c) => {
  try {
    const podcast_id = c.req.param('podcast_id')

    // Get all episodes with guest info and basic stats
    const episodesResult = await pool.query(
      `SELECT 
        e.episode_id,
        e.title,
        e.description,
        e.duration_sec,
        e.release_time,
        e.audio_url,
        COUNT(DISTINCT ev.event_id) FILTER (WHERE ev.event_type = 'play') as play_count,
        COUNT(DISTINCT ev.user_id) FILTER (WHERE ev.event_type = 'play') as unique_listeners,
        AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) FILTER (WHERE ev.playhead_sec IS NOT NULL) as avg_completion_rate
      FROM episodes e
      LEFT JOIN events ev ON e.episode_id = ev.episode_id
      WHERE e.podcast_id = $1
      GROUP BY e.episode_id, e.title, e.description, e.duration_sec, e.release_time, e.audio_url
      ORDER BY e.release_time DESC NULLS LAST`,
      [podcast_id]
    )

    // Get guests for each episode
    const episodes = await Promise.all(
      episodesResult.rows.map(async (episode) => {
        const guestsResult = await pool.query(
          `SELECT guest_id, guest_name, guest_role, metadata
           FROM episode_guests
           WHERE episode_id = $1
           ORDER BY guest_name`,
          [episode.episode_id]
        )

        return {
          episode_id: episode.episode_id,
          title: episode.title,
          description: episode.description,
          duration_sec: parseFloat(episode.duration_sec || 0),
          release_time: episode.release_time?.toISOString() || null,
          audio_url: episode.audio_url,
          play_count: parseInt(episode.play_count || 0, 10),
          unique_listeners: parseInt(episode.unique_listeners || 0, 10),
          avg_completion_rate: parseFloat(episode.avg_completion_rate || 0),
          guests: guestsResult.rows.map((g) => ({
            guest_id: g.guest_id,
            guest_name: g.guest_name,
            guest_role: g.guest_role,
            metadata: g.metadata || {},
          })),
        }
      })
    )

    return c.json({ episodes })
  } catch (error: any) {
    console.error('Get host episodes error:', error)
    return c.json({ error: error.message || 'Failed to get host episodes' }, 500)
  }
})

// Get host guests
app.get('/api/podcasts/:podcast_id/host/guests', requireAuth, requirePodcastOwnership, async (c) => {
  try {
    const user_id = c.get('user_id')
    const podcast_id = c.req.param('podcast_id')

    const result = await (getGuestAnalytics as any).execute({
      context: { podcast_id, user_id },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Get host guests error:', error)
    return c.json({ error: error.message || 'Failed to get host guests' }, 500)
  }
})

// Add guest to episode
app.post('/api/episodes/:episode_id/guests', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const episode_id = c.req.param('episode_id')
    const body = await c.req.json()

    // Verify user owns the podcast this episode belongs to
    const episodeResult = await pool.query(
      `SELECT e.podcast_id 
       FROM episodes e
       WHERE e.episode_id = $1`,
      [episode_id]
    )

    if (episodeResult.rows.length === 0) {
      return c.json({ error: 'Episode not found' }, 404)
    }

    const podcast_id = episodeResult.rows[0].podcast_id

    const { owns, verified } = await checkOwnership(user_id, podcast_id)
    if (!owns || !verified) {
      return c.json({ error: 'You must own and verify this podcast to add guests' }, 403)
    }

    const result = await (addEpisodeGuest as any).execute({
      context: {
        episode_id,
        guest_name: body.guest_name,
        guest_role: body.guest_role || 'guest',
        metadata: body.metadata || {},
      },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Add guest error:', error)
    return c.json({ error: error.message || 'Failed to add guest' }, 500)
  }
})

// Update guest
app.put('/api/guests/:guest_id', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const guest_id = c.req.param('guest_id')
    const body = await c.req.json()

    // Get episode and verify ownership
    const guestResult = await pool.query(
      `SELECT eg.episode_id, e.podcast_id
       FROM episode_guests eg
       JOIN episodes e ON eg.episode_id = e.episode_id
       WHERE eg.guest_id = $1`,
      [guest_id]
    )

    if (guestResult.rows.length === 0) {
      return c.json({ error: 'Guest not found' }, 404)
    }

    const podcast_id = guestResult.rows[0].podcast_id

    const { owns, verified } = await checkOwnership(user_id, podcast_id)
    if (!owns || !verified) {
      return c.json({ error: 'You must own and verify this podcast to update guests' }, 403)
    }

    const result = await (updateEpisodeGuest as any).execute({
      context: {
        guest_id,
        guest_name: body.guest_name,
        guest_role: body.guest_role,
        metadata: body.metadata,
      },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Update guest error:', error)
    return c.json({ error: error.message || 'Failed to update guest' }, 500)
  }
})

// Get episode analytics
app.get('/api/episodes/:episode_id/analytics', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const episode_id = c.req.param('episode_id')

    // Get podcast_id from episode
    const episodeResult = await pool.query('SELECT podcast_id FROM episodes WHERE episode_id = $1', [
      episode_id,
    ])

    if (episodeResult.rows.length === 0) {
      return c.json({ error: 'Episode not found' }, 404)
    }

    const podcast_id = episodeResult.rows[0].podcast_id

    // Verify ownership
    const { owns, verified } = await checkOwnership(user_id, podcast_id)
    if (!owns || !verified) {
      return c.json({ error: 'You must own and verify this podcast to view analytics' }, 403)
    }

    const result = await (getEpisodeAnalytics as any).execute({
      context: { episode_id, podcast_id },
    })

    return c.json(result)
  } catch (error: any) {
    console.error('Get episode analytics error:', error)
    return c.json({ error: error.message || 'Failed to get episode analytics' }, 500)
  }
})

// ============================================================================
// Admin Dashboard Endpoints
// ============================================================================

// Check if current user is admin
app.get('/api/admin/check', requireAuth, async (c) => {
  try {
    const user_id = c.get('user_id')
    const isAdmin = await isUserAdmin(user_id)
    return c.json({ is_admin: isAdmin })
  } catch (error: any) {
    console.error('Admin check error:', error)
    return c.json({ error: error.message || 'Failed to check admin status' }, 500)
  }
})

// Get admin dashboard stats
app.get('/api/admin/stats', requireAuth, requireAdmin, async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7', 10)
    const stats = await getStats(days)
    return c.json(stats)
  } catch (error: any) {
    console.error('Admin stats error:', error)
    return c.json({ error: error.message || 'Failed to get stats' }, 500)
  }
})

// Get list of workflow runs
app.get('/api/admin/runs', requireAuth, requireAdmin, async (c) => {
  try {
    const filter: RunsFilter = {
      status: c.req.query('status') as any,
      workflow_name: c.req.query('workflow_name'),
      trigger: c.req.query('trigger') as any,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0,
    }
    
    if (c.req.query('since')) {
      filter.since = new Date(c.req.query('since')!)
    }
    
    const result = await getRuns(filter)
    return c.json(result)
  } catch (error: any) {
    console.error('Admin runs error:', error)
    return c.json({ error: error.message || 'Failed to get runs' }, 500)
  }
})

// Get workflow run detail
app.get('/api/admin/runs/:run_id', requireAuth, requireAdmin, async (c) => {
  try {
    const run_id = c.req.param('run_id')
    const detail = await getRunDetail(run_id)
    
    if (!detail) {
      return c.json({ error: 'Run not found' }, 404)
    }
    
    return c.json(detail)
  } catch (error: any) {
    console.error('Admin run detail error:', error)
    return c.json({ error: error.message || 'Failed to get run detail' }, 500)
  }
})

// Get list of available workflow names
app.get('/api/admin/workflows', requireAuth, requireAdmin, async (c) => {
  try {
    const workflows = await getWorkflowNames()
    
    // Also include known workflow names from the worker
    const knownWorkflows = [
      'transcript_discovery',
      'influence_linking',
      'daily_report',
      'monthly_digest',
      'podcast_discovery',
      'process_transcript',
    ]
    
    // Merge and dedupe
    const allWorkflows = [...new Set([...workflows, ...knownWorkflows])].sort()
    
    return c.json({ workflows: allWorkflows })
  } catch (error: any) {
    console.error('Admin workflows error:', error)
    return c.json({ error: error.message || 'Failed to get workflows' }, 500)
  }
})

// Trigger a workflow manually
app.post('/api/admin/runs/:workflow_name/trigger', requireAuth, requireAdmin, async (c) => {
  try {
    const workflow_name = c.req.param('workflow_name')
    const body = await c.req.json().catch(() => ({}))
    const inputData = body.input_data || {}
    
    // Import workflows dynamically to avoid circular dependencies
    let workflow: any = null
    
    switch (workflow_name) {
      case 'transcript_discovery':
        const td = await import('./mastra/workflows/transcript-discovery-workflow.js')
        workflow = td.transcriptDiscoveryWorkflow
        break
      case 'influence_linking':
        const il = await import('./mastra/workflows/influence-linking-workflow.js')
        workflow = il.influenceLinkingWorkflow
        break
      case 'daily_report':
        const dr = await import('./mastra/workflows/generate-daily-report-workflow.js')
        workflow = dr.generateDailyReportWorkflow
        break
      case 'monthly_digest':
        const md = await import('./mastra/workflows/monthly-digest-workflow.js')
        workflow = md.monthlyDigestWorkflow
        break
      case 'podcast_discovery':
        const pd = await import('./mastra/workflows/podcast-discovery-workflow.js')
        workflow = pd.podcastDiscoveryWorkflow
        break
      default:
        return c.json({ error: `Unknown workflow: ${workflow_name}` }, 400)
    }
    
    // Start tracking the run
    const runInfo = await startRun(workflow_name, 'manual', inputData)
    
    // Run workflow asynchronously (don't wait)
    const runExecution = async () => {
      try {
        const run = await workflow.createRun()
        const result = await run.start({ inputData })
        await endRun(runInfo.run_id, 'completed', result || undefined)
      } catch (error: any) {
        await endRun(runInfo.run_id, 'failed', undefined, error.message)
      }
    }
    
    // Fire and forget
    runExecution().catch((e) => console.error('Workflow execution error:', e))
    
    return c.json({
      message: `Workflow ${workflow_name} triggered`,
      run_id: runInfo.run_id,
    })
  } catch (error: any) {
    console.error('Admin trigger workflow error:', error)
    return c.json({ error: error.message || 'Failed to trigger workflow' }, 500)
  }
})

// Get scheduled jobs info
app.get('/api/admin/scheduled-jobs', requireAuth, requireAdmin, async (c) => {
  try {
    const githubCron = process.env.GITHUB_PUSH_CRON?.trim() || '0 */6 * * *'
    const repoEnhancementCron = process.env.REPO_ENHANCEMENT_CRON?.trim() || '*/30 * * * *'
    
    const jobs = [
      { name: 'Transcript Discovery', schedule: '0 2 * * *', description: 'Daily at 2 AM UTC' },
      { name: 'Influence Linking', schedule: '0 * * * *', description: 'Hourly' },
      { name: 'Daily Report', schedule: '0 0 * * *', description: 'Midnight UTC' },
      { name: 'Monthly Digest', schedule: '0 1 1 * *', description: '1st of month at 1 AM UTC' },
      { name: 'Enhancement Watcher', schedule: '*/15 * * * *', description: 'Every 15 minutes' },
      { name: 'GitHub Push', schedule: githubCron, description: 'Configurable' },
      { name: 'Hub Sync', schedule: '0 3 * * *', description: 'Daily at 3 AM UTC' },
      { name: 'Feed Digest Daily', schedule: '0 9 * * *', description: 'Daily at 9 AM UTC' },
      { name: 'Feed Digest Weekly', schedule: '0 10 * * 1', description: 'Monday at 10 AM UTC' },
      { name: 'Repo Enhancement', schedule: repoEnhancementCron, description: 'Configurable' },
    ]
    
    return c.json({ jobs })
  } catch (error: any) {
    console.error('Admin scheduled jobs error:', error)
    return c.json({ error: error.message || 'Failed to get scheduled jobs' }, 500)
  }
})

// Initialize and start server
async function startServer() {
  // Load Mastra modules first (if enabled)
  await loadMastraModules()

  // Initialize MastraServer if available (optional)
  if (MastraServer && mastra) {
    try {
      server = new MastraServer({ app, mastra })
      console.log('✅ MastraServer initialized')
    } catch (error) {
      console.warn('⚠️  MastraServer initialization failed:', (error as Error).message)
    }
  } else {
    console.log('ℹ️  MastraServer skipped (Mastra not available)')
  }

  // Log startup configuration
  console.log('='.repeat(60))
  console.log('🚀 Starting Server')
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)
  console.log(`  FRONTEND_URL (env): ${process.env.FRONTEND_URL || 'NOT SET'}`)
  console.log(`  FRONTEND_URL (config): ${FRONTEND_URL}`)
  console.log(`  GITHUB_CALLBACK_URL: ${process.env.GITHUB_CALLBACK_URL || 'using default'}`)
  console.log(`  TWITTER_CALLBACK_URL: ${process.env.TWITTER_CALLBACK_URL || 'using default'}`)
  console.log('='.repeat(60))

  // Start server
  const port = 3001
  const host = '0.0.0.0'

  serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      console.log(`🚀 Server started on http://${info.address}:${info.port}`)
      console.log(`📚 API endpoints available at http://${info.address}:${info.port}/api`)
    }
  )
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error)
  process.exit(1)
})

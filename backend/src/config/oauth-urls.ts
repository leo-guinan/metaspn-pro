/**
 * OAuth redirect and frontend URLs.
 * In production, FRONTEND_URL must be your app origin (e.g. https://pro.metaspn.network).
 * Callback URLs can be derived from it when not set explicitly.
 */

export function ensureNoLocalhostInProduction(
  name: string,
  value: string | undefined,
  ctx: string
): void {
  if (process.env.NODE_ENV !== 'production') return
  if (!value || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) {
    const errorMsg = `[OAuth] ${ctx}: ${name} must be set to your production origin (e.g. https://pro.metaspn.network) in production. ` +
      `Currently: ${value || '(missing)'}. OAuth redirects will fail or send users to localhost.`
    console.error(errorMsg)
    // Fail fast in production - this is a critical configuration error
    throw new Error(errorMsg)
  }
}

// Log environment variable immediately (before any processing)
// #region agent log
fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-urls.ts:23',message:'Module loading start',data:{frontendUrl:process.env.FRONTEND_URL||'NOT SET',nodeEnv:process.env.NODE_ENV||'NOT SET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion
console.log('='.repeat(60))
console.log('[OAuth Config] Module Loading...')
console.log(`  process.env.FRONTEND_URL (raw): ${process.env.FRONTEND_URL || 'NOT SET'}`)
console.log(`  process.env.NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`)

const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
// #region agent log
fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-urls.ts:29',message:'Base URL calculated',data:{base,frontendUrl:process.env.FRONTEND_URL||'NOT SET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

// Only check in production (don't fail in dev)
if (process.env.NODE_ENV === 'production') {
  ensureNoLocalhostInProduction('FRONTEND_URL', process.env.FRONTEND_URL, 'startup')
}

// Log the actual FRONTEND_URL being used (helpful for debugging)
// #region agent log
fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-urls.ts:36',message:'Final FRONTEND_URL set',data:{finalBase:base,githubCallback:process.env.GITHUB_CALLBACK_URL||`${base}/api/auth/github/callback`,twitterCallback:process.env.TWITTER_CALLBACK_URL||`${base}/api/auth/twitter/callback`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion
console.log(`[OAuth Config] FRONTEND_URL (final): ${base}`)
console.log(`[OAuth Config] GitHub Callback: ${process.env.GITHUB_CALLBACK_URL || `${base}/api/auth/github/callback`}`)
console.log(`[OAuth Config] Twitter Callback: ${process.env.TWITTER_CALLBACK_URL || `${base}/api/auth/twitter/callback`}`)
console.log('='.repeat(60))

export const FRONTEND_URL = base
// #region agent log
fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'oauth-urls.ts:42',message:'FRONTEND_URL exported',data:{exportedValue:base},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

export function getGitHubCallbackUrl(): string {
  return (
    process.env.GITHUB_CALLBACK_URL ||
    `${FRONTEND_URL}/api/auth/github/callback`
  )
}

export function getTwitterCallbackUrl(): string {
  return (
    process.env.TWITTER_CALLBACK_URL ||
    `${FRONTEND_URL}/api/auth/twitter/callback`
  )
}

export function getCorsOrigins(): string[] {
  const origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
  if (
    FRONTEND_URL &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(FRONTEND_URL)
  ) {
    origins.push(FRONTEND_URL)
  }
  return origins
}

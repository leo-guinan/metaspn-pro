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

const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
ensureNoLocalhostInProduction('FRONTEND_URL', process.env.FRONTEND_URL, 'startup')

// Log the actual FRONTEND_URL being used (helpful for debugging)
console.log(`[OAuth Config] FRONTEND_URL: ${base}`)
console.log(`[OAuth Config] GitHub Callback: ${process.env.GITHUB_CALLBACK_URL || `${base}/api/auth/github/callback`}`)
console.log(`[OAuth Config] Twitter Callback: ${process.env.TWITTER_CALLBACK_URL || `${base}/api/auth/twitter/callback`}`)

export const FRONTEND_URL = base

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

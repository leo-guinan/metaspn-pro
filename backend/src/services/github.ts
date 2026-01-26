import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { Octokit } from 'octokit'
import { getGitHubCallbackUrl } from '../config/oauth-urls.js'

const ALG = 'aes-256-gcm'
const IV_LEN = 16
const AUTH_TAG_LEN = 16
const SALT = 'metaspn-github-token'

function getEncryptionKey(): Buffer {
  const secret =
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production'
  return createHash('sha256').update(SALT + secret).digest()
}

export function encryptToken(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALG, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey()
  const buf = Buffer.from(encrypted, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
  const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN)
  const decipher = createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc) + decipher.final('utf8')
}

export function getOAuthAuthUrl(state: string, callbackUrl?: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID
  const callback = callbackUrl ?? getGitHubCallbackUrl()
  if (!clientId) throw new Error('GITHUB_CLIENT_ID is not set')
  // Request 'repo' scope for full repository access (create, read, write)
  // 'read:user' for basic user info
  const scope = 'repo read:user'
  return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callback)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string; login: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const callback = getGitHubCallbackUrl()
  if (!clientId || !clientSecret) throw new Error('GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not set')

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callback }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub OAuth exchange failed')
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const user = (await userRes.json()) as { login?: string }
  return { access_token: data.access_token, login: user.login || 'unknown' }
}

export function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
}

export async function createRepo(
  octokit: Octokit,
  name: string,
  isPrivate: boolean
): Promise<{ owner: string; repo: string }> {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name,
    private: isPrivate,
    auto_init: false,
  })
  return { owner: data.owner.login, repo: data.name }
}

export async function getRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ default_branch: string }> {
  const { data } = await octokit.rest.repos.get({ owner, repo })
  return { default_branch: data.default_branch || 'main' }
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch })
    if (Array.isArray(data)) return null
    const raw = (data as { content?: string; encoding?: string; sha?: string })
    const content = raw.encoding === 'base64' ? Buffer.from(raw.content || '', 'base64').toString('utf8') : (raw.content as string)
    return { content, sha: raw.sha! }
  } catch (e: any) {
    if (e?.status === 404) return null
    throw e
  }
}

const COMMITTER = { name: 'MetaSPN', email: 'noreply@metaspn.com' } as const

export async function createOrUpdateFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string | null
): Promise<void> {
  const payload: Record<string, unknown> = {
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    committer: COMMITTER,
    author: COMMITTER,
  }
  if (sha) payload.sha = sha
  await octokit.rest.repos.createOrUpdateFileContents(payload as any)
}

export async function appendToEventsJsonl(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  newLines: string[]
): Promise<void> {
  if (newLines.length === 0) return
  const path = 'log/events.jsonl'
  const existing = await getFileContent(octokit, owner, repo, path, branch)
  const current = existing ? existing.content : ''
  const appended = current ? (current.endsWith('\n') ? current + newLines.join('\n') : current + '\n' + newLines.join('\n')) : newLines.join('\n')
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    path,
    appended,
    'chore(log): append listening events',
    branch,
    existing?.sha ?? null
  )
}

const README_TEMPLATE = `# MetaSPN Listening Log

This repository stores your [MetaSPN](https://metaspn.com) listening data as an append-only log.

## Structure

- **\`log/events.jsonl\`** – Append-only event ledger. One JSON object per line (same shape as the [API export](https://metaspn.com/docs/api#event-ledger)). New listening events are appended; existing lines are never modified.
- **\`reports/\`** – Fan summary and influence digest (Markdown), updated on each push.
- **\`preferences/\`** – Podcast preferences (JSON).
- **\`meta.json\`** – Schema version, last sync time, and optional user id.

## Usage

Data is pushed automatically on schedule or when you click "Push to GitHub" in MetaSPN. You can also consume \`log/events.jsonl\` locally for analysis.
`

const META_TEMPLATE = (lastSync: string, userId?: string) =>
  JSON.stringify(
    { schema_version: 1, last_sync_utc: lastSync, metaspn_user_id: userId ?? null },
    null,
    2
  )

export async function seedRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  userId?: string
): Promise<void> {
  const now = new Date().toISOString()

  const files: { path: string; content: string; message: string }[] = [
    { path: 'README.md', content: README_TEMPLATE, message: 'chore: add README' },
    { path: 'log/.gitkeep', content: '', message: 'chore: add log/.gitkeep' },
    { path: 'reports/.gitkeep', content: '', message: 'chore: add reports/.gitkeep' },
    { path: 'preferences/.gitkeep', content: '', message: 'chore: add preferences/.gitkeep' },
    { path: 'meta.json', content: META_TEMPLATE(now, userId), message: 'chore: add meta.json' },
  ]

  for (const f of files) {
    const existing = await getFileContent(octokit, owner, repo, f.path, branch)
    if (!existing) await createOrUpdateFile(octokit, owner, repo, f.path, f.content, f.message, branch, null)
  }

  const logPath = 'log/events.jsonl'
  const logExisting = await getFileContent(octokit, owner, repo, logPath, branch)
  if (!logExisting) {
    await createOrUpdateFile(octokit, owner, repo, logPath, '', 'chore: seed MetaSPN structure', branch, null)
  }

  const fanPath = 'reports/fan-summary.md'
  const fanExisting = await getFileContent(octokit, owner, repo, fanPath, branch)
  if (!fanExisting) {
    await createOrUpdateFile(octokit, owner, repo, fanPath, '# Fan Summary\n\nNo data yet.\n', 'chore: add fan-summary', branch, null)
  }

  const digestPath = 'reports/influence-digest.md'
  const digestExisting = await getFileContent(octokit, owner, repo, digestPath, branch)
  if (!digestExisting) {
    await createOrUpdateFile(octokit, owner, repo, digestPath, '# Influence Digest\n\nNo data yet.\n', 'chore: add influence-digest', branch, null)
  }

  const prefsPath = 'preferences/podcasts.json'
  const prefsExisting = await getFileContent(octokit, owner, repo, prefsPath, branch)
  if (!prefsExisting) {
    await createOrUpdateFile(octokit, owner, repo, prefsPath, '[]', 'chore: add podcasts preferences', branch, null)
  }
}

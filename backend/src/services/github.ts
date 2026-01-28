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

/**
 * List contents of a directory in a GitHub repository
 */
export async function listDirectory(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size: number }> | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch })
    if (!Array.isArray(data)) return null
    return data.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size || 0,
    }))
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

/**
 * Append events to source-specific event log files in the new structure
 */
export async function appendToSourceEvents(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  sourceType: 'podcast' | 'youtube' | 'twitter' | 'blog' | 'book',
  eventType: 'listening' | 'viewing' | 'reading' | 'writing' | 'posting',
  transformedEvents: string[]
): Promise<void> {
  if (transformedEvents.length === 0) return
  
  const path = `sources/${sourceType}/${eventType}-events.jsonl`
  const existing = await getFileContent(octokit, owner, repo, path, branch)
  const current = existing ? existing.content : ''
  const appended = current
    ? current.endsWith('\n')
      ? current + transformedEvents.join('\n')
      : current + '\n' + transformedEvents.join('\n')
    : transformedEvents.join('\n')
  
  const commitMessage = `chore(sources): append ${transformedEvents.length} ${sourceType} ${eventType} event${transformedEvents.length === 1 ? '' : 's'}`
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    path,
    appended,
    commitMessage,
    branch,
    existing?.sha ?? null
  )
}

/**
 * Append artifacts to artifact-specific files in the new structure
 */
export async function appendToArtifacts(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  artifactType: 'twitter' | 'blog' | 'youtube' | 'podcast',
  artifactName: 'tweets' | 'posts' | 'videos' | 'episodes',
  transformedArtifacts: string[]
): Promise<void> {
  if (transformedArtifacts.length === 0) return
  
  const path = `artifacts/${artifactType}/${artifactName}.jsonl`
  const existing = await getFileContent(octokit, owner, repo, path, branch)
  const current = existing ? existing.content : ''
  const appended = current
    ? current.endsWith('\n')
      ? current + transformedArtifacts.join('\n')
      : current + '\n' + transformedArtifacts.join('\n')
    : transformedArtifacts.join('\n')
  
  const commitMessage = `chore(artifacts): append ${transformedArtifacts.length} ${artifactType} ${artifactName}`
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    path,
    appended,
    commitMessage,
    branch,
    existing?.sha ?? null
  )
}

/**
 * Append enhancement records to enhancement-specific files
 * These files are separate from raw artifacts and store computed enhancements
 */
export async function appendToEnhancementFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  artifactType: 'twitter' | 'blog' | 'youtube' | 'podcast',
  enhancementType: 'game_signatures' | 'quality_scores' | 'embeddings',
  records: string[]
): Promise<void> {
  if (records.length === 0) return
  
  const path = `artifacts/${artifactType}/${enhancementType}.jsonl`
  const existing = await getFileContent(octokit, owner, repo, path, branch)
  const current = existing ? existing.content : ''
  const appended = current
    ? current.endsWith('\n')
      ? current + records.join('\n')
      : current + '\n' + records.join('\n')
    : records.join('\n')
  
  const commitMessage = `chore(enhancements): append ${records.length} ${enhancementType} for ${artifactType}`
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    path,
    appended,
    commitMessage,
    branch,
    existing?.sha ?? null
  )
}

/**
 * Read enhancement records from an enhancement file
 * Returns a Map keyed by item_id for easy lookup
 */
export async function readEnhancementFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  artifactType: 'twitter' | 'blog' | 'youtube' | 'podcast',
  enhancementType: 'game_signatures' | 'quality_scores' | 'embeddings'
): Promise<Map<string, any>> {
  const path = `artifacts/${artifactType}/${enhancementType}.jsonl`
  const content = await getFileContent(octokit, owner, repo, path, branch)
  
  const enhancementMap = new Map<string, any>()
  
  if (!content || !content.content.trim()) {
    return enhancementMap
  }
  
  const lines = content.content.trim().split('\n').filter((line) => line.trim())
  
  for (const line of lines) {
    try {
      const record = JSON.parse(line)
      if (record.item_id) {
        // Store the most recent enhancement for each item_id
        // (later entries in the file override earlier ones)
        enhancementMap.set(record.item_id, record)
      }
    } catch {
      // Skip invalid JSON lines
    }
  }
  
  return enhancementMap
}

const README_TEMPLATE = `# MetaSPN Content Repository

This repository stores your [MetaSPN](https://metaspn.com) content consumption and creation data in a structured, append-only format.

## Structure

### Sources (\`sources/\`)
Raw event logs for content consumption (append-only, never edited):
- **\`sources/podcasts/listening-events.jsonl\`** – Podcast listening events
- **\`sources/youtube/viewing-events.jsonl\`** – YouTube viewing events
- **\`sources/twitter/reading-events.jsonl\`** – Twitter reading events
- **\`sources/twitter/posting-events.jsonl\`** – Twitter posting events
- **\`sources/blogs/reading-events.jsonl\`** – Blog reading events
- **\`sources/blogs/writing-events.jsonl\`** – Blog writing events
- **\`sources/books/reading-events.jsonl\`** – Book reading events

### Artifacts (\`artifacts/\`)
Content you created (your output):
- **\`artifacts/twitter/tweets.jsonl\`** – Your tweets
- **\`artifacts/blog/posts.jsonl\`** – Your blog posts
- **\`artifacts/youtube/videos.jsonl\`** – Your YouTube videos
- **\`artifacts/podcast/episodes.jsonl\`** – Your podcast episodes

### Preferences (\`preferences/\`)
Configuration and subscriptions:
- **\`preferences/podcasts.json\`** – Podcast subscriptions and preferences
- **\`preferences/youtube.json\`** – YouTube channel subscriptions
- **\`preferences/creators.json\`** – Followed creators across platforms

### Reports (\`reports/\`)
Computed views and analyses (regenerated on push):
- **\`reports/influence-digest.md\`** – Summary of influences
- **\`reports/trajectory-summary.md\`** – Your development over time
- **\`reports/game-signature.json\`** – G1-G6 distribution analysis
- **\`reports/timestamps/\`** – Time-windowed analyses

### Metadata
- **\`meta.json\`** – Schema version, user ID, last sync timestamps

## Usage

Data is pushed automatically on schedule or when you click "Push to GitHub" in MetaSPN. All event logs are append-only (never modified, only appended). Reports are regenerated on each push.

You can consume the JSONL files locally for analysis, or use the open-source MetaSPN analysis tools.
`

const META_TEMPLATE = (lastSync: string, userId?: string) =>
  JSON.stringify(
    { schema_version: '2.0.0', last_sync_utc: lastSync, metaspn_user_id: userId ?? null },
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

  // Core files
  const files: { path: string; content: string; message: string }[] = [
    { path: 'README.md', content: README_TEMPLATE, message: 'chore: add README' },
    { path: 'meta.json', content: META_TEMPLATE(now, userId), message: 'chore: add meta.json' },
    { path: '.gitignore', content: '# Sensitive data\n.env\n*.key\n', message: 'chore: add .gitignore' },
  ]

  // Create directory structure with .gitkeep files
  const directories = [
    // Sources
    'sources/podcasts',
    'sources/youtube',
    'sources/twitter',
    'sources/blogs',
    'sources/books',
    // Artifacts
    'artifacts/twitter',
    'artifacts/blog',
    'artifacts/youtube',
    'artifacts/podcast',
    // Preferences
    'preferences',
    // Reports
    'reports/timestamps',
    // Optional embeddings
    'embeddings/sources/podcasts',
    'embeddings/artifacts/twitter',
  ]

  for (const dir of directories) {
    const gitkeepPath = `${dir}/.gitkeep`
    const existing = await getFileContent(octokit, owner, repo, gitkeepPath, branch)
    if (!existing) {
      files.push({ path: gitkeepPath, content: '', message: `chore: create ${dir} directory` })
    }
  }

  // Initialize source event files (empty)
  const sourceEventFiles = [
    'sources/podcasts/listening-events.jsonl',
    'sources/youtube/viewing-events.jsonl',
    'sources/twitter/reading-events.jsonl',
    'sources/twitter/posting-events.jsonl',
    'sources/blogs/reading-events.jsonl',
    'sources/blogs/writing-events.jsonl',
    'sources/books/reading-events.jsonl',
  ]

  for (const path of sourceEventFiles) {
    const existing = await getFileContent(octokit, owner, repo, path, branch)
    if (!existing) {
      files.push({ path, content: '', message: `chore: initialize ${path}` })
    }
  }

  // Initialize artifact files (empty)
  const artifactFiles = [
    'artifacts/twitter/tweets.jsonl',
    'artifacts/blog/posts.jsonl',
    'artifacts/youtube/videos.jsonl',
    'artifacts/podcast/episodes.jsonl',
  ]

  for (const path of artifactFiles) {
    const existing = await getFileContent(octokit, owner, repo, path, branch)
    if (!existing) {
      files.push({ path, content: '', message: `chore: initialize ${path}` })
    }
  }

  // Initialize preference files
  const preferenceFiles = [
    { path: 'preferences/podcasts.json', content: '[]' },
    { path: 'preferences/youtube.json', content: '[]' },
    { path: 'preferences/creators.json', content: '[]' },
  ]

  for (const { path, content } of preferenceFiles) {
    const existing = await getFileContent(octokit, owner, repo, path, branch)
    if (!existing) {
      files.push({ path, content, message: `chore: initialize ${path}` })
    }
  }

  // Initialize report files
  const reportFiles = [
    { path: 'reports/influence-digest.md', content: '# Influence Digest\n\nNo data yet.\n' },
    { path: 'reports/trajectory-summary.md', content: '# Trajectory Summary\n\nNo data yet.\n' },
    { path: 'reports/game-signature.json', content: JSON.stringify({ period: new Date().toISOString().slice(0, 7), generated_at: now, overall_signature: {} }, null, 2) },
  ]

  for (const { path, content } of reportFiles) {
    const existing = await getFileContent(octokit, owner, repo, path, branch)
    if (!existing) {
      files.push({ path, content, message: `chore: initialize ${path}` })
    }
  }

  // Create all files
  for (const f of files) {
    const existing = await getFileContent(octokit, owner, repo, f.path, branch)
    if (!existing) {
      await createOrUpdateFile(octokit, owner, repo, f.path, f.content, f.message, branch, null)
    }
  }
}

/**
 * Seed feed repository with initial structure
 */
export async function seedFeedRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  userId: string
): Promise<void> {
  const now = new Date().toISOString()
  
  const feedReadme = `# MetaSPN Feed Repository

This repository contains your aggregated feed from people you're watching in the MetaSPN Network.

## Structure

- \`inbox/items.jsonl\` - New feed items (unprocessed)
- \`processed/YYYY-MM.jsonl\` - Processed items by month
- \`saved/items.jsonl\` - Items you've bookmarked
- \`watching/{user_id}.jsonl\` - Per-person feeds
- \`digests/daily/YYYY-MM-DD.md\` - Daily digests
- \`digests/weekly/YYYY-WW.md\` - Weekly digests

## Usage

This feed is automatically updated when people you watch push new content to their repos.

You can read the JSONL files directly, or use the MetaSPN web interface to browse your feed.
`
  
  const files: Array<{ path: string; content: string; message: string }> = [
    { path: 'README.md', content: feedReadme, message: 'chore: add feed README' },
    {
      path: 'meta.json',
      content: JSON.stringify(
        {
          schema_version: '1.0.0',
          metaspn_user_id: userId,
          created_at: now,
          last_updated_utc: now,
        },
        null,
        2
      ),
      message: 'chore: add feed meta.json',
    },
    { path: 'inbox/items.jsonl', content: '', message: 'chore: initialize inbox' },
    { path: 'saved/items.jsonl', content: '', message: 'chore: initialize saved items' },
  ]
  
  // Create directories
  const directories = ['inbox', 'processed', 'saved', 'watching', 'digests/daily', 'digests/weekly']
  for (const dir of directories) {
    const gitkeepPath = `${dir}/.gitkeep`
    const existing = await getFileContent(octokit, owner, repo, gitkeepPath, branch)
    if (!existing) {
      files.push({ path: gitkeepPath, content: '', message: `chore: create ${dir} directory` })
    }
  }
  
  // Create all files
  for (const f of files) {
    const existing = await getFileContent(octokit, owner, repo, f.path, branch)
    if (!existing) {
      await createOrUpdateFile(octokit, owner, repo, f.path, f.content, f.message, branch, null)
    }
  }
}

/**
 * Setup webhook on a repository
 */
export async function setupWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<{ id: number; url: string }> {
  // Check if webhook already exists
  const existingHooks = await octokit.rest.repos.listWebhooks({ owner, repo })
  
  // Look for existing webhook with our URL
  const existing = existingHooks.data.find((hook) => hook.config.url === webhookUrl)
  
  if (existing) {
    // Update existing webhook
    await octokit.rest.repos.updateWebhook({
      owner,
      repo,
      hook_id: existing.id,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0',
      },
      events: ['push', 'release'],
      active: true,
    })
    
    return { id: existing.id, url: webhookUrl }
  }
  
  // Create new webhook
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: 'json',
      secret,
      insecure_ssl: '0',
    },
    events: ['push', 'release'],
    active: true,
  })
  
  return { id: data.id, url: webhookUrl }
}

/**
 * Delete webhook from a repository
 */
export async function deleteWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  await octokit.rest.repos.deleteWebhook({
    owner,
    repo,
    hook_id: webhookId,
  })
}

/**
 * List webhooks on a repository
 */
export async function listWebhooks(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<Array<{ id: number; url: string; events: string[]; active: boolean }>> {
  const { data } = await octokit.rest.repos.listWebhooks({ owner, repo })
  
  return data.map((hook) => ({
    id: hook.id,
    url: hook.config.url || '',
    events: hook.events || [],
    active: hook.active,
  }))
}

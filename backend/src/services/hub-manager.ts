import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import { createRepo, getRepo, createOrUpdateFile, getFileContent, decryptToken } from './github.js'
import { listWatches, listWatchers } from './network-watch.js'

/**
 * Create hub repository for a user
 */
export async function createHubRepo(
  userId: string,
  octokit: Octokit,
  repoName: string = 'metaspn-hub',
  isPrivate: boolean = true
): Promise<{ owner: string; repo: string; branch: string }> {
  // Check if hub already exists
  const existing = await pool.query(
    `SELECT repo_owner, repo_name, branch
     FROM network_hubs
     WHERE user_id = $1`,
    [userId]
  )
  
  if (existing.rows.length > 0) {
    const hub = existing.rows[0]
    return {
      owner: hub.repo_owner,
      repo: hub.repo_name,
      branch: hub.branch,
    }
  }
  
  // Create repo
  const created = await createRepo(octokit, repoName, isPrivate)
  const info = await getRepo(octokit, created.owner, created.repo)
  const branch = info.default_branch
  
  // Seed hub with initial structure
  await seedHubRepo(octokit, created.owner, created.repo, branch, userId)
  
  return {
    owner: created.owner,
    repo: created.repo,
    branch,
  }
}

/**
 * Seed hub repository with initial structure
 */
async function seedHubRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  userId: string
): Promise<void> {
  // Create meta.json
  const meta = {
    schema_version: '1.0.0',
    metaspn_user_id: userId,
    created_at: new Date().toISOString(),
    last_sync_utc: new Date().toISOString(),
  }
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'meta.json',
    JSON.stringify(meta, null, 2),
    'chore: initialize hub repository',
    branch
  )
  
  // Create README.md
  const readme = `# MetaSPN Network Hub

This repository is your network control panel for the MetaSPN Network Protocol.

## Structure

- \`watching.json\` - People you're watching (your follows)
- \`watchers.json\` - People watching you (your followers)
- \`gates.json\` - Your gate configurations
- \`visibility.json\` - Your privacy settings
- \`analytics/network-metrics.json\` - Network analytics

## Usage

This hub is automatically synced with your network activity. You can edit these files directly, but changes will be overwritten on the next sync.

For network management, use the MetaSPN web interface.
`
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'README.md',
    readme,
    'chore: add hub README',
    branch
  )
  
  // Initialize empty config files
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'watching.json',
    JSON.stringify({ version: '1.0.0', watches: [] }, null, 2),
    'chore: initialize watching.json',
    branch
  )
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'watchers.json',
    JSON.stringify({ version: '1.0.0', watchers: [] }, null, 2),
    'chore: initialize watchers.json',
    branch
  )
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'gates.json',
    JSON.stringify({ version: '1.0.0', gates: [] }, null, 2),
    'chore: initialize gates.json',
    branch
  )
  
  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    'visibility.json',
    JSON.stringify({ visibility: 'private' }, null, 2),
    'chore: initialize visibility.json',
    branch
  )
}

/**
 * Sync hub repository with current network state
 */
export async function syncHubRepo(userId: string): Promise<void> {
  // Get hub
  const hubResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
     FROM network_hubs
     WHERE user_id = $1`,
    [userId]
  )
  
  if (hubResult.rows.length === 0) {
    throw new Error(`No hub repo found for user ${userId}`)
  }
  
  const hub = hubResult.rows[0]
  const token = decryptToken(hub.access_token_encrypted)
  const octokit = new Octokit({ auth: token })
  
  // Get current watches and watchers
  const watches = await listWatches(userId)
  const watchers = await listWatchers(userId)
  
  // Update watching.json
  const watching = {
    version: '1.0.0',
    watches: watches.map((w) => ({
      user_id: w.watched_user_id,
      repo_url: `github.com/${w.watched_repo_owner}/${w.watched_repo_name}`,
      watch_type: w.watch_type,
      gates: w.gates.map((g) => ({
        gate_type: g.gate_type,
        config: g.config,
        is_enabled: g.is_enabled,
      })),
      started_at: w.started_at.toISOString(),
      last_sync: w.last_sync_at?.toISOString() || null,
    })),
  }
  
  const watchingContent = await getFileContent(
    octokit,
    hub.repo_owner,
    hub.repo_name,
    'watching.json',
    hub.branch
  )
  
  await createOrUpdateFile(
    octokit,
    hub.repo_owner,
    hub.repo_name,
    'watching.json',
    JSON.stringify(watching, null, 2),
    'chore(hub): sync watching list',
    hub.branch,
    watchingContent?.sha || null
  )
  
  // Update watchers.json
  const watchersData = {
    version: '1.0.0',
    watchers: watchers.map((w) => ({
      user_id: w.watcher_user_id,
      watch_type: w.watch_type,
      watching_since: w.started_at.toISOString(),
    })),
  }
  
  const watchersContent = await getFileContent(
    octokit,
    hub.repo_owner,
    hub.repo_name,
    'watchers.json',
    hub.branch
  )
  
  await createOrUpdateFile(
    octokit,
    hub.repo_owner,
    hub.repo_name,
    'watchers.json',
    JSON.stringify(watchersData, null, 2),
    'chore(hub): sync watchers list',
    hub.branch,
    watchersContent?.sha || null
  )
  
  // Update meta.json
  const metaContent = await getFileContent(
    octokit,
    hub.repo_owner,
    hub.repo_name,
    'meta.json',
    hub.branch
  )
  
  if (metaContent) {
    const meta = JSON.parse(metaContent.content)
    meta.last_sync_utc = new Date().toISOString()
    
    await createOrUpdateFile(
      octokit,
      hub.repo_owner,
      hub.repo_name,
      'meta.json',
      JSON.stringify(meta, null, 2),
      'chore(hub): update sync timestamp',
      hub.branch,
      metaContent.sha
    )
  }
  
  // Update last_sync_at in database
  await pool.query(
    `UPDATE network_hubs
     SET last_sync_at = NOW()
     WHERE user_id = $1`,
    [userId]
  )
}

/**
 * Get hub status
 */
export async function getHubStatus(userId: string): Promise<{
  exists: boolean
  repo_owner?: string
  repo_name?: string
  last_sync_at?: Date
  visibility?: string
}> {
  const result = await pool.query(
    `SELECT repo_owner, repo_name, last_sync_at, visibility
     FROM network_hubs
     WHERE user_id = $1`,
    [userId]
  )
  
  if (result.rows.length === 0) {
    return { exists: false }
  }
  
  const hub = result.rows[0]
  return {
    exists: true,
    repo_owner: hub.repo_owner,
    repo_name: hub.repo_name,
    last_sync_at: hub.last_sync_at,
    visibility: hub.visibility,
  }
}

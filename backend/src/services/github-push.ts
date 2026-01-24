import { pool } from '../db/index.js'
import {
  createOctokit,
  decryptToken,
  appendToEventsJsonl,
  getFileContent,
  createOrUpdateFile,
  seedRepo,
} from './github.js'

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000'

function normalizeUserId(userId: string): string {
  return userId === 'demo-user-id' ? DEMO_USER_ID : userId
}

async function getFanSummaryMarkdown(userId: string): Promise<string> {
  const result = await pool.query(
    `SELECT p.podcast_id, p.title, COUNT(DISTINCT e.episode_id)::int as episodes_listened,
            AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0))::float as avg_completion
     FROM podcasts p
     JOIN episodes e ON p.podcast_id = e.podcast_id
     JOIN events ev ON e.episode_id = ev.episode_id
     WHERE ev.user_id = $1
     GROUP BY p.podcast_id, p.title ORDER BY episodes_listened DESC`,
    [userId]
  )
  let md = '# Fan Summary\n\n'
  if (result.rows.length === 0) {
    md += 'No data yet.\n'
    return md
  }
  for (const row of result.rows) {
    md += `## ${row.title}\n`
    md += `- Episodes Listened: ${row.episodes_listened}\n`
    md += `- Average Completion: ${((row.avg_completion || 0) * 100).toFixed(1)}%\n\n`
  }
  return md
}

async function getInfluenceDigestMarkdown(userId: string): Promise<string> {
  const result = await pool.query(
    `SELECT content FROM reports
     WHERE user_id = $1 AND report_type = 'monthly'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )
  if (result.rows.length === 0) return '# Influence Digest\n\nNo data yet.\n'
  return result.rows[0].content || '# Influence Digest\n\nNo content.\n'
}

async function getPreferencesJson(userId: string): Promise<string> {
  const result = await pool.query(
    `SELECT up.podcast_id, p.title as podcast_title, up.started_listening_date,
            up.listen_regularity, up.typical_listen_speed
     FROM user_podcast_preferences up
     JOIN podcasts p ON up.podcast_id = p.podcast_id
     WHERE up.user_id = $1 ORDER BY up.created_at DESC`,
    [userId]
  )
  const rows = result.rows.map((r) => ({
    podcast_id: r.podcast_id,
    podcast_title: r.podcast_title,
    started_listening_date: r.started_listening_date?.toISOString?.()?.split('T')[0] ?? null,
    listen_regularity: r.listen_regularity,
    typical_listen_speed: r.typical_listen_speed,
  }))
  return JSON.stringify(rows, null, 2)
}

async function getNewEventsSince(userId: string, since: string | null): Promise<string[]> {
  let query = `SELECT * FROM events WHERE user_id = $1`
  const params: (string | Date)[] = [userId]
  if (since) {
    query += ` AND timestamp_utc > $2`
    params.push(since)
  }
  query += ` ORDER BY timestamp_utc ASC`
  const result = await pool.query(query, params)
  return result.rows.map((row) => JSON.stringify(row))
}

export interface PushResult {
  pushed: boolean
  last_push_at?: string
  error?: string
}

export async function pushToGitHubForUser(userId: string): Promise<PushResult> {
  const uid = normalizeUserId(userId)
  const reposResult = await pool.query(
    `SELECT id, repo_owner, repo_name, branch, access_token_encrypted, last_push_at
     FROM user_github_repos WHERE user_id = $1`,
    [uid]
  )
  if (reposResult.rows.length === 0) {
    return { pushed: false, error: 'No GitHub repository connected' }
  }

  let lastPushAt: string | null = null
  let lastError: string | null = null

  for (const row of reposResult.rows) {
    let token: string
    try {
      token = decryptToken(row.access_token_encrypted)
    } catch (e) {
      lastError = 'Failed to decrypt token'
      await pool.query(
        `UPDATE user_github_repos SET last_error = $1 WHERE id = $2`,
        [lastError, row.id]
      )
      continue
    }

    const octokit = createOctokit(token)
    const { repo_owner, repo_name, branch } = row
    const since = row.last_push_at ? new Date(row.last_push_at).toISOString() : null

    try {
      const newLines = await getNewEventsSince(uid, since)
      if (newLines.length > 0) {
        await appendToEventsJsonl(octokit, repo_owner, repo_name, branch, newLines)
      }

      const fanMd = await getFanSummaryMarkdown(uid)
      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        'reports/fan-summary.md',
        fanMd,
        'chore(reports): update fan summary',
        branch,
        (await getFileContent(octokit, repo_owner, repo_name, 'reports/fan-summary.md', branch))?.sha ?? null
      )

      const digestMd = await getInfluenceDigestMarkdown(uid)
      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        'reports/influence-digest.md',
        digestMd,
        'chore(reports): update influence digest',
        branch,
        (await getFileContent(octokit, repo_owner, repo_name, 'reports/influence-digest.md', branch))?.sha ?? null
      )

      const prefs = await getPreferencesJson(uid)
      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        'preferences/podcasts.json',
        prefs,
        'chore(preferences): update podcast preferences',
        branch,
        (await getFileContent(octokit, repo_owner, repo_name, 'preferences/podcasts.json', branch))?.sha ?? null
      )

      const now = new Date().toISOString()
      const metaPath = 'meta.json'
      const metaExisting = await getFileContent(octokit, repo_owner, repo_name, metaPath, branch)
      let metaContent: string
      if (metaExisting) {
        try {
          const meta = JSON.parse(metaExisting.content) as Record<string, unknown>
          meta.last_sync_utc = now
          metaContent = JSON.stringify(meta, null, 2)
        } catch {
          metaContent = JSON.stringify({ schema_version: 1, last_sync_utc: now, metaspn_user_id: uid }, null, 2)
        }
      } else {
        metaContent = JSON.stringify({ schema_version: 1, last_sync_utc: now, metaspn_user_id: uid }, null, 2)
      }
      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        metaPath,
        metaContent,
        'chore: update meta.json',
        branch,
        metaExisting?.sha ?? null
      )

      lastPushAt = now
      await pool.query(
        `UPDATE user_github_repos SET last_push_at = $1, last_error = NULL WHERE id = $2`,
        [now, row.id]
      )
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      lastError = errMsg
      await pool.query(
        `UPDATE user_github_repos SET last_error = $1 WHERE id = $2`,
        [errMsg, row.id]
      )
    }
  }

  return {
    pushed: lastError == null,
    last_push_at: lastPushAt ?? undefined,
    error: lastError ?? undefined,
  }
}

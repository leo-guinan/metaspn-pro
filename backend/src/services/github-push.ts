import { pool } from '../db/index.js'
import {
  createOctokit,
  decryptToken,
  appendToEventsJsonl,
  appendToSourceEvents,
  getFileContent,
  createOrUpdateFile,
  seedRepo,
} from './github.js'
import {
  transformPodcastEventToNewSchema,
  type TransformedPodcastEvent,
} from './github-event-transform.js'

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

/**
 * Get new events with podcast and episode details for transformation
 */
async function getNewEventsWithDetails(
  userId: string,
  since: string | null
): Promise<Array<{
  event: any
  podcast: any
  episode: any
}>> {
  let query = `
    SELECT 
      e.*,
      p.podcast_id as p_podcast_id,
      p.title as p_title,
      p.description as p_description,
      p.rss_feed_url as p_rss_feed_url,
      p.website_url as p_website_url,
      p.image_url as p_image_url,
      ep.episode_id as ep_episode_id,
      ep.title as ep_title,
      ep.description as ep_description,
      ep.duration_sec as ep_duration_sec,
      ep.release_time as ep_release_time,
      ep.audio_url as ep_audio_url,
      ep.transcript_url as ep_transcript_url
    FROM events e
    JOIN podcasts p ON e.podcast_id = p.podcast_id
    JOIN episodes ep ON e.episode_id = ep.episode_id
    WHERE e.user_id = $1
  `
  const params: (string | Date)[] = [userId]
  if (since) {
    query += ` AND e.timestamp_utc > $2`
    params.push(since)
  }
  query += ` ORDER BY e.timestamp_utc ASC`
  
  const result = await pool.query(query, params)
  
  return result.rows.map((row) => ({
    event: {
      event_id: row.event_id,
      user_id: row.user_id,
      episode_id: row.episode_id,
      podcast_id: row.podcast_id,
      event_type: row.event_type,
      timestamp_utc: row.timestamp_utc,
      playhead_sec: row.playhead_sec,
      episode_duration_sec: row.episode_duration_sec,
      client: row.client,
      metadata: row.metadata,
    },
    podcast: {
      podcast_id: row.p_podcast_id,
      title: row.p_title,
      description: row.p_description,
      rss_feed_url: row.p_rss_feed_url,
      website_url: row.p_website_url,
      image_url: row.p_image_url,
    },
    episode: {
      episode_id: row.ep_episode_id,
      title: row.ep_title,
      description: row.ep_description,
      duration_sec: row.ep_duration_sec,
      release_time: row.ep_release_time,
      audio_url: row.ep_audio_url,
      transcript_url: row.ep_transcript_url,
    },
  }))
}

/**
 * Transform and append podcast events to the new structure
 */
async function transformAndAppendPodcastEvents(
  octokit: any,
  owner: string,
  repo: string,
  branch: string,
  userId: string,
  since: string | null
): Promise<void> {
  const eventsWithDetails = await getNewEventsWithDetails(userId, since)
  
  if (eventsWithDetails.length === 0) return
  
  // Transform events to new schema
  const transformedEvents: TransformedPodcastEvent[] = eventsWithDetails.map(({ event, podcast, episode }) =>
    transformPodcastEventToNewSchema(event, podcast, episode)
  )
  
  // Convert to JSONL strings
  const jsonlLines = transformedEvents.map((e) => JSON.stringify(e))
  
  // Append to sources/podcasts/listening-events.jsonl
  await appendToSourceEvents(octokit, owner, repo, branch, 'podcast', 'listening', jsonlLines)
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
      // Check meta.json to determine which structure to use
      const metaPath = 'meta.json'
      const metaExisting = await getFileContent(octokit, repo_owner, repo_name, metaPath, branch)
      let schemaVersion = '1.0.0'
      
      if (metaExisting) {
        try {
          const meta = JSON.parse(metaExisting.content) as { schema_version?: string | number }
          schemaVersion = String(meta.schema_version || '1.0.0')
        } catch {
          // If parsing fails, assume old structure
        }
      }
      
      // Use new structure (2.0.0+) for transformed events
      if (schemaVersion >= '2.0.0') {
        await transformAndAppendPodcastEvents(octokit, repo_owner, repo_name, branch, uid, since)
      } else {
        // Fallback to old structure for backward compatibility
        const newLines = await getNewEventsSince(uid, since)
        if (newLines.length > 0) {
          await appendToEventsJsonl(octokit, repo_owner, repo_name, branch, newLines)
        }
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
      const metaPath2 = 'meta.json'
      const metaExisting2 = await getFileContent(octokit, repo_owner, repo_name, metaPath2, branch)
      let metaContent: string
      if (metaExisting2) {
        try {
          const meta = JSON.parse(metaExisting2.content) as Record<string, unknown>
          meta.last_sync_utc = now
          // Ensure schema_version is set to 2.0.0 for new structure
          if (!meta.schema_version || (typeof meta.schema_version === 'number' && meta.schema_version < 2) || (typeof meta.schema_version === 'string' && meta.schema_version < '2.0.0')) {
            meta.schema_version = '2.0.0'
          }
          metaContent = JSON.stringify(meta, null, 2)
        } catch {
          metaContent = JSON.stringify({ schema_version: '2.0.0', last_sync_utc: now, metaspn_user_id: uid }, null, 2)
        }
      } else {
        metaContent = JSON.stringify({ schema_version: '2.0.0', last_sync_utc: now, metaspn_user_id: uid }, null, 2)
      }
      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        metaPath2,
        metaContent,
        'chore: update meta.json',
        branch,
        metaExisting2?.sha ?? null
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

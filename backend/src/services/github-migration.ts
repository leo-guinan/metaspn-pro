import { Octokit } from 'octokit'
import { getFileContent, createOrUpdateFile } from './github.js'
import { transformPodcastEventToNewSchema } from './github-event-transform.js'
import { pool } from '../db/index.js'

export interface RepoStructure {
  version: '1.0.0' | '2.0.0'
  hasOldStructure: boolean
  hasNewStructure: boolean
}

/**
 * Detect which repository structure is being used
 */
export async function detectRepoStructure(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<RepoStructure> {
  // Check meta.json for schema version
  const metaExisting = await getFileContent(octokit, owner, repo, 'meta.json', branch)
  let schemaVersion: '1.0.0' | '2.0.0' = '1.0.0'
  
  if (metaExisting) {
    try {
      const meta = JSON.parse(metaExisting.content) as { schema_version?: string | number }
      const version = String(meta.schema_version || '1.0.0')
      if (version >= '2.0.0') {
        schemaVersion = '2.0.0'
      }
    } catch {
      // If parsing fails, assume old structure
    }
  }
  
  // Check for old structure files
  const oldLogPath = 'log/events.jsonl'
  const oldLogExists = !!(await getFileContent(octokit, owner, repo, oldLogPath, branch))
  
  // Check for new structure files
  const newSourcePath = 'sources/podcasts/listening-events.jsonl'
  const newSourceExists = !!(await getFileContent(octokit, owner, repo, newSourcePath, branch))
  
  return {
    version: schemaVersion,
    hasOldStructure: oldLogExists,
    hasNewStructure: newSourceExists,
  }
}

/**
 * Migrate old repository structure to new structure
 */
export async function migrateOldRepoToNew(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  userId: string
): Promise<{ migrated: boolean; eventsMigrated: number; tweetsMigrated: number; error?: string }> {
  try {
    // 1. Read old log/events.jsonl
    const oldLogPath = 'log/events.jsonl'
    const oldLogFile = await getFileContent(octokit, owner, repo, oldLogPath, branch)
    
    let eventsMigrated = 0
    if (oldLogFile && oldLogFile.content.trim()) {
      // Parse JSONL events
      const eventLines = oldLogFile.content.trim().split('\n').filter((line) => line.trim())
      const events = eventLines.map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      }).filter(Boolean)
      
      // Transform and migrate events
      if (events.length > 0) {
        const transformedEvents: string[] = []
        
        for (const event of events) {
          // Fetch podcast and episode details from database
          const podcastResult = await pool.query(
            'SELECT podcast_id, title, description, rss_feed_url, website_url, image_url FROM podcasts WHERE podcast_id = $1',
            [event.podcast_id]
          )
          
          const episodeResult = await pool.query(
            'SELECT episode_id, title, description, duration_sec, release_time, audio_url, transcript_url FROM episodes WHERE episode_id = $1',
            [event.episode_id]
          )
          
          if (podcastResult.rows.length > 0 && episodeResult.rows.length > 0) {
            const podcast = podcastResult.rows[0]
            const episode = episodeResult.rows[0]
            
            const transformed = transformPodcastEventToNewSchema(event, podcast, episode)
            transformedEvents.push(JSON.stringify(transformed))
            eventsMigrated++
          }
        }
        
        // Append to new structure
        if (transformedEvents.length > 0) {
          const newPath = 'sources/podcasts/listening-events.jsonl'
          const existing = await getFileContent(octokit, owner, repo, newPath, branch)
          const current = existing ? existing.content : ''
          const appended = current
            ? current.endsWith('\n')
              ? current + transformedEvents.join('\n')
              : current + '\n' + transformedEvents.join('\n')
            : transformedEvents.join('\n')
          
          await createOrUpdateFile(
            octokit,
            owner,
            repo,
            newPath,
            appended,
            `chore(migration): migrate ${transformedEvents.length} events from old structure`,
            branch,
            existing?.sha ?? null
          )
        }
      }
    }
    
    // 2. Migrate old log/tweets.jsonl to artifacts/twitter/tweets.jsonl
    const oldTweetsPath = 'log/tweets.jsonl'
    const oldTweetsFile = await getFileContent(octokit, owner, repo, oldTweetsPath, branch)
    
    let tweetsMigrated = 0
    if (oldTweetsFile && oldTweetsFile.content.trim()) {
      // Read old tweets
      const tweetLines = oldTweetsFile.content.trim().split('\n').filter((line) => line.trim())
      
      // Transform to artifact schema (simplified - would need full transformation in production)
      const artifactLines = tweetLines.map((line) => {
        try {
          const tweet = JSON.parse(line)
          const artifact = {
            id: tweet.id_str || String(tweet.id || ''),
            timestamp: tweet.created_at || new Date().toISOString(),
            user_id: userId,
            version: '1.0.0',
            tweet: {
              id: tweet.id_str || String(tweet.id || ''),
              text: tweet.full_text || '',
              url: tweet.id_str ? `https://twitter.com/i/web/status/${tweet.id_str}` : undefined,
              created_at: tweet.created_at || new Date().toISOString(),
              type: tweet.in_reply_to_status_id_str ? 'reply' : 'original',
            },
            metrics: {
              impressions: 0,
              likes: tweet.favorite_count || 0,
              retweets: tweet.retweet_count || 0,
              replies: 0,
              quotes: 0,
              bookmarks: 0,
            },
            analysis: {
              game_signature: { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 },
              themes: [],
              sentiment: 'neutral',
              complexity_score: 0,
            },
          }
          return JSON.stringify(artifact)
        } catch {
          return line // Keep original if transformation fails
        }
      })
      
      tweetsMigrated = artifactLines.length
      
      // Append to new structure
      if (artifactLines.length > 0) {
        const newPath = 'artifacts/twitter/tweets.jsonl'
        const existing = await getFileContent(octokit, owner, repo, newPath, branch)
        const current = existing ? existing.content : ''
        const appended = current
          ? current.endsWith('\n')
            ? current + artifactLines.join('\n')
            : current + '\n' + artifactLines.join('\n')
          : artifactLines.join('\n')
        
        await createOrUpdateFile(
          octokit,
          owner,
          repo,
          newPath,
          appended,
          `chore(migration): migrate ${artifactLines.length} tweets from old structure`,
          branch,
          existing?.sha ?? null
        )
      }
    }
    
    // 3. Update meta.json to schema version 2.0.0
    const metaPath = 'meta.json'
    const metaExisting = await getFileContent(octokit, owner, repo, metaPath, branch)
    let metaContent: string
    
    if (metaExisting) {
      try {
        const meta = JSON.parse(metaExisting.content) as Record<string, unknown>
        meta.schema_version = '2.0.0'
        metaContent = JSON.stringify(meta, null, 2)
      } catch {
        metaContent = JSON.stringify(
          {
            schema_version: '2.0.0',
            last_sync_utc: new Date().toISOString(),
            metaspn_user_id: userId,
          },
          null,
          2
        )
      }
    } else {
      metaContent = JSON.stringify(
        {
          schema_version: '2.0.0',
          last_sync_utc: new Date().toISOString(),
          metaspn_user_id: userId,
        },
        null,
        2
      )
    }
    
    await createOrUpdateFile(
      octokit,
      owner,
      repo,
      metaPath,
      metaContent,
      'chore(migration): update schema version to 2.0.0',
      branch,
      metaExisting?.sha ?? null
    )
    
    return {
      migrated: true,
      eventsMigrated,
      tweetsMigrated,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      migrated: false,
      eventsMigrated: 0,
      tweetsMigrated: 0,
      error: errorMessage,
    }
  }
}

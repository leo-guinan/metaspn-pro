import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import { getOAuthAccount } from './oauth.js'
import { createOctokit, decryptToken, getFileContent, createOrUpdateFile } from './github.js'

// Supabase configuration (same as in update-archive-tool)
const SUPABASE_URL = 'https://fabxmporizzqflnftavs.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8'
const PAGE_SIZE = 1000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const REQUEST_TIMEOUT_MS = 30000

interface SupabaseTweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  favorite_count?: number
  retweet_count?: number
  reply_to_tweet_id?: string
  reply_to_user_id?: string
  reply_to_username?: string
}

interface SupabaseAccount {
  account_id: string
  username: string
  account_display_name?: string
}

interface TweetData {
  id_str?: string
  id?: number
  created_at?: string
  full_text?: string
  favorite_count?: number
  retweet_count?: number
  entities?: {
    hashtags?: Array<{ text: string; indices: [number, number] }>
    user_mentions?: Array<{ screen_name: string; name: string; indices: [number, number] }>
    urls?: unknown[]
    symbols?: unknown[]
  }
  in_reply_to_status_id_str?: string
  in_reply_to_user_id_str?: string
  in_reply_to_screen_name?: string
  [key: string]: unknown
}

export interface SyncResult {
  success: boolean
  tweets_synced: number
  error?: string
  last_synced_at?: string
}

/**
 * Check if a Twitter archive is available in the community archive
 */
export async function checkArchiveAvailable(username: string): Promise<boolean> {
  try {
    // Normalize username: remove @ if present, lowercase
    const normalizedUsername = username.replace(/^@/, '').toLowerCase()
    console.log(`[ArchiveCheck] Checking archive for username: "${username}" (normalized: "${normalizedUsername}")`)

    const twitterArchiveToolModule = await import('../mastra/tools/twitter-archive-tool.js')
    const twitterArchiveTool = twitterArchiveToolModule.twitterArchiveTool

    if (!twitterArchiveTool) {
      console.error('[ArchiveCheck] twitterArchiveTool not found')
      return false
    }

    // First check if account exists in Supabase account table
    const accountId = await getAccountId(normalizedUsername)
    if (!accountId) {
      console.log(`[ArchiveCheck] Account not found in Supabase account table for username: "${normalizedUsername}"`)
      // Continue to check archive anyway, in case account table is incomplete
    } else {
      console.log(`[ArchiveCheck] Account found in Supabase with account_id: ${accountId}`)
    }

    const result: any = await (twitterArchiveTool as any).execute({ username: normalizedUsername })
    
    console.log(`[ArchiveCheck] Archive check result:`, {
      success: result?.success,
      hasArchive: !!result?.archive,
      error: result?.error,
      statusCode: result?.statusCode,
    })

    const available = result?.success === true && result?.archive !== undefined
    if (!available && result?.error) {
      console.log(`[ArchiveCheck] Archive not available: ${result.error}`)
    }
    
    return available
  } catch (error) {
    console.error('[ArchiveCheck] Error checking archive availability:', error)
    return false
  }
}

/**
 * Get account_id for a username from Supabase
 */
async function getAccountId(username: string, retryCount = 0): Promise<string | null> {
  const url = `${SUPABASE_URL}/rest/v1/account?username=eq.${encodeURIComponent(username)}&select=account_id,username`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        return getAccountId(username, retryCount + 1)
      }
      return null
    }

    const data = (await response.json()) as SupabaseAccount[]
    return data.length > 0 ? data[0].account_id : null
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      return getAccountId(username, retryCount + 1)
    }
    return null
  }
}

/**
 * Fetch tweets from Supabase since a given date
 */
async function fetchTweetsFromSupabase(
  accountId: string,
  sinceDate: Date,
  retryCount = 0
): Promise<SupabaseTweet[]> {
  const sinceIso = sinceDate.toISOString()
  const allTweets: SupabaseTweet[] = []
  let offset = 0

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/tweets?account_id=eq.${accountId}&created_at=gte.${sinceIso}&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (retryCount < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          return fetchTweetsFromSupabase(accountId, sinceDate, retryCount + 1)
        }
        throw new Error(`HTTP error ${response.status}`)
      }

      const data = (await response.json()) as SupabaseTweet[]

      if (data.length === 0) {
        break
      }

      allTweets.push(...data)

      if (data.length < PAGE_SIZE) {
        break
      }

      offset += PAGE_SIZE
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        return fetchTweetsFromSupabase(accountId, sinceDate, retryCount + 1)
      }
      throw error
    }
  }

  return allTweets
}

/**
 * Convert Supabase tweet to TweetData format
 */
function convertSupabaseTweetToTweetData(tweet: SupabaseTweet): TweetData {
  // Parse ISO date and convert to Twitter format
  const date = new Date(tweet.created_at)
  const createdAtStr = formatTwitterDate(date)

  // Extract entities from text
  const entities = extractEntitiesFromText(tweet.full_text || '')

  return {
    id_str: tweet.tweet_id,
    id: /^\d+$/.test(tweet.tweet_id) ? parseInt(tweet.tweet_id, 10) : 0,
    full_text: tweet.full_text || '',
    created_at: createdAtStr,
    favorite_count: tweet.favorite_count || 0,
    retweet_count: tweet.retweet_count || 0,
    in_reply_to_status_id_str: tweet.reply_to_tweet_id ? String(tweet.reply_to_tweet_id) : undefined,
    in_reply_to_user_id_str: tweet.reply_to_user_id ? String(tweet.reply_to_user_id) : undefined,
    in_reply_to_screen_name: tweet.reply_to_username,
    entities,
  }
}

/**
 * Extract entities (mentions, hashtags) from tweet text
 */
function extractEntitiesFromText(text: string): {
  hashtags: Array<{ text: string; indices: [number, number] }>
  user_mentions: Array<{ screen_name: string; name: string; indices: [number, number] }>
  urls: unknown[]
  symbols: unknown[]
} {
  const entities = {
    hashtags: [] as Array<{ text: string; indices: [number, number] }>,
    symbols: [] as unknown[],
    user_mentions: [] as Array<{ screen_name: string; name: string; indices: [number, number] }>,
    urls: [] as unknown[],
  }

  if (!text) {
    return entities
  }

  const words = text.split(/\s+/)
  let currentIndex = 0

  for (const word of words) {
    const wordStart = text.indexOf(word, currentIndex)
    const wordEnd = wordStart + word.length
    currentIndex = wordEnd

    // Extract mentions (@username)
    if (word.startsWith('@') && word.length > 1) {
      const mention = word.replace(/[.,;:!?()\[\]{}"'`]/g, '')
      if (mention.length > 1) {
        entities.user_mentions.push({
          screen_name: mention.substring(1).toLowerCase(),
          name: mention.substring(1),
          indices: [wordStart, wordEnd] as [number, number],
        })
      }
    }
    // Extract hashtags (#tag)
    else if (word.startsWith('#') && word.length > 1) {
      const hashtag = word.replace(/[.,;:!?()\[\]{}"'`]/g, '')
      if (hashtag.length > 1) {
        entities.hashtags.push({
          text: hashtag.substring(1),
          indices: [wordStart, wordEnd] as [number, number],
        })
      }
    }
  }

  return entities
}

/**
 * Format Twitter date: "Mon Jan 01 12:00:00 +0000 2024"
 */
function formatTwitterDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const day = days[date.getUTCDay()]
  const month = months[date.getUTCMonth()]
  const dayNum = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  const year = date.getUTCFullYear()

  return `${day} ${month} ${dayNum} ${hours}:${minutes}:${seconds} +0000 ${year}`
}

/**
 * Get tweets for sync - either full archive or incremental updates
 */
export async function getTweetsForSync(
  username: string,
  since?: Date
): Promise<TweetData[]> {
  try {
    if (since) {
      // Use Supabase API directly for incremental updates
      const accountId = await getAccountId(username)
      if (!accountId) {
        console.warn(`Could not find account_id for username: ${username}`)
        return []
      }

      const supabaseTweets = await fetchTweetsFromSupabase(accountId, since)
      return supabaseTweets.map(convertSupabaseTweetToTweetData)
    } else {
      // Get full archive
      return await getFullArchive(username)
    }
  } catch (error) {
    console.error('Error getting tweets for sync:', error)
    throw error
  }
}

/**
 * Get full archive and extract tweets
 */
async function getFullArchive(username: string): Promise<TweetData[]> {
  const twitterArchiveToolModule = await import('../mastra/tools/twitter-archive-tool.js')
  const twitterArchiveTool = twitterArchiveToolModule.twitterArchiveTool

  if (!twitterArchiveTool) {
    throw new Error('twitterArchiveTool not found')
  }

  const result: any = await (twitterArchiveTool as any).execute({ username })

  if (!result?.success || !result?.archive) {
    return []
  }

  const archive = result.archive as { tweets?: Array<{ tweet: TweetData }> }
  if (!archive.tweets || !Array.isArray(archive.tweets)) {
    return []
  }

  // Extract tweets from the archive format
  return archive.tweets.map((wrapper) => wrapper.tweet).filter((tweet) => tweet && tweet.id_str)
}


/**
 * Transform tweets to artifact schema format
 */
export function transformTweetsToArtifactSchema(tweets: TweetData[], userId: string): string[] {
  return tweets.map((tweet) => {
    const tweetId = tweet.id_str || String(tweet.id || '')
    const createdAt = tweet.created_at || new Date().toISOString()
    
    // Determine tweet type
    let tweetType: 'original' | 'reply' | 'retweet' | 'quote' = 'original'
    if (tweet.in_reply_to_status_id_str) {
      tweetType = 'reply'
    }
    // Note: retweet and quote detection would need additional fields
    
    // Build tweet URL (assuming we have username from context)
    const tweetUrl = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined
    
    // Parse created_at to ISO format if it's in Twitter format
    let createdAtIso: string
    if (createdAt.includes('+0000') || createdAt.match(/^[A-Z][a-z]{2} /)) {
      // Twitter format: "Mon Jan 01 12:00:00 +0000 2024"
      try {
        createdAtIso = new Date(createdAt).toISOString()
      } catch {
        createdAtIso = new Date().toISOString()
      }
    } else {
      createdAtIso = createdAt
    }
    
    const artifact = {
      id: tweetId,
      timestamp: createdAtIso,
      user_id: userId,
      version: '1.0.0',
      tweet: {
        id: tweetId,
        text: tweet.full_text || '',
        url: tweetUrl,
        created_at: createdAtIso,
        type: tweetType,
        thread_id: tweet.in_reply_to_status_id_str ? undefined : tweetId, // Simplified
      },
      metrics: {
        impressions: 0, // Not available from archive
        likes: tweet.favorite_count || 0,
        retweets: tweet.retweet_count || 0,
        replies: 0, // Not available from archive
        quotes: 0, // Not available from archive
        bookmarks: 0, // Not available from archive
      },
      analysis: {
        game_signature: {
          G1: 0,
          G2: 0,
          G3: 0,
          G4: 0,
          G5: 0,
          G6: 0,
        },
        themes: [] as string[],
        sentiment: 'neutral',
        complexity_score: 0,
      },
    }
    
    return JSON.stringify(artifact)
  })
}

/**
 * Format tweets as JSONL (one JSON object per line) - legacy format
 */
export function formatTweetsAsJsonl(tweets: TweetData[]): string[] {
  return tweets.map((tweet) => {
    // Create a clean tweet object with only the fields we want
    const cleanTweet: Record<string, unknown> = {
      id_str: tweet.id_str,
      created_at: tweet.created_at,
      full_text: tweet.full_text || '',
      favorite_count: tweet.favorite_count || 0,
      retweet_count: tweet.retweet_count || 0,
    }

    // Add optional fields if they exist
    if (tweet.entities) {
      cleanTweet.entities = tweet.entities
    }
    if (tweet.in_reply_to_status_id_str) {
      cleanTweet.in_reply_to_status_id_str = tweet.in_reply_to_status_id_str
    }
    if (tweet.in_reply_to_user_id_str) {
      cleanTweet.in_reply_to_user_id_str = tweet.in_reply_to_user_id_str
    }
    if (tweet.in_reply_to_screen_name) {
      cleanTweet.in_reply_to_screen_name = tweet.in_reply_to_screen_name
    }

    return JSON.stringify(cleanTweet)
  })
}

/**
 * Append tweets to GitHub repository as JSONL (legacy path)
 */
export async function appendTweetsToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  tweetLines: string[]
): Promise<void> {
  if (tweetLines.length === 0) return

  const path = 'log/tweets.jsonl'
  const existing = await getFileContent(octokit, owner, repo, path, branch)
  const current = existing ? existing.content : ''
  const appended = current
    ? current.endsWith('\n')
      ? current + tweetLines.join('\n')
      : current + '\n' + tweetLines.join('\n')
    : tweetLines.join('\n')

  await createOrUpdateFile(
    octokit,
    owner,
    repo,
    path,
    appended,
    `chore(log): sync ${tweetLines.length} tweet${tweetLines.length === 1 ? '' : 's'} from Twitter archive`,
    branch,
    existing?.sha ?? null
  )
}

/**
 * Append tweets to GitHub repository as artifacts (new structure)
 */
export async function appendTweetsToGitHubAsArtifacts(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  artifactLines: string[]
): Promise<void> {
  if (artifactLines.length === 0) return

  const path = 'artifacts/twitter/tweets.jsonl'
  const existing = await getFileContent(octokit, owner, repo, path, branch)
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
    path,
    appended,
    `chore(artifacts): sync ${artifactLines.length} tweet${artifactLines.length === 1 ? '' : 's'} from Twitter archive`,
    branch,
    existing?.sha ?? null
  )
}

/**
 * Main function to sync Twitter archive to GitHub repository
 */
export async function syncTwitterArchiveToGitHub(userId: string): Promise<SyncResult> {
  try {
    // 1. Check user has Twitter account
    const twitterAccount = await getOAuthAccount(userId, 'twitter')
    if (!twitterAccount || !twitterAccount.provider_username) {
      return {
        success: false,
        tweets_synced: 0,
        error: 'User does not have a Twitter account connected',
      }
    }

    const twitterUsername = twitterAccount.provider_username

    // 2. Check user has GitHub repo
    const repoResult = await pool.query(
      `SELECT id, repo_owner, repo_name, branch, access_token_encrypted, last_twitter_sync_at
       FROM user_github_repos 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    )

    if (repoResult.rows.length === 0) {
      return {
        success: false,
        tweets_synced: 0,
        error: 'User does not have a GitHub repository connected',
      }
    }

    const repo = repoResult.rows[0]
    const { repo_owner, repo_name, branch, access_token_encrypted } = repo
    const lastSync = repo.last_twitter_sync_at ? new Date(repo.last_twitter_sync_at) : undefined

    // 3. Check archive availability
    const archiveAvailable = await checkArchiveAvailable(twitterUsername)
    if (!archiveAvailable) {
      return {
        success: false,
        tweets_synced: 0,
        error: 'Twitter archive not found in community archive',
      }
    }

    // 4. Get tweets (incremental or full)
    const tweets = await getTweetsForSync(twitterUsername, lastSync)
    if (tweets.length === 0) {
      // No new tweets, but this is still a successful sync
      return {
        success: true,
        tweets_synced: 0,
        last_synced_at: new Date().toISOString(),
      }
    }

    // 5. Decrypt GitHub token and create Octokit instance
    const decryptedToken = decryptToken(access_token_encrypted)
    const octokit = createOctokit(decryptedToken)

    // 6. Check meta.json to determine which structure to use
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

    // 7. Format and append to GitHub (use new structure if schema >= 2.0.0)
    if (schemaVersion >= '2.0.0') {
      const artifactLines = transformTweetsToArtifactSchema(tweets, userId)
      await appendTweetsToGitHubAsArtifacts(octokit, repo_owner, repo_name, branch, artifactLines)
    } else {
      // Fallback to old structure for backward compatibility
      const tweetLines = formatTweetsAsJsonl(tweets)
      await appendTweetsToGitHub(octokit, repo_owner, repo_name, branch, tweetLines)
    }

    // 8. Update last_twitter_sync_at in database
    const now = new Date()
    await pool.query(
      `UPDATE user_github_repos 
       SET last_twitter_sync_at = $1, last_error = NULL 
       WHERE user_id = $2 AND repo_owner = $3 AND repo_name = $4`,
      [now, userId, repo_owner, repo_name]
    )

    // 9. Update meta.json with sync timestamp
    try {
      const metaPath = 'meta.json'
      const metaExisting = await getFileContent(octokit, repo_owner, repo_name, metaPath, branch)
      let metaContent: string
      if (metaExisting) {
        try {
          const meta = JSON.parse(metaExisting.content) as {
            schema_version?: number
            last_sync_utc?: string
            last_twitter_sync_utc?: string
            metaspn_user_id?: string
          }
          meta.last_twitter_sync_utc = now.toISOString()
          // Ensure schema_version is set to 2.0.0 for new structure
          if (!meta.schema_version || (typeof meta.schema_version === 'number' && meta.schema_version < 2) || (typeof meta.schema_version === 'string' && meta.schema_version < '2.0.0')) {
            meta.schema_version = '2.0.0'
          }
          metaContent = JSON.stringify(meta, null, 2)
        } catch {
          // If parsing fails, create new meta
          metaContent = JSON.stringify(
            {
              schema_version: '2.0.0',
              last_sync_utc: now.toISOString(),
              last_twitter_sync_utc: now.toISOString(),
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
            last_sync_utc: now.toISOString(),
            last_twitter_sync_utc: now.toISOString(),
            metaspn_user_id: userId,
          },
          null,
          2
        )
      }

      await createOrUpdateFile(
        octokit,
        repo_owner,
        repo_name,
        metaPath,
        metaContent,
        'chore(meta): update Twitter sync timestamp',
        branch,
        metaExisting?.sha ?? null
      )
    } catch (metaError) {
      // Log but don't fail the sync if meta.json update fails
      console.error('Error updating meta.json:', metaError)
    }

    return {
      success: true,
      tweets_synced: tweets.length,
      last_synced_at: now.toISOString(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error syncing Twitter archive to GitHub:', error)

    // Update last_error in database
    try {
      await pool.query(
        `UPDATE user_github_repos 
         SET last_error = $1 
         WHERE user_id = $2`,
        [errorMessage, userId]
      )
    } catch (dbError) {
      console.error('Error updating last_error:', dbError)
    }

    return {
      success: false,
      tweets_synced: 0,
      error: errorMessage,
    }
  }
}

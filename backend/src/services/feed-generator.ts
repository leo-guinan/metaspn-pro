import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import { createOrUpdateFile, getFileContent, appendToEventsJsonl } from './github.js'
import { decryptToken } from './github.js'
import { NetworkChanges } from './gates/gate-types.js'
import { GateEvaluationResult } from './gates/gate-engine.js'
import { updateWatchSyncTime } from './network-watch.js'

export interface FeedItem {
  id: string
  timestamp: string
  source_user: string
  source_repo: string
  item_type: 'artifact' | 'source' | 'report' | 'trajectory_shift'
  content: {
    type: string
    title?: string
    text: string
    url?: string
    excerpt?: string
    game_signature?: Record<string, number>
    themes?: string[]
    complexity_score?: number
  }
  metadata: {
    passed_gates?: string[]
    relevance_score?: number
    creator_score?: number
    predicted_value?: number
  }
  network_context?: {
    mutual_watchers?: number
    shared_influences?: string[]
    conversation_threads?: string[]
  }
}

/**
 * Create a feed item from network changes
 */
export function createFeedItem(
  changes: NetworkChanges,
  sourceUserId: string,
  sourceRepoOwner: string,
  sourceRepoName: string,
  evaluation: GateEvaluationResult
): FeedItem[] {
  const items: FeedItem[] = []
  const timestamp = new Date().toISOString()
  
  // Create items from artifacts
  if (changes.new_artifacts) {
    for (const artifact of changes.new_artifacts) {
      items.push({
        id: `artifact-${artifact.id}`,
        timestamp: artifact.timestamp || timestamp,
        source_user: sourceUserId,
        source_repo: `${sourceRepoOwner}/${sourceRepoName}`,
        item_type: 'artifact',
        content: {
          type: artifact.type,
          text: artifact.text,
          url: artifact.url,
          excerpt: artifact.text.substring(0, 300),
          game_signature: changes.game_signature,
          themes: changes.themes,
          complexity_score: changes.analysis?.complexity_score,
        },
        metadata: {
          passed_gates: evaluation.gate_results
            .filter((gr) => gr.result.passed)
            .map((gr) => gr.gate_type),
          creator_score: changes.analysis?.creator_score,
          predicted_value: changes.analysis?.quality_score,
        },
      })
    }
  }
  
  // Create items from sources
  if (changes.new_sources) {
    for (const source of changes.new_sources) {
      items.push({
        id: `source-${source.id}`,
        timestamp: source.timestamp || timestamp,
        source_user: sourceUserId,
        source_repo: `${sourceRepoOwner}/${sourceRepoName}`,
        item_type: 'source',
        content: {
          type: source.type,
          text: source.text,
          excerpt: source.text.substring(0, 300),
          game_signature: changes.game_signature,
          themes: changes.themes,
        },
        metadata: {
          passed_gates: evaluation.gate_results
            .filter((gr) => gr.result.passed)
            .map((gr) => gr.gate_type),
        },
      })
    }
  }
  
  // Create item for trajectory shift if significant
  if (changes.trajectory_shift?.detected && changes.trajectory_shift.significance >= 0.7) {
    items.push({
      id: `trajectory-${timestamp}`,
      timestamp,
      source_user: sourceUserId,
      source_repo: `${sourceRepoOwner}/${sourceRepoName}`,
      item_type: 'trajectory_shift',
      content: {
        type: 'trajectory_shift',
        text: changes.trajectory_shift.description || 'Significant trajectory shift detected',
        game_signature: changes.game_signature,
        themes: changes.themes,
      },
      metadata: {
        passed_gates: ['emergence_detector'],
      },
    })
  }
  
  return items
}

/**
 * Add items to a user's feed repository
 */
export async function addItemsToFeed(
  feedUserId: string,
  items: FeedItem[]
): Promise<void> {
  if (items.length === 0) return
  
  // Get feed repo
  const feedResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
     FROM network_feeds
     WHERE user_id = $1`,
    [feedUserId]
  )
  
  if (feedResult.rows.length === 0) {
    throw new Error(`No feed repo found for user ${feedUserId}`)
  }
  
  const feed = feedResult.rows[0]
  const token = decryptToken(feed.access_token_encrypted)
  const octokit = new Octokit({ auth: token })
  
  // Append to inbox/items.jsonl
  const inboxPath = 'inbox/items.jsonl'
  const lines = items.map((item) => JSON.stringify(item))
  
  await appendToEventsJsonl(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    feed.branch,
    lines
  )
  
  // Update last_updated_at
  await pool.query(
    `UPDATE network_feeds
     SET last_updated_at = NOW()
     WHERE user_id = $1`,
    [feedUserId]
  )
}

/**
 * Process feed items through gates and add to feeds
 */
export async function processChangesForWatchers(
  watchedUserId: string,
  repoOwner: string,
  repoName: string,
  changes: NetworkChanges
): Promise<void> {
  // Get all watchers
  const watchersResult = await pool.query(
    `SELECT watch_id, watcher_user_id
     FROM network_watches
     WHERE watched_user_id = $1
     AND watched_repo_owner = $2
     AND watched_repo_name = $3
     AND is_active = true`,
    [watchedUserId, repoOwner, repoName]
  )
  
  // Import gate evaluation
  const { evaluateGates } = await import('./gates/gate-engine.js')
  
  // Process for each watcher
  for (const watch of watchersResult.rows) {
    try {
      // Evaluate gates
      const evaluation = await evaluateGates(watch.watch_id, changes)
      
      if (evaluation.passed) {
        // Create feed items
        const items = createFeedItem(
          changes,
          watchedUserId,
          repoOwner,
          repoName,
          evaluation
        )
        
        // Add to watcher's feed
        await addItemsToFeed(watch.watcher_user_id, items)
        
        // Update sync time
        await updateWatchSyncTime(watch.watch_id)
      }
    } catch (error) {
      console.error(`Error processing changes for watcher ${watch.watcher_user_id}:`, error)
      // Continue with other watchers
    }
  }
}

/**
 * Mark feed item as processed
 */
export async function markFeedItemProcessed(
  feedUserId: string,
  itemId: string
): Promise<void> {
  // Get feed repo
  const feedResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
     FROM network_feeds
     WHERE user_id = $1`,
    [feedUserId]
  )
  
  if (feedResult.rows.length === 0) {
    throw new Error(`No feed repo found for user ${feedUserId}`)
  }
  
  const feed = feedResult.rows[0]
  const token = decryptToken(feed.access_token_encrypted)
  const octokit = new Octokit({ auth: token })
  
  // Read inbox
  const inboxPath = 'inbox/items.jsonl'
  const inboxContent = await getFileContent(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    inboxPath,
    feed.branch
  )
  
  if (!inboxContent) {
    throw new Error('Inbox not found')
  }
  
  const lines = inboxContent.content.trim().split('\n').filter((l) => l.trim())
  const processedLines: string[] = []
  const remainingLines: string[] = []
  
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as FeedItem
      if (item.id === itemId) {
        processedLines.push(line)
      } else {
        remainingLines.push(line)
      }
    } catch {
      // Skip invalid lines
      remainingLines.push(line)
    }
  }
  
  if (processedLines.length === 0) {
    throw new Error(`Item ${itemId} not found in inbox`)
  }
  
  // Update inbox (remove processed items)
  await createOrUpdateFile(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    inboxPath,
    remainingLines.join('\n') + (remainingLines.length > 0 ? '\n' : ''),
    `chore(feed): remove processed item ${itemId}`,
    feed.branch,
    inboxContent.sha
  )
  
  // Append to processed (by month)
  const now = new Date()
  const month = now.toISOString().substring(0, 7) // YYYY-MM
  const processedPath = `processed/${month}.jsonl`
  
  const processedContent = await getFileContent(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    processedPath,
    feed.branch
  )
  
  const existingProcessed = processedContent?.content.trim() || ''
  const newProcessed = existingProcessed
    ? existingProcessed + '\n' + processedLines.join('\n')
    : processedLines.join('\n')
  
  await createOrUpdateFile(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    processedPath,
    newProcessed,
    `chore(feed): add processed item ${itemId}`,
    feed.branch,
    processedContent?.sha || null
  )
  
  // Update database
  await pool.query(
    `UPDATE feed_items
     SET status = 'processed'
     WHERE item_id = $1`,
    [itemId]
  )
}

/**
 * Save feed item (bookmark)
 */
export async function saveFeedItem(
  feedUserId: string,
  itemId: string
): Promise<void> {
  // Get feed repo
  const feedResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
     FROM network_feeds
     WHERE user_id = $1`,
    [feedUserId]
  )
  
  if (feedResult.rows.length === 0) {
    throw new Error(`No feed repo found for user ${feedUserId}`)
  }
  
  const feed = feedResult.rows[0]
  const token = decryptToken(feed.access_token_encrypted)
  const octokit = new Octokit({ auth: token })
  
  // Find item in inbox or processed
  // For simplicity, search in inbox first
  const inboxPath = 'inbox/items.jsonl'
  const inboxContent = await getFileContent(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    inboxPath,
    feed.branch
  )
  
  let item: FeedItem | null = null
  
  if (inboxContent) {
    const lines = inboxContent.content.trim().split('\n').filter((l) => l.trim())
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as FeedItem
        if (parsed.id === itemId) {
          item = parsed
          break
        }
      } catch {
        // Skip invalid lines
      }
    }
  }
  
  if (!item) {
    // Try processed files
    const now = new Date()
    const months = [
      now.toISOString().substring(0, 7),
      new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 7),
    ]
    
    for (const month of months) {
      const processedPath = `processed/${month}.jsonl`
      const processedContent = await getFileContent(
        octokit,
        feed.repo_owner,
        feed.repo_name,
        processedPath,
        feed.branch
      )
      
      if (processedContent) {
        const lines = processedContent.content.trim().split('\n').filter((l) => l.trim())
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as FeedItem
            if (parsed.id === itemId) {
              item = parsed
              break
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
      
      if (item) break
    }
  }
  
  if (!item) {
    throw new Error(`Item ${itemId} not found`)
  }
  
  // Append to saved/items.jsonl
  const savedPath = 'saved/items.jsonl'
  const savedContent = await getFileContent(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    savedPath,
    feed.branch
  )
  
  const existingSaved = savedContent?.content.trim() || ''
  const newSaved = existingSaved
    ? existingSaved + '\n' + JSON.stringify(item)
    : JSON.stringify(item)
  
  await createOrUpdateFile(
    octokit,
    feed.repo_owner,
    feed.repo_name,
    savedPath,
    newSaved,
    `chore(feed): save item ${itemId}`,
    feed.branch,
    savedContent?.sha || null
  )
  
  // Update database
  await pool.query(
    `UPDATE feed_items
     SET status = 'saved'
     WHERE item_id = $1`,
    [itemId]
  )
}

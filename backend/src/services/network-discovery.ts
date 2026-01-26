import { pool } from '../db/index.js'
import { extractGameSignature, extractThemes } from './content-analysis.js'

export interface SimilarUser {
  user_id: string
  similarity: number
  shared_themes: string[]
  shared_games: string[]
  trajectory_alignment: number
}

export interface WatchSuggestion {
  user_id: string
  repo_owner: string
  repo_name: string
  reason: string
  confidence: number
  shared_themes?: string[]
  mutual_watchers?: number
}

/**
 * Find users with similar trajectories
 */
export async function findSimilarUsers(
  userId: string,
  limit: number = 10
): Promise<SimilarUser[]> {
  // Get user's recent expressions and game signature
  const userExpressionsResult = await pool.query(
    `SELECT text, created_at
     FROM expressions
     WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '90 days'
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  )
  
  if (userExpressionsResult.rows.length === 0) {
    return []
  }
  
  const userTexts = userExpressionsResult.rows.map((r) => r.text)
  const userGameSignature = await extractGameSignature(userTexts)
  const userThemes = await extractThemes(userTexts.join(' '))
  
  // Find other users with expressions
  const otherUsersResult = await pool.query(
    `SELECT DISTINCT e.user_id
     FROM expressions e
     WHERE e.user_id != $1
     AND e.created_at >= NOW() - INTERVAL '90 days'
     LIMIT 100`,
    [userId]
  )
  
  const similarities: SimilarUser[] = []
  
  for (const row of otherUsersResult.rows) {
    const otherUserId = row.user_id
    
    // Get other user's expressions
    const otherExpressionsResult = await pool.query(
      `SELECT text
       FROM expressions
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '90 days'
       ORDER BY created_at DESC
       LIMIT 100`,
      [otherUserId]
    )
    
    if (otherExpressionsResult.rows.length === 0) continue
    
    const otherTexts = otherExpressionsResult.rows.map((r) => r.text)
    const otherGameSignature = await extractGameSignature(otherTexts)
    const otherThemes = await extractThemes(otherTexts.join(' '))
    
    // Compute game signature similarity (cosine similarity)
    let dotProduct = 0
    let userNorm = 0
    let otherNorm = 0
    
    Object.keys(userGameSignature).forEach((key) => {
      const k = key as keyof typeof userGameSignature
      dotProduct += userGameSignature[k] * otherGameSignature[k]
      userNorm += userGameSignature[k] * userGameSignature[k]
      otherNorm += otherGameSignature[k] * otherGameSignature[k]
    })
    
    const gameSimilarity = dotProduct / (Math.sqrt(userNorm) * Math.sqrt(otherNorm) || 1)
    
    // Theme overlap
    const sharedThemes = userThemes.filter((t) => otherThemes.includes(t))
    const themeSimilarity = sharedThemes.length / Math.max(userThemes.length, otherThemes.length, 1)
    
    // Combined similarity
    const similarity = gameSimilarity * 0.6 + themeSimilarity * 0.4
    
    if (similarity > 0.3) {
      // Get shared games (non-zero in both)
      const sharedGames = Object.keys(userGameSignature).filter(
        (k) => userGameSignature[k as keyof typeof userGameSignature] > 0.1 &&
               otherGameSignature[k as keyof typeof otherGameSignature] > 0.1
      )
      
      similarities.push({
        user_id: otherUserId,
        similarity,
        shared_themes: sharedThemes,
        shared_games: sharedGames,
        trajectory_alignment: gameSimilarity,
      })
    }
  }
  
  // Sort by similarity and return top N
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

/**
 * Get watch suggestions for a user
 */
export async function getWatchSuggestions(
  userId: string,
  limit: number = 10
): Promise<WatchSuggestion[]> {
  const suggestions: WatchSuggestion[] = []
  
  // 1. Similar users
  const similarUsers = await findSimilarUsers(userId, limit)
  
  for (const similar of similarUsers) {
    // Get their content repo
    const repoResult = await pool.query(
      `SELECT repo_owner, repo_name
       FROM user_github_repos
       WHERE user_id = $1
       LIMIT 1`,
      [similar.user_id]
    )
    
    if (repoResult.rows.length > 0) {
      const repo = repoResult.rows[0]
      
      // Check if already watching
      const watchCheck = await pool.query(
        `SELECT watch_id
         FROM network_watches
         WHERE watcher_user_id = $1
         AND watched_user_id = $2`,
        [userId, similar.user_id]
      )
      
      if (watchCheck.rows.length === 0) {
        suggestions.push({
          user_id: similar.user_id,
          repo_owner: repo.repo_owner,
          repo_name: repo.repo_name,
          reason: `Similar trajectory (${(similar.similarity * 100).toFixed(0)}% similarity)`,
          confidence: similar.similarity,
          shared_themes: similar.shared_themes,
        })
      }
    }
  }
  
  // 2. Network path discovery (users watched by people you watch)
  const myWatchesResult = await pool.query(
    `SELECT watched_user_id
     FROM network_watches
     WHERE watcher_user_id = $1
     AND is_active = true`,
    [userId]
  )
  
  if (myWatchesResult.rows.length > 0) {
    const watchedUserIds = myWatchesResult.rows.map((r) => r.watched_user_id)
    
    // Find users they watch
    const theirWatchesResult = await pool.query(
      `SELECT DISTINCT w.watched_user_id, COUNT(*) as mutual_count
       FROM network_watches w
       WHERE w.watcher_user_id = ANY($1::uuid[])
       AND w.watched_user_id != $2
       AND w.is_active = true
       GROUP BY w.watched_user_id
       ORDER BY mutual_count DESC
       LIMIT 10`,
      [watchedUserIds, userId]
    )
    
    for (const row of theirWatchesResult.rows) {
      // Check if already watching
      const watchCheck = await pool.query(
        `SELECT watch_id
         FROM network_watches
         WHERE watcher_user_id = $1
         AND watched_user_id = $2`,
        [userId, row.watched_user_id]
      )
      
      if (watchCheck.rows.length === 0) {
        const repoResult = await pool.query(
          `SELECT repo_owner, repo_name
           FROM user_github_repos
           WHERE user_id = $1
           LIMIT 1`,
          [row.watched_user_id]
        )
        
        if (repoResult.rows.length > 0) {
          const repo = repoResult.rows[0]
          suggestions.push({
            user_id: row.watched_user_id,
            repo_owner: repo.repo_owner,
            repo_name: repo.repo_name,
            reason: `Watched by ${row.mutual_count} people you follow`,
            confidence: Math.min(row.mutual_count / 5, 0.9),
            mutual_watchers: parseInt(row.mutual_count, 10),
          })
        }
      }
    }
  }
  
  // Deduplicate and sort by confidence
  const unique = new Map<string, WatchSuggestion>()
  for (const suggestion of suggestions) {
    const key = suggestion.user_id
    if (!unique.has(key) || unique.get(key)!.confidence < suggestion.confidence) {
      unique.set(key, suggestion)
    }
  }
  
  return Array.from(unique.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}

/**
 * Get emerging topics in the network
 */
export async function getEmergingTopics(
  days: number = 7,
  limit: number = 10
): Promise<Array<{
  topic: string
  growth_rate: number
  user_count: number
  first_seen: Date
}>> {
  // Get themes from recent expressions across all users
  const expressionsResult = await pool.query(
    `SELECT e.user_id, e.text, e.created_at
     FROM expressions e
     WHERE e.created_at >= NOW() - INTERVAL '${days} days'
     ORDER BY e.created_at DESC
     LIMIT 1000`,
    []
  )
  
  // Group by time windows
  const now = new Date()
  const recentWindow = new Date(now.getTime() - (days / 2) * 24 * 60 * 60 * 1000)
  
  const recentThemes = new Map<string, Set<string>>()
  const olderThemes = new Map<string, Set<string>>()
  
  for (const row of expressionsResult.rows) {
    const createdAt = new Date(row.created_at)
    const themes = await extractThemes(row.text)
    
    for (const theme of themes) {
      if (createdAt >= recentWindow) {
        if (!recentThemes.has(theme)) {
          recentThemes.set(theme, new Set())
        }
        recentThemes.get(theme)!.add(row.user_id)
      } else {
        if (!olderThemes.has(theme)) {
          olderThemes.set(theme, new Set())
        }
        olderThemes.get(theme)!.add(row.user_id)
      }
    }
  }
  
  // Calculate growth rates
  const emerging: Array<{
    topic: string
    growth_rate: number
    user_count: number
    first_seen: Date
  }> = []
  
  for (const [theme, recentUsers] of recentThemes.entries()) {
    const olderUserCount = olderThemes.get(theme)?.size || 0
    const recentUserCount = recentUsers.size
    
    if (recentUserCount > olderUserCount && recentUserCount >= 2) {
      const growthRate = olderUserCount > 0
        ? (recentUserCount - olderUserCount) / olderUserCount
        : recentUserCount
      
      emerging.push({
        topic: theme,
        growth_rate: growthRate,
        user_count: recentUserCount,
        first_seen: now, // Simplified - would track actual first appearance
      })
    }
  }
  
  return emerging
    .sort((a, b) => b.growth_rate - a.growth_rate)
    .slice(0, limit)
}

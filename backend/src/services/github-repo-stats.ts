import { pool } from '../db/index.js'
import { createOctokit, decryptToken, getFileContent, listDirectory } from './github.js'

export interface GameSignature {
  G1: number
  G2: number
  G3: number
  G4: number
  G5: number
  G6: number
}

export interface GameStats {
  primary_game: string | null
  primary_percentage: number
  classified_count: number
  total_count: number
  signature: GameSignature
}

export interface SourceStats {
  file_count: number
  event_count: number
  recent: any[]
  files: string[]  // List of file names in this source
}

export interface ArtifactStats {
  file_count: number
  item_count: number
  recent: any[]
  files: string[]  // List of file names in this artifact type
  game_stats: GameStats  // Aggregated game classification stats
}

export interface RepoStats {
  connected: boolean
  repo: { owner: string; name: string; branch: string } | null
  schema_version: string | null
  last_sync: string | null
  sources: Record<string, SourceStats>
  artifacts: Record<string, ArtifactStats>
  reports: string[]
  preferences: string[]
  total_events: number
  total_artifacts: number
}

/**
 * Check if a game signature has been classified (not all zeros)
 */
function isClassified(sig: GameSignature | undefined): boolean {
  if (!sig) return false
  return Object.values(sig).some((v) => v > 0)
}

/**
 * Get primary game from a game signature
 */
function getPrimaryGame(sig: GameSignature): { game: string; percentage: number } {
  const entries = Object.entries(sig) as [string, number][]
  const sorted = entries.sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, val]) => sum + val, 0)
  
  if (sorted[0][1] === 0 || total === 0) {
    return { game: '', percentage: 0 }
  }
  
  return {
    game: sorted[0][0],
    percentage: Math.round((sorted[0][1] / total) * 100),
  }
}

/**
 * Aggregate game signatures across multiple items
 */
function aggregateGameSignatures(items: any[]): GameStats {
  const aggregateSig: GameSignature = { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
  let classifiedCount = 0
  
  for (const item of items) {
    const sig = item.analysis?.game_signature as GameSignature | undefined
    if (sig && isClassified(sig)) {
      classifiedCount++
      for (const key of Object.keys(aggregateSig) as (keyof GameSignature)[]) {
        aggregateSig[key] += sig[key] || 0
      }
    }
  }
  
  // Normalize the aggregate signature
  const total = Object.values(aggregateSig).reduce((sum, val) => sum + val, 0)
  if (total > 0) {
    for (const key of Object.keys(aggregateSig) as (keyof GameSignature)[]) {
      aggregateSig[key] = aggregateSig[key] / total
    }
  }
  
  const primary = getPrimaryGame(aggregateSig)
  
  return {
    primary_game: primary.game || null,
    primary_percentage: primary.percentage,
    classified_count: classifiedCount,
    total_count: items.length,
    signature: aggregateSig,
  }
}

/**
 * Parse a JSONL file and return stats including game classification data
 */
function parseJsonlFile(content: string, maxRecent: number = 5): { count: number; recent: any[]; allItems: any[] } {
  if (!content.trim()) {
    return { count: 0, recent: [], allItems: [] }
  }
  
  const lines = content.trim().split('\n').filter((line) => line.trim())
  const allItems: any[] = []
  
  // Parse all items for game stats aggregation
  for (const line of lines) {
    try {
      allItems.push(JSON.parse(line))
    } catch {
      // Skip invalid JSON lines
    }
  }
  
  // Get the last N items as recent entries (reversed for newest first)
  const recent = allItems.slice(-maxRecent).reverse()
  
  return { count: lines.length, recent, allItems }
}

/**
 * Get stats for a user's connected GitHub repo
 */
export async function getRepoStats(userId: string): Promise<RepoStats> {
  // Default response for no connected repo
  const emptyStats: RepoStats = {
    connected: false,
    repo: null,
    schema_version: null,
    last_sync: null,
    sources: {},
    artifacts: {},
    reports: [],
    preferences: [],
    total_events: 0,
    total_artifacts: 0,
  }
  
  // Get user's connected repo
  const repoResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
     FROM user_github_repos
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  )
  
  if (repoResult.rows.length === 0) {
    return emptyStats
  }
  
  const { repo_owner, repo_name, branch, access_token_encrypted } = repoResult.rows[0]
  
  // Decrypt token and create Octokit instance
  let octokit
  try {
    const accessToken = decryptToken(access_token_encrypted)
    octokit = createOctokit(accessToken)
  } catch (e) {
    console.error('Failed to decrypt GitHub token:', e)
    return emptyStats
  }
  
  const stats: RepoStats = {
    connected: true,
    repo: { owner: repo_owner, name: repo_name, branch },
    schema_version: null,
    last_sync: null,
    sources: {},
    artifacts: {},
    reports: [],
    preferences: [],
    total_events: 0,
    total_artifacts: 0,
  }
  
  try {
    // Read meta.json for schema version and last sync
    const metaContent = await getFileContent(octokit, repo_owner, repo_name, 'meta.json', branch)
    if (metaContent) {
      try {
        const meta = JSON.parse(metaContent.content)
        stats.schema_version = meta.schema_version || null
        stats.last_sync = meta.last_sync_utc || null
      } catch {
        // Invalid meta.json
      }
    }
    
    // Get sources stats
    const sourcesDir = await listDirectory(octokit, repo_owner, repo_name, 'sources', branch)
    if (sourcesDir) {
      for (const sourceFolder of sourcesDir) {
        if (sourceFolder.type === 'dir') {
          const sourceType = sourceFolder.name // e.g., 'podcasts', 'twitter', 'youtube'
          const sourceFiles = await listDirectory(octokit, repo_owner, repo_name, sourceFolder.path, branch)
          
          if (sourceFiles) {
            let totalEvents = 0
            let allRecent: any[] = []
            let fileCount = 0
            const fileNames: string[] = []
            
            for (const file of sourceFiles) {
              if (file.type === 'file' && file.name.endsWith('.jsonl')) {
                fileCount++
                fileNames.push(file.name)
                const fileContent = await getFileContent(octokit, repo_owner, repo_name, file.path, branch)
                if (fileContent) {
                  const { count, recent } = parseJsonlFile(fileContent.content)
                  totalEvents += count
                  allRecent = [...allRecent, ...recent]
                }
              }
            }
            
            // Sort recent by timestamp and take top 5
            allRecent.sort((a, b) => {
              const aTime = new Date(a.timestamp || 0).getTime()
              const bTime = new Date(b.timestamp || 0).getTime()
              return bTime - aTime
            })
            
            stats.sources[sourceType] = {
              file_count: fileCount,
              event_count: totalEvents,
              recent: allRecent.slice(0, 5),
              files: fileNames,
            }
            stats.total_events += totalEvents
          }
        }
      }
    }
    
    // Get artifacts stats
    const artifactsDir = await listDirectory(octokit, repo_owner, repo_name, 'artifacts', branch)
    if (artifactsDir) {
      for (const artifactFolder of artifactsDir) {
        if (artifactFolder.type === 'dir') {
          const artifactType = artifactFolder.name // e.g., 'twitter', 'blog', 'youtube'
          const artifactFiles = await listDirectory(octokit, repo_owner, repo_name, artifactFolder.path, branch)
          
          if (artifactFiles) {
            let totalItems = 0
            let allRecent: any[] = []
            let allItemsForGameStats: any[] = []
            let fileCount = 0
            const fileNames: string[] = []
            
            for (const file of artifactFiles) {
              if (file.type === 'file' && file.name.endsWith('.jsonl')) {
                fileCount++
                fileNames.push(file.name)
                const fileContent = await getFileContent(octokit, repo_owner, repo_name, file.path, branch)
                if (fileContent) {
                  const { count, recent, allItems } = parseJsonlFile(fileContent.content)
                  totalItems += count
                  allRecent = [...allRecent, ...recent]
                  allItemsForGameStats = [...allItemsForGameStats, ...allItems]
                }
              }
            }
            
            // Sort recent by timestamp and take top 5
            allRecent.sort((a, b) => {
              const aTime = new Date(a.timestamp || 0).getTime()
              const bTime = new Date(b.timestamp || 0).getTime()
              return bTime - aTime
            })
            
            // Compute aggregate game stats from all items
            const gameStats = aggregateGameSignatures(allItemsForGameStats)
            
            stats.artifacts[artifactType] = {
              file_count: fileCount,
              item_count: totalItems,
              recent: allRecent.slice(0, 5),
              files: fileNames,
              game_stats: gameStats,
            }
            stats.total_artifacts += totalItems
          }
        }
      }
    }
    
    // Get reports list
    const reportsDir = await listDirectory(octokit, repo_owner, repo_name, 'reports', branch)
    if (reportsDir) {
      stats.reports = reportsDir
        .filter((f) => f.type === 'file' && !f.name.startsWith('.'))
        .map((f) => f.name)
    }
    
    // Get preferences list
    const preferencesDir = await listDirectory(octokit, repo_owner, repo_name, 'preferences', branch)
    if (preferencesDir) {
      stats.preferences = preferencesDir
        .filter((f) => f.type === 'file' && !f.name.startsWith('.'))
        .map((f) => f.name)
    }
  } catch (e: any) {
    console.error('Error reading repo contents:', e)
    // Return partial stats even if some reads fail
  }
  
  return stats
}

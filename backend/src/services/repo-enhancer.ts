import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import {
  createOctokit,
  decryptToken,
  getFileContent,
  createOrUpdateFile,
} from './github.js'
import { classifyGamesBatchTool } from '../mastra/tools/game-classifier-tool.js'
import { extractThemes, calculateComplexityScore } from './content-analysis.js'

// Configuration
const BATCH_SIZE = parseInt(process.env.REPO_ENHANCEMENT_BATCH_SIZE || '50', 10)
const MAX_ITEMS_PER_RUN = 200 // Limit total items processed per repo per run

// Artifact paths to enhance
const ARTIFACT_PATHS = [
  'artifacts/twitter/tweets.jsonl',
  'artifacts/blog/posts.jsonl',
  'artifacts/youtube/videos.jsonl',
  'artifacts/podcast/episodes.jsonl',
] as const

// Game signature type
export interface GameSignature {
  G1: number
  G2: number
  G3: number
  G4: number
  G5: number
  G6: number
}

// Generic artifact structure (common fields across all artifact types)
export interface ArtifactAnalysis {
  game_signature: GameSignature
  themes: string[]
  sentiment: string
  complexity_score: number
}

export interface ArtifactItem {
  id: string
  timestamp: string
  user_id: string
  version: string
  analysis?: ArtifactAnalysis
  // Type-specific fields
  tweet?: {
    id: string
    text: string
    url?: string
    created_at: string
    type: string
    thread_id?: string
  }
  post?: {
    id: string
    title: string
    content: string
    url?: string
    published_at: string
  }
  video?: {
    id: string
    title: string
    description: string
    url?: string
    published_at: string
  }
  episode?: {
    id: string
    title: string
    description: string
    url?: string
    published_at: string
  }
  [key: string]: unknown
}

export interface EnhancementResult {
  success: boolean
  artifactsEnhanced: number
  errors: string[]
  skipped: number
}

/**
 * Check if an artifact needs classification (game_signature is all zeros or missing)
 */
function needsClassification(item: ArtifactItem): boolean {
  const sig = item.analysis?.game_signature
  if (!sig) return true
  return Object.values(sig).every((v) => v === 0)
}

/**
 * Extract text content from an artifact for classification
 */
function extractTextForClassification(item: ArtifactItem): string {
  // Try different content fields based on artifact type
  if (item.tweet?.text) {
    return item.tweet.text
  }
  if (item.post?.content) {
    return `${item.post.title || ''} ${item.post.content}`.trim()
  }
  if (item.video?.description) {
    return `${item.video.title || ''} ${item.video.description}`.trim()
  }
  if (item.episode?.description) {
    return `${item.episode.title || ''} ${item.episode.description}`.trim()
  }
  // Fallback: try to find any text-like field
  for (const key of ['text', 'content', 'description', 'body', 'title']) {
    if (typeof item[key] === 'string' && item[key]) {
      return item[key] as string
    }
  }
  return ''
}

/**
 * Parse JSONL content into array of artifacts
 */
function parseJsonl(content: string): ArtifactItem[] {
  if (!content || !content.trim()) return []
  
  const items: ArtifactItem[] = []
  const lines = content.split('\n').filter((line) => line.trim())
  
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as ArtifactItem
      items.push(item)
    } catch (e) {
      // Skip malformed lines
      console.warn('Failed to parse JSONL line:', line.substring(0, 100))
    }
  }
  
  return items
}

/**
 * Serialize artifacts back to JSONL format
 */
function serializeToJsonl(items: ArtifactItem[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n')
}

/**
 * Read artifacts from a specific file and find those needing enhancement
 */
async function readArtifactsFromPath(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<{ items: ArtifactItem[]; sha: string | null }> {
  const fileContent = await getFileContent(octokit, owner, repo, path, branch)
  
  if (!fileContent) {
    return { items: [], sha: null }
  }
  
  const items = parseJsonl(fileContent.content)
  return { items, sha: fileContent.sha }
}

/**
 * Classify a batch of artifacts using the game classifier service
 */
async function classifyArtifactBatch(
  artifacts: Array<{ item: ArtifactItem; text: string; index: number }>
): Promise<Map<number, { gameSignature: GameSignature; themes: string[]; complexityScore: number }>> {
  const results = new Map<number, { gameSignature: GameSignature; themes: string[]; complexityScore: number }>()
  
  if (artifacts.length === 0) return results
  
  const texts = artifacts.map((a) => a.text)
  
  try {
    // Call the batch classification tool
    const classifyResult = await (classifyGamesBatchTool as any).execute({ texts })
    
    if (!classifyResult?.success || !classifyResult?.predictions) {
      console.error('Classification failed:', classifyResult?.error || 'Unknown error')
      return results
    }
    
    // Process each prediction
    for (let i = 0; i < artifacts.length; i++) {
      const prediction = classifyResult.predictions[i]
      const artifact = artifacts[i]
      
      if (!prediction) continue
      
      // Build game signature from prediction
      const gameSignature: GameSignature = {
        G1: 0,
        G2: 0,
        G3: 0,
        G4: 0,
        G5: 0,
        G6: 0,
      }
      
      // Set primary game confidence
      const primaryGame = prediction.primary_game as keyof GameSignature
      if (primaryGame && gameSignature.hasOwnProperty(primaryGame)) {
        gameSignature[primaryGame] = prediction.confidence || 0.8
      }
      
      // Set secondary game with lower confidence
      const secondaryGame = prediction.secondary_game as keyof GameSignature
      if (secondaryGame && gameSignature.hasOwnProperty(secondaryGame) && secondaryGame !== primaryGame) {
        gameSignature[secondaryGame] = (prediction.confidence || 0.8) * 0.3
      }
      
      // Extract themes
      const themes = await extractThemes(artifact.text)
      
      // Calculate complexity score
      const complexityScore = calculateComplexityScore({
        text: artifact.text,
        themes,
        game_signature: gameSignature,
      })
      
      results.set(artifact.index, {
        gameSignature,
        themes,
        complexityScore,
      })
    }
  } catch (error) {
    console.error('Error in batch classification:', error)
  }
  
  return results
}

/**
 * Enhance artifacts in a specific file
 */
async function enhanceArtifactFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<{ enhanced: number; skipped: number; error?: string }> {
  try {
    // Read existing artifacts
    const { items, sha } = await readArtifactsFromPath(octokit, owner, repo, branch, path)
    
    if (items.length === 0) {
      return { enhanced: 0, skipped: 0 }
    }
    
    // Find artifacts that need classification
    const toClassify: Array<{ item: ArtifactItem; text: string; index: number }> = []
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (needsClassification(item)) {
        const text = extractTextForClassification(item)
        if (text && text.length >= 10) {
          // Only classify if there's meaningful text
          toClassify.push({ item, text, index: i })
        }
      }
      
      // Limit items per run
      if (toClassify.length >= MAX_ITEMS_PER_RUN) break
    }
    
    if (toClassify.length === 0) {
      return { enhanced: 0, skipped: items.length }
    }
    
    console.log(`  Found ${toClassify.length} artifacts to classify in ${path}`)
    
    // Process in batches
    let totalEnhanced = 0
    const updatedItems = [...items]
    
    for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
      const batch = toClassify.slice(i, i + BATCH_SIZE)
      console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toClassify.length / BATCH_SIZE)}`)
      
      const classifications = await classifyArtifactBatch(batch)
      
      // Apply classifications to items
      for (const [index, classification] of classifications) {
        const item = updatedItems[index]
        if (!item.analysis) {
          item.analysis = {
            game_signature: { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 },
            themes: [],
            sentiment: 'neutral',
            complexity_score: 0,
          }
        }
        
        item.analysis.game_signature = classification.gameSignature
        item.analysis.themes = classification.themes
        item.analysis.complexity_score = classification.complexityScore
        totalEnhanced++
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < toClassify.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    
    // Write back only if we enhanced something
    if (totalEnhanced > 0) {
      const newContent = serializeToJsonl(updatedItems)
      await createOrUpdateFile(
        octokit,
        owner,
        repo,
        path,
        newContent,
        `chore(enhance): classify ${totalEnhanced} artifacts with game signatures`,
        branch,
        sha
      )
      console.log(`  ✅ Enhanced ${totalEnhanced} artifacts in ${path}`)
    }
    
    return {
      enhanced: totalEnhanced,
      skipped: items.length - toClassify.length,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`  ❌ Error enhancing ${path}:`, errorMsg)
    return { enhanced: 0, skipped: 0, error: errorMsg }
  }
}

/**
 * Enhance all artifacts in a user's GitHub repository
 */
export async function enhanceUserRepo(userId: string): Promise<EnhancementResult> {
  const result: EnhancementResult = {
    success: false,
    artifactsEnhanced: 0,
    errors: [],
    skipped: 0,
  }
  
  try {
    // Get user's GitHub repo
    const repoResult = await pool.query(
      `SELECT id, repo_owner, repo_name, branch, access_token_encrypted, last_enhancement_at
       FROM user_github_repos
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    )
    
    if (repoResult.rows.length === 0) {
      result.errors.push('No GitHub repository connected')
      return result
    }
    
    const repo = repoResult.rows[0]
    const { repo_owner, repo_name, branch, access_token_encrypted } = repo
    
    // Decrypt token and create Octokit
    let token: string
    try {
      token = decryptToken(access_token_encrypted)
    } catch (e) {
      result.errors.push('Failed to decrypt GitHub token')
      return result
    }
    
    const octokit = createOctokit(token)
    
    console.log(`🔄 Enhancing repo: ${repo_owner}/${repo_name}`)
    
    // Process each artifact file
    for (const path of ARTIFACT_PATHS) {
      const fileResult = await enhanceArtifactFile(octokit, repo_owner, repo_name, branch, path)
      result.artifactsEnhanced += fileResult.enhanced
      result.skipped += fileResult.skipped
      if (fileResult.error) {
        result.errors.push(`${path}: ${fileResult.error}`)
      }
    }
    
    // Update last_enhancement_at timestamp
    const now = new Date()
    await pool.query(
      `UPDATE user_github_repos 
       SET last_enhancement_at = $1, 
           enhancement_status = $2,
           last_error = NULL
       WHERE id = $3`,
      [now, result.artifactsEnhanced > 0 ? 'completed' : 'no_changes', repo.id]
    )
    
    result.success = result.errors.length === 0
    console.log(`✅ Enhanced ${result.artifactsEnhanced} artifacts for user ${userId}`)
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    result.errors.push(errorMsg)
    console.error(`❌ Error enhancing repo for user ${userId}:`, errorMsg)
  }
  
  return result
}

/**
 * Enhance all user repositories that need enhancement
 */
export async function enhanceAllUserRepos(): Promise<{
  totalRepos: number
  totalEnhanced: number
  errors: number
}> {
  const stats = {
    totalRepos: 0,
    totalEnhanced: 0,
    errors: 0,
  }
  
  try {
    // Get all repos, prioritizing those that haven't been enhanced recently
    const reposResult = await pool.query(
      `SELECT user_id, MIN(last_enhancement_at) as oldest_enhancement
       FROM user_github_repos 
       WHERE (last_enhancement_at IS NULL OR last_enhancement_at < NOW() - INTERVAL '1 hour')
       GROUP BY user_id
       ORDER BY oldest_enhancement NULLS FIRST
       LIMIT 10`
    )
    
    console.log(`📋 Found ${reposResult.rows.length} repos to enhance`)
    
    for (const row of reposResult.rows) {
      stats.totalRepos++
      
      try {
        const result = await enhanceUserRepo(row.user_id)
        stats.totalEnhanced += result.artifactsEnhanced
        
        if (!result.success) {
          stats.errors++
        }
      } catch (error) {
        console.error(`Error enhancing repo for user ${row.user_id}:`, error)
        stats.errors++
      }
      
      // Small delay between repos to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    
  } catch (error) {
    console.error('Error in enhanceAllUserRepos:', error)
  }
  
  console.log(`📊 Enhancement complete: ${stats.totalRepos} repos, ${stats.totalEnhanced} artifacts enhanced, ${stats.errors} errors`)
  
  return stats
}

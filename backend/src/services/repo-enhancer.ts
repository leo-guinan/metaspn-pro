import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import {
  createOctokit,
  decryptToken,
  getFileContent,
  appendToEnhancementFile,
  readEnhancementFile,
} from './github.js'
import { classifyGamesBatchTool } from '../mastra/tools/game-classifier-tool.js'
import { extractThemes, calculateComplexityScore } from './content-analysis.js'
import type { GameSignature, GameSignatureEnhancement } from '../types/enhancements.js'

// Configuration
const BATCH_SIZE = parseInt(process.env.REPO_ENHANCEMENT_BATCH_SIZE || '50', 10)
const MAX_ITEMS_PER_RUN = 200 // Limit total items processed per repo per run

// Artifact type mapping for file paths
const ARTIFACT_CONFIG = [
  { type: 'twitter' as const, file: 'tweets.jsonl' },
  { type: 'blog' as const, file: 'posts.jsonl' },
  { type: 'youtube' as const, file: 'videos.jsonl' },
  { type: 'podcast' as const, file: 'episodes.jsonl' },
] as const

// Re-export GameSignature for backward compatibility
export type { GameSignature }

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
  analysis?: ArtifactAnalysis // Optional - may exist from legacy inline enhancements
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
 * Get the unique ID for an artifact item (used for enhancement lookup)
 */
function getItemId(item: ArtifactItem): string {
  // Try type-specific IDs first
  if (item.tweet?.id) return item.tweet.id
  if (item.post?.id) return item.post.id
  if (item.video?.id) return item.video.id
  if (item.episode?.id) return item.episode.id
  // Fallback to top-level id
  return item.id
}

/**
 * Check if an artifact needs classification by checking the enhancement file
 */
function needsClassification(
  item: ArtifactItem,
  existingEnhancements: Map<string, any>
): boolean {
  const itemId = getItemId(item)
  
  // Check if enhancement already exists in the separate file
  if (existingEnhancements.has(itemId)) {
    const enhancement = existingEnhancements.get(itemId)
    // Check if the enhancement has a valid game signature
    const sig = enhancement?.game_signature as GameSignature | undefined
    if (sig && Object.values(sig).some((v) => v > 0)) {
      return false // Already classified
    }
  }
  
  // Also check for legacy inline analysis (backward compatibility)
  const inlineAnalysis = item.analysis?.game_signature
  if (inlineAnalysis && Object.values(inlineAnalysis).some((v) => v > 0)) {
    return false // Already classified inline
  }
  
  return true
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
 * Read artifacts from a specific file
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
): Promise<Map<number, { gameSignature: GameSignature; primaryGame: string; confidence: number; themes: string[]; complexityScore: number }>> {
  const results = new Map<number, { gameSignature: GameSignature; primaryGame: string; confidence: number; themes: string[]; complexityScore: number }>()
  
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
      const confidence = prediction.confidence || 0.8
      if (primaryGame && gameSignature.hasOwnProperty(primaryGame)) {
        gameSignature[primaryGame] = confidence
      }
      
      // Set secondary game with lower confidence
      const secondaryGame = prediction.secondary_game as keyof GameSignature
      if (secondaryGame && gameSignature.hasOwnProperty(secondaryGame) && secondaryGame !== primaryGame) {
        gameSignature[secondaryGame] = confidence * 0.3
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
        primaryGame: primaryGame || '',
        confidence,
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
 * Enhance artifacts in a specific artifact type using progressive enhancement files
 */
async function enhanceArtifactFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  artifactType: 'twitter' | 'blog' | 'youtube' | 'podcast',
  artifactFile: string
): Promise<{ enhanced: number; skipped: number; error?: string }> {
  const artifactPath = `artifacts/${artifactType}/${artifactFile}`
  
  try {
    // Read existing artifacts (raw data)
    const { items } = await readArtifactsFromPath(octokit, owner, repo, branch, artifactPath)
    
    if (items.length === 0) {
      console.log(`  No items found in ${artifactPath}`)
      return { enhanced: 0, skipped: 0 }
    }
    
    console.log(`  Found ${items.length} items in ${artifactPath}`)
    
    // Read existing enhancements from separate file
    const existingEnhancements = await readEnhancementFile(
      octokit,
      owner,
      repo,
      branch,
      artifactType,
      'game_signatures'
    )
    
    console.log(`  Found ${existingEnhancements.size} existing game_signature enhancements`)
    
    // Find artifacts that need classification
    const toClassify: Array<{ item: ArtifactItem; text: string; index: number }> = []
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (needsClassification(item, existingEnhancements)) {
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
      console.log(`  All ${items.length} items already have enhancements`)
      return { enhanced: 0, skipped: items.length }
    }
    
    console.log(`  Found ${toClassify.length} artifacts to classify in ${artifactPath}`)
    
    // Process in batches and collect all enhancement records
    const newEnhancements: GameSignatureEnhancement[] = []
    const computedAt = new Date().toISOString()
    
    for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
      const batch = toClassify.slice(i, i + BATCH_SIZE)
      console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toClassify.length / BATCH_SIZE)}`)
      
      const classifications = await classifyArtifactBatch(batch)
      
      // Create enhancement records
      for (const [index, classification] of classifications) {
        const item = items[index]
        const itemId = getItemId(item)
        
        const enhancement: GameSignatureEnhancement = {
          item_id: itemId,
          timestamp: item.timestamp,
          computed_at: computedAt,
          game_signature: classification.gameSignature,
          primary_game: classification.primaryGame,
          confidence: classification.confidence,
        }
        
        newEnhancements.push(enhancement)
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < toClassify.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    
    // Write enhancements to separate file (append-only)
    if (newEnhancements.length > 0) {
      const enhancementRecords = newEnhancements.map((e) => JSON.stringify(e))
      
      await appendToEnhancementFile(
        octokit,
        owner,
        repo,
        branch,
        artifactType,
        'game_signatures',
        enhancementRecords
      )
      
      console.log(`  ✅ Appended ${newEnhancements.length} game_signature enhancements for ${artifactType}`)
    }
    
    return {
      enhanced: newEnhancements.length,
      skipped: items.length - toClassify.length,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`  ❌ Error enhancing ${artifactPath}:`, errorMsg)
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
    
    // Process each artifact type
    for (const { type, file } of ARTIFACT_CONFIG) {
      const fileResult = await enhanceArtifactFile(
        octokit,
        repo_owner,
        repo_name,
        branch,
        type,
        file
      )
      result.artifactsEnhanced += fileResult.enhanced
      result.skipped += fileResult.skipped
      if (fileResult.error) {
        result.errors.push(`${type}/${file}: ${fileResult.error}`)
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

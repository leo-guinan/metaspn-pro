/**
 * Migration Script: Extract Inline Enhancements to Separate Files
 * 
 * This script reads existing artifact files that have inline `analysis` fields
 * and extracts them to separate enhancement files (progressive enhancement architecture).
 * 
 * Usage:
 *   npx tsx scripts/extract-enhancements.ts [--dry-run] [--user-id=<id>]
 * 
 * Options:
 *   --dry-run     Show what would be extracted without making changes
 *   --user-id     Process only a specific user's repository
 * 
 * This migration:
 * 1. Reads artifacts from artifacts/{type}/{name}.jsonl
 * 2. Extracts any items with `analysis.game_signature` fields
 * 3. Writes them to artifacts/{type}/game_signatures.jsonl
 * 4. Does NOT modify the original artifact files (they keep the inline data for backward compat)
 */

import { pool } from '../src/db/index.js'
import {
  createOctokit,
  decryptToken,
  getFileContent,
  appendToEnhancementFile,
  readEnhancementFile,
} from '../src/services/github.js'
import type { GameSignatureEnhancement, GameSignature } from '../src/types/enhancements.js'

// Artifact configuration
const ARTIFACT_CONFIG = [
  { type: 'twitter' as const, file: 'tweets.jsonl' },
  { type: 'blog' as const, file: 'posts.jsonl' },
  { type: 'youtube' as const, file: 'videos.jsonl' },
  { type: 'podcast' as const, file: 'episodes.jsonl' },
] as const

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const userIdArg = args.find((arg) => arg.startsWith('--user-id='))
const targetUserId = userIdArg ? userIdArg.split('=')[1] : null

interface MigrationStats {
  usersProcessed: number
  itemsExtracted: number
  errors: string[]
}

/**
 * Get the unique ID for an artifact item
 */
function getItemId(item: any): string {
  if (item.tweet?.id) return item.tweet.id
  if (item.post?.id) return item.post.id
  if (item.video?.id) return item.video.id
  if (item.episode?.id) return item.episode.id
  return item.id
}

/**
 * Check if an item has a valid inline game signature
 */
function hasInlineGameSignature(item: any): boolean {
  const sig = item.analysis?.game_signature
  if (!sig) return false
  return Object.values(sig).some((v: any) => typeof v === 'number' && v > 0)
}

/**
 * Get primary game from a game signature
 */
function getPrimaryGame(sig: GameSignature): { game: string; confidence: number } {
  const entries = Object.entries(sig) as [string, number][]
  const sorted = entries.sort((a, b) => b[1] - a[1])
  
  if (sorted[0][1] === 0) {
    return { game: '', confidence: 0 }
  }
  
  return {
    game: sorted[0][0],
    confidence: sorted[0][1],
  }
}

/**
 * Parse JSONL content into array of items
 */
function parseJsonl(content: string): any[] {
  if (!content || !content.trim()) return []
  
  const items: any[] = []
  const lines = content.split('\n').filter((line) => line.trim())
  
  for (const line of lines) {
    try {
      items.push(JSON.parse(line))
    } catch {
      // Skip malformed lines
    }
  }
  
  return items
}

/**
 * Extract enhancements from a single artifact file
 */
async function extractFromArtifactFile(
  octokit: any,
  owner: string,
  repo: string,
  branch: string,
  artifactType: 'twitter' | 'blog' | 'youtube' | 'podcast',
  artifactFile: string
): Promise<{ extracted: number; alreadyMigrated: number }> {
  const artifactPath = `artifacts/${artifactType}/${artifactFile}`
  
  // Read the artifact file
  const fileContent = await getFileContent(octokit, owner, repo, artifactPath, branch)
  if (!fileContent) {
    console.log(`  No file found: ${artifactPath}`)
    return { extracted: 0, alreadyMigrated: 0 }
  }
  
  const items = parseJsonl(fileContent.content)
  if (items.length === 0) {
    console.log(`  Empty file: ${artifactPath}`)
    return { extracted: 0, alreadyMigrated: 0 }
  }
  
  // Read existing enhancements to avoid duplicates
  let existingEnhancements = new Map<string, any>()
  try {
    existingEnhancements = await readEnhancementFile(
      octokit,
      owner,
      repo,
      branch,
      artifactType,
      'game_signatures'
    )
  } catch {
    // Enhancement file may not exist yet
  }
  
  // Find items with inline enhancements that haven't been migrated
  const toExtract: GameSignatureEnhancement[] = []
  let alreadyMigrated = 0
  const computedAt = new Date().toISOString()
  
  for (const item of items) {
    if (hasInlineGameSignature(item)) {
      const itemId = getItemId(item)
      
      // Skip if already in enhancement file
      if (existingEnhancements.has(itemId)) {
        alreadyMigrated++
        continue
      }
      
      const sig = item.analysis.game_signature as GameSignature
      const primary = getPrimaryGame(sig)
      
      toExtract.push({
        item_id: itemId,
        timestamp: item.timestamp,
        computed_at: computedAt,
        game_signature: sig,
        primary_game: primary.game,
        confidence: primary.confidence,
      })
    }
  }
  
  console.log(`  ${artifactPath}: ${items.length} items, ${toExtract.length} to extract, ${alreadyMigrated} already migrated`)
  
  if (toExtract.length > 0 && !dryRun) {
    // Write enhancements to separate file
    const records = toExtract.map((e) => JSON.stringify(e))
    await appendToEnhancementFile(
      octokit,
      owner,
      repo,
      branch,
      artifactType,
      'game_signatures',
      records
    )
    console.log(`  ✅ Extracted ${toExtract.length} enhancements to artifacts/${artifactType}/game_signatures.jsonl`)
  } else if (toExtract.length > 0) {
    console.log(`  [DRY RUN] Would extract ${toExtract.length} enhancements`)
  }
  
  return { extracted: toExtract.length, alreadyMigrated }
}

/**
 * Process a single user's repository
 */
async function processUserRepo(userId: string): Promise<{ extracted: number; errors: string[] }> {
  const result = { extracted: 0, errors: [] as string[] }
  
  // Get user's GitHub repo
  const repoResult = await pool.query(
    `SELECT repo_owner, repo_name, branch, access_token_encrypted
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
  
  const { repo_owner, repo_name, branch, access_token_encrypted } = repoResult.rows[0]
  
  // Decrypt token and create Octokit
  let octokit: any
  try {
    const token = decryptToken(access_token_encrypted)
    octokit = createOctokit(token)
  } catch (e) {
    result.errors.push('Failed to decrypt GitHub token')
    return result
  }
  
  console.log(`\nProcessing repo: ${repo_owner}/${repo_name}`)
  
  // Process each artifact type
  for (const { type, file } of ARTIFACT_CONFIG) {
    try {
      const { extracted } = await extractFromArtifactFile(
        octokit,
        repo_owner,
        repo_name,
        branch,
        type,
        file
      )
      result.extracted += extracted
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(`${type}/${file}: ${errorMsg}`)
      console.error(`  ❌ Error processing ${type}/${file}:`, errorMsg)
    }
  }
  
  return result
}

/**
 * Main migration function
 */
async function runMigration(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Enhancement Extraction Migration')
  console.log('='.repeat(60))
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made')
  }
  
  const stats: MigrationStats = {
    usersProcessed: 0,
    itemsExtracted: 0,
    errors: [],
  }
  
  try {
    // Get users to process
    let query = 'SELECT DISTINCT user_id FROM user_github_repos'
    const params: any[] = []
    
    if (targetUserId) {
      query += ' WHERE user_id = $1'
      params.push(targetUserId)
      console.log(`\nProcessing single user: ${targetUserId}`)
    } else {
      console.log('\nProcessing all users with connected repositories')
    }
    
    const usersResult = await pool.query(query, params)
    console.log(`Found ${usersResult.rows.length} user(s) to process`)
    
    for (const row of usersResult.rows) {
      stats.usersProcessed++
      
      const result = await processUserRepo(row.user_id)
      stats.itemsExtracted += result.extracted
      stats.errors.push(...result.errors)
      
      // Small delay between users
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    stats.errors.push(`Migration error: ${errorMsg}`)
    console.error('Migration error:', error)
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('Migration Summary')
  console.log('='.repeat(60))
  console.log(`Users processed: ${stats.usersProcessed}`)
  console.log(`Items extracted: ${stats.itemsExtracted}`)
  console.log(`Errors: ${stats.errors.length}`)
  
  if (stats.errors.length > 0) {
    console.log('\nErrors:')
    for (const error of stats.errors) {
      console.log(`  - ${error}`)
    }
  }
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes were made')
    console.log('Run without --dry-run to apply changes')
  }
  
  // Close database connection
  await pool.end()
}

// Run the migration
runMigration()
  .then(() => {
    console.log('\n✅ Migration complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  })

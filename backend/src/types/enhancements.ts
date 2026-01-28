/**
 * Enhancement Layer Types
 * 
 * These types define the schema for progressive enhancement files.
 * Enhancements are stored in separate JSONL files that reference
 * source artifacts by ID, keeping raw data append-only.
 */

export interface GameSignature {
  G1: number
  G2: number
  G3: number
  G4: number
  G5: number
  G6: number
}

/**
 * Base interface for all enhancement records
 */
export interface EnhancementRecord {
  item_id: string           // Reference to source artifact (e.g., tweet ID)
  timestamp: string         // Source item timestamp (for deduplication)
  computed_at: string       // ISO timestamp when this enhancement was computed
}

/**
 * Game classification enhancement
 * Stored in: artifacts/{type}/game_signatures.jsonl
 */
export interface GameSignatureEnhancement extends EnhancementRecord {
  game_signature: GameSignature
  primary_game: string      // e.g., "G1", "G2", etc.
  confidence: number        // 0-1 confidence score
}

/**
 * Quality and content analysis enhancement
 * Stored in: artifacts/{type}/quality_scores.jsonl
 */
export interface QualityScoreEnhancement extends EnhancementRecord {
  quality_score: number     // 0-1 overall quality score
  themes: string[]          // Extracted themes/topics
  sentiment: string         // "positive", "negative", "neutral"
  complexity_score: number  // 0-1 complexity measure
}

/**
 * Embedding vectors for semantic search
 * Stored in: artifacts/{type}/embeddings.jsonl
 */
export interface EmbeddingEnhancement extends EnhancementRecord {
  embedding: number[]       // Vector embedding
  model: string             // Model used (e.g., "text-embedding-3-small")
  dimensions: number        // Embedding dimensions
}

/**
 * Combined analysis object for backward compatibility
 * Used when merging enhancements at read time
 */
export interface MergedAnalysis {
  game_signature?: GameSignature
  themes?: string[]
  sentiment?: string
  complexity_score?: number
  quality_score?: number
}

/**
 * Enhancement file names (used for filtering during artifact reads)
 */
export const ENHANCEMENT_FILE_NAMES = [
  'game_signatures.jsonl',
  'quality_scores.jsonl',
  'embeddings.jsonl',
] as const

export type EnhancementFileName = typeof ENHANCEMENT_FILE_NAMES[number]

/**
 * Check if a filename is an enhancement file
 */
export function isEnhancementFile(filename: string): boolean {
  return ENHANCEMENT_FILE_NAMES.includes(filename as EnhancementFileName)
}

/**
 * Get the enhancement file path for a given artifact type and enhancement type
 */
export function getEnhancementFilePath(
  artifactType: string,
  enhancementType: 'game_signatures' | 'quality_scores' | 'embeddings'
): string {
  return `artifacts/${artifactType}/${enhancementType}.jsonl`
}

import { classifyGameTool, classifyGamesBatchTool } from '../mastra/tools/game-classifier-tool.js'
import { pool } from '../db/index.js'
import { getChromaCollection, expressionsCollection } from './chroma.js'

export interface GameSignature {
  G1: number
  G2: number
  G3: number
  G4: number
  G5: number
  G6: number
}

export interface ContentAnalysis {
  game_signature: GameSignature
  primary_game?: string
  secondary_game?: string
  creator_score: number
  complexity_score: number
  themes: string[]
  quality_score: number
  metadata?: {
    relevance_score?: number
    trust_score?: number
    is_verified?: boolean
    [key: string]: unknown
  }
}

export interface TrajectoryShift {
  detected: boolean
  significance: number
  shift_type?: 'game_transition' | 'theme_change' | 'quality_shift' | 'activity_spike'
  description?: string
}

/**
 * Extract game signature (G1-G6 distribution) from content
 */
export async function extractGameSignature(
  content: string | string[]
): Promise<GameSignature> {
  const texts = Array.isArray(content) ? content : [content]
  
  // Use batch classification if multiple texts
  if (texts.length > 1) {
    const result = await (classifyGamesBatchTool as any).execute({ texts })
    
    if ('error' in result || !('success' in result) || !result.success || !result.predictions) {
      // Fallback to uniform distribution
      return { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
    }
    
    // Aggregate probabilities across all predictions
    const signature: GameSignature = { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
    let total = 0
    
    for (const pred of result.predictions) {
      // Map primary_game to G1-G6
      const gameKey = pred.primary_game as keyof GameSignature
      if (gameKey && signature.hasOwnProperty(gameKey)) {
        signature[gameKey] += pred.confidence || 0
        total += pred.confidence || 0
      }
    }
    
    // Normalize
    if (total > 0) {
      Object.keys(signature).forEach((key) => {
        signature[key as keyof GameSignature] /= total
      })
    }
    
    return signature
  } else {
    // Single text classification
    const result = await (classifyGameTool as any).execute({ text: texts[0] })
    
    if ('error' in result || !('success' in result) || !result.success || !result.primary_game) {
      return { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
    }
    
    const signature: GameSignature = { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
    const gameKey = result.primary_game as keyof GameSignature
    if (gameKey && signature.hasOwnProperty(gameKey)) {
      signature[gameKey] = result.confidence || 0
    }
    
    return signature
  }
}

/**
 * Calculate creator score based on content quality metrics
 */
export async function calculateCreatorScore(
  userId: string,
  content: {
    text: string
    timestamp?: string
    source?: string
  }
): Promise<number> {
  // Base score from game classification quality
  const gameResult = await (classifyGameTool as any).execute({ text: content.text })
  
  let score = 0
  
  // Quality score from game classifier (0-1)
  if (!('error' in gameResult) && 'success' in gameResult && gameResult.success && gameResult.quality_score) {
    score += gameResult.quality_score * 0.4
  }
  
  // Confidence tier bonus
  if (!('error' in gameResult) && 'success' in gameResult && gameResult.confidence_tier === 'high') {
    score += 0.2
  } else if (!('error' in gameResult) && 'success' in gameResult && gameResult.confidence_tier === 'medium') {
    score += 0.1
  }
  
  // Historical influence correlation (if user has expressions)
  const influenceResult = await pool.query(
    `SELECT AVG(il.similarity) as avg_similarity, COUNT(*) as link_count
     FROM influence_links il
     JOIN expressions e ON il.expression_id = e.expression_id
     WHERE e.user_id = $1
     AND e.created_at >= NOW() - INTERVAL '90 days'`,
    [userId]
  )
  
  if (influenceResult.rows[0]?.link_count > 0) {
    const avgSimilarity = parseFloat(influenceResult.rows[0].avg_similarity || '0')
    score += avgSimilarity * 0.3 // Up to 0.3 points from influence history
  }
  
  // Content length factor (longer content often more valuable)
  const lengthFactor = Math.min(content.text.length / 1000, 0.1) // Max 0.1 for very long content
  score += lengthFactor
  
  return Math.min(score, 1.0) // Cap at 1.0
}

/**
 * Calculate complexity score based on content characteristics
 */
export function calculateComplexityScore(content: {
  text: string
  themes?: string[]
  game_signature?: GameSignature
}): number {
  let score = 0
  
  // Text complexity (vocabulary, sentence structure)
  const words = content.text.split(/\s+/)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length
  const uniqueWords = new Set(words).size
  const diversity = uniqueWords / words.length
  
  score += Math.min(avgWordLength / 10, 0.3) // Up to 0.3 for complex vocabulary
  score += Math.min(diversity, 0.2) // Up to 0.2 for word diversity
  
  // Game signature diversity (multiple games = more complex)
  if (content.game_signature) {
    const nonZeroGames = Object.values(content.game_signature).filter((v) => v > 0.1).length
    score += Math.min(nonZeroGames / 6, 0.2) // Up to 0.2 for multi-game content
  }
  
  // Theme count
  if (content.themes && content.themes.length > 0) {
    score += Math.min(content.themes.length / 10, 0.3) // Up to 0.3 for multiple themes
  }
  
  return Math.min(score, 1.0)
}

/**
 * Extract themes from content (simplified - would use NLP in production)
 */
export async function extractThemes(content: string): Promise<string[]> {
  // Simplified theme extraction based on keywords
  // In production, this would use embeddings or NLP models
  
  const themeKeywords: Record<string, string[]> = {
    'coordination': ['coordination', 'cooperate', 'collaborate', 'network', 'community'],
    'identity': ['identity', 'self', 'authentic', 'personal', 'brand'],
    'platforms': ['platform', 'infrastructure', 'protocol', 'network', 'ecosystem'],
    'algorithms': ['algorithm', 'ai', 'ml', 'model', 'intelligence', 'automation'],
    'network-states': ['network state', 'city', 'jurisdiction', 'governance', 'sovereignty'],
    'crypto': ['crypto', 'blockchain', 'bitcoin', 'ethereum', 'defi', 'nft'],
    'startups': ['startup', 'founder', 'venture', 'funding', 'entrepreneur'],
    'productivity': ['productivity', 'efficiency', 'optimize', 'system', 'process'],
  }
  
  const themes: string[] = []
  const lowerContent = content.toLowerCase()
  
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some((kw) => lowerContent.includes(kw))) {
      themes.push(theme)
    }
  }
  
  return themes
}

/**
 * Detect trajectory shift in user's content patterns
 */
export async function detectTrajectoryShift(
  userId: string,
  recentChanges: {
    new_artifacts?: number
    new_sources?: number
    game_signature?: GameSignature
    themes?: string[]
  }
): Promise<TrajectoryShift> {
  // Get historical patterns
  const historicalResult = await pool.query(
    `SELECT 
       COUNT(*) as artifact_count,
       AVG(CASE WHEN metadata->>'game_signature' IS NOT NULL THEN 1 ELSE 0 END) as has_game_data
     FROM expressions
     WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '30 days'
     AND created_at < NOW() - INTERVAL '7 days'`,
    [userId]
  )
  
  const historical = historicalResult.rows[0]
  const historicalArtifactCount = parseInt(historical?.artifact_count || '0', 10)
  
  // Compare recent activity
  const recentArtifactCount = recentChanges.new_artifacts || 0
  const activityChange = historicalArtifactCount > 0
    ? recentArtifactCount / historicalArtifactCount
    : recentArtifactCount > 0
    ? 2.0 // New activity
    : 0
  
  let significance = 0
  let shiftType: TrajectoryShift['shift_type'] | undefined
  let description: string | undefined
  
  // Activity spike detection
  if (activityChange > 1.5) {
    significance += 0.4
    shiftType = 'activity_spike'
    description = `Activity increased ${(activityChange * 100).toFixed(0)}%`
  }
  
  // Game transition detection (if we have game signature data)
  if (recentChanges.game_signature) {
    // Compare with historical game distribution
    // Simplified: if primary game changed significantly
    const primaryGame = Object.entries(recentChanges.game_signature)
      .sort(([, a], [, b]) => b - a)[0]?.[0]
    
    if (primaryGame) {
      significance += 0.3
      if (!shiftType) shiftType = 'game_transition'
      description = `Primary game shifted to ${primaryGame}`
    }
  }
  
  // Theme change detection
  if (recentChanges.themes && recentChanges.themes.length > 0) {
    const historicalThemesResult = await pool.query(
      `SELECT DISTINCT metadata->>'themes' as themes
       FROM expressions
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'
       AND metadata->>'themes' IS NOT NULL
       LIMIT 10`,
      [userId]
    )
    
    const historicalThemes = new Set(
      historicalThemesResult.rows
        .map((r) => r.themes)
        .filter(Boolean)
        .flatMap((t) => (typeof t === 'string' ? JSON.parse(t) : []))
    )
    
    const newThemes = recentChanges.themes.filter((t) => !historicalThemes.has(t))
    if (newThemes.length > 0) {
      significance += 0.3
      if (!shiftType) shiftType = 'theme_change'
      description = `New themes: ${newThemes.join(', ')}`
    }
  }
  
  return {
    detected: significance > 0.5,
    significance: Math.min(significance, 1.0),
    shift_type: shiftType,
    description,
  }
}

/**
 * Compute relevance score between content and user's current interests
 */
export async function computeRelevanceScore(
  content: {
    text: string
    game_signature?: GameSignature
    themes?: string[]
  },
  userId: string
): Promise<number> {
  let score = 0
  
  // Get user's recent expressions to understand current interests
  const recentExpressionsResult = await pool.query(
    `SELECT text, chroma_id
     FROM expressions
     WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  )
  
  if (recentExpressionsResult.rows.length === 0) {
    return 0.5 // Default relevance if no history
  }
  
  // Use Chroma to compute similarity with recent expressions
  try {
    const collection = await getChromaCollection(expressionsCollection)
    
    // Get embeddings for recent expressions
    const chromaIds = recentExpressionsResult.rows
      .map((r) => r.chroma_id)
      .filter((id): id is string => Boolean(id))
    
    if (chromaIds.length > 0) {
      const results = await collection.get({ ids: chromaIds })
      const embeddings = results.embeddings || []
      
      if (embeddings.length > 0) {
        // Get embedding for current content (would need to generate it)
        // For now, use theme/game signature matching as proxy
        const userThemes = new Set<string>()
        const userGames: GameSignature = { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
        
        // Extract themes from user's recent content
        for (const row of recentExpressionsResult.rows) {
          const themes = await extractThemes(row.text)
          themes.forEach((t) => userThemes.add(t))
        }
        
        // Theme overlap
        if (content.themes) {
          const overlap = content.themes.filter((t) => userThemes.has(t)).length
          score += Math.min(overlap / Math.max(userThemes.size, 1), 0.5)
        }
        
        // Game signature similarity
        if (content.game_signature) {
          // Compute cosine similarity between game signatures
          const userSig = userGames
          const contentSig = content.game_signature
          
          let dotProduct = 0
          let userNorm = 0
          let contentNorm = 0
          
          Object.keys(userSig).forEach((key) => {
            const k = key as keyof GameSignature
            dotProduct += userSig[k] * contentSig[k]
            userNorm += userSig[k] * userSig[k]
            contentNorm += contentSig[k] * contentSig[k]
          })
          
          const similarity = dotProduct / (Math.sqrt(userNorm) * Math.sqrt(contentNorm) || 1)
          score += similarity * 0.5
        }
      }
    }
  } catch (error) {
    console.error('Error computing relevance with Chroma:', error)
    // Fallback to theme matching only
    if (content.themes && content.themes.length > 0) {
      score = 0.3 // Default relevance
    }
  }
  
  return Math.min(score, 1.0)
}

/**
 * Full content analysis pipeline
 */
export async function analyzeContent(
  content: {
    text: string
    userId?: string
    timestamp?: string
    source?: string
  }
): Promise<ContentAnalysis> {
  const [gameSignature, themes] = await Promise.all([
    extractGameSignature(content.text),
    extractThemes(content.text),
  ])
  
  const complexityScore = calculateComplexityScore({
    text: content.text,
    themes,
    game_signature: gameSignature,
  })
  
  const creatorScore = content.userId
    ? await calculateCreatorScore(content.userId, {
        text: content.text,
        timestamp: content.timestamp,
        source: content.source,
      })
    : 0.5
  
  // Determine primary and secondary games
  const sortedGames = Object.entries(gameSignature).sort(([, a], [, b]) => b - a)
  const primaryGame = sortedGames[0]?.[0]
  const secondaryGame = sortedGames[1]?.[0]
  
  // Overall quality score (weighted combination)
  const qualityScore = creatorScore * 0.5 + complexityScore * 0.3 + (gameSignature[primaryGame as keyof GameSignature] || 0) * 0.2
  
  return {
    game_signature: gameSignature,
    primary_game: primaryGame,
    secondary_game: secondaryGame,
    creator_score: creatorScore,
    complexity_score: complexityScore,
    themes,
    quality_score: qualityScore,
  }
}

import { GameSignature, ContentAnalysis, TrajectoryShift } from '../content-analysis.js'

export interface NetworkChanges {
  new_artifacts?: Array<{
    id: string
    type: string
    text: string
    timestamp: string
    url?: string
  }>
  new_sources?: Array<{
    id: string
    type: string
    text: string
    timestamp: string
  }>
  updated_reports?: Array<{
    type: string
    content: string
    timestamp: string
  }>
  trajectory_shift?: TrajectoryShift
  game_signature?: GameSignature
  themes?: string[]
  analysis?: ContentAnalysis
}

export interface GateConfig {
  gate_type: string
  config: Record<string, unknown>
  is_enabled: boolean
  priority: number
}

export interface GateResult {
  passed: boolean
  reason?: string
  metadata?: Record<string, unknown>
}

/**
 * Base gate interface
 */
export interface Gate {
  evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult>
}

/**
 * Game Filter Gate
 * Filters content based on game types (G1-G6)
 */
export class GameFilterGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const games = (config.config.games as string[]) || []
    const minPrimaryGamePercentage = (config.config.min_primary_game_percentage as number) || 0.3
    const allowMixed = (config.config.allow_mixed as boolean) ?? true
    
    if (games.length === 0) {
      return { passed: true, reason: 'No game filter specified' }
    }
    
    const gameSignature = changes.game_signature || changes.analysis?.game_signature
    if (!gameSignature) {
      return { passed: false, reason: 'No game signature available' }
    }
    
    // Check if primary game is in allowed list
    const sortedGames = Object.entries(gameSignature).sort(([, a], [, b]) => b - a)
    const primaryGame = sortedGames[0]?.[0]
    const primaryPercentage = sortedGames[0]?.[1] || 0
    
    if (!primaryGame || !games.includes(primaryGame)) {
      return { passed: false, reason: `Primary game ${primaryGame} not in allowed list` }
    }
    
    if (primaryPercentage < minPrimaryGamePercentage) {
      return { passed: false, reason: `Primary game percentage ${primaryPercentage} below threshold ${minPrimaryGamePercentage}` }
    }
    
    // Check mixed games if not allowed
    if (!allowMixed) {
      const otherGames = sortedGames.slice(1).filter(([, p]) => p > 0.1)
      if (otherGames.length > 0) {
        return { passed: false, reason: 'Mixed games detected but not allowed' }
      }
    }
    
    return {
      passed: true,
      reason: `Primary game ${primaryGame} (${(primaryPercentage * 100).toFixed(1)}%) matches filter`,
      metadata: { primary_game: primaryGame, percentage: primaryPercentage },
    }
  }
}

/**
 * Quality Threshold Gate
 * Filters content based on quality scores
 */
export class QualityThresholdGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const minCreatorScore = (config.config.min_creator_score as number) || 0.7
    const minComplexityScore = (config.config.min_content_complexity as number) || 0.5
    const minInfluenceCorrelation = (config.config.min_influence_correlation as number) || 0.4
    
    const analysis = changes.analysis
    if (!analysis) {
      return { passed: false, reason: 'No content analysis available' }
    }
    
    const failures: string[] = []
    
    if (analysis.creator_score < minCreatorScore) {
      failures.push(`Creator score ${analysis.creator_score.toFixed(2)} < ${minCreatorScore}`)
    }
    
    if (analysis.complexity_score < minComplexityScore) {
      failures.push(`Complexity score ${analysis.complexity_score.toFixed(2)} < ${minComplexityScore}`)
    }
    
    // Influence correlation would need to be computed separately
    // For now, use quality_score as proxy
    if (analysis.quality_score < minInfluenceCorrelation) {
      failures.push(`Quality score ${analysis.quality_score.toFixed(2)} < ${minInfluenceCorrelation}`)
    }
    
    if (failures.length > 0) {
      return { passed: false, reason: failures.join('; ') }
    }
    
    return {
      passed: true,
      reason: 'All quality thresholds met',
      metadata: {
        creator_score: analysis.creator_score,
        complexity_score: analysis.complexity_score,
        quality_score: analysis.quality_score,
      },
    }
  }
}

/**
 * Relevance Matcher Gate
 * Matches content to user's current interests
 */
export class RelevanceMatcherGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const similarityThreshold = (config.config.similarity_threshold as number) || 0.6
    const temporalDecay = (config.config.temporal_decay as boolean) ?? true
    const decayHalflifeDays = (config.config.decay_halflife_days as number) || 30
    
    // Relevance score should be computed by the processor before gate evaluation
    const relevanceScore = (changes.analysis?.metadata?.relevance_score as number) || 0
    
    if (relevanceScore < similarityThreshold) {
      return {
        passed: false,
        reason: `Relevance score ${relevanceScore.toFixed(2)} < threshold ${similarityThreshold}`,
      }
    }
    
    return {
      passed: true,
      reason: `Relevance score ${relevanceScore.toFixed(2)} meets threshold`,
      metadata: { relevance_score: relevanceScore },
    }
  }
}

/**
 * Network Trust Gate
 * Filters based on trust scores in the network
 */
export class NetworkTrustGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const minTrustScore = (config.config.min_trust_score as number) || 0.75
    const trustSources = (config.config.trust_sources as string[]) || ['mutual_watchers', 'interaction_history']
    const requireVerification = (config.config.require_verification as boolean) ?? false
    
    // Trust score should be computed by the processor
    const trustScore = (changes.analysis?.metadata?.trust_score as number) || 0.5 // Default moderate trust
    
    if (trustScore < minTrustScore) {
      return {
        passed: false,
        reason: `Trust score ${trustScore.toFixed(2)} < threshold ${minTrustScore}`,
      }
    }
    
    // Check verification if required
    if (requireVerification) {
      const isVerified = (changes.analysis?.metadata?.is_verified as boolean) || false
      if (!isVerified) {
        return { passed: false, reason: 'Verification required but not present' }
      }
    }
    
    return {
      passed: true,
      reason: `Trust score ${trustScore.toFixed(2)} meets threshold`,
      metadata: { trust_score: trustScore, sources: trustSources },
    }
  }
}

/**
 * Temporal Gate
 * Rate limiting and batching
 */
export class TemporalGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const maxItemsPerDay = (config.config.max_items_per_day as number) || 10
    const batchMode = (config.config.batch_mode as boolean) ?? true
    const deliveryTime = (config.config.delivery_time as string) || '09:00'
    const weekendMode = (config.config.weekend_mode as string) || 'digest_only'
    
    // This gate needs state tracking (items processed today)
    // For now, we'll pass and let the feed generator handle batching
    const itemCount = (changes.new_artifacts?.length || 0) + (changes.new_sources?.length || 0)
    
    if (itemCount > maxItemsPerDay) {
      return {
        passed: false,
        reason: `Item count ${itemCount} exceeds daily limit ${maxItemsPerDay}`,
      }
    }
    
    // Check if weekend and weekend mode is digest_only
    const now = new Date()
    const dayOfWeek = now.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    
    if (isWeekend && weekendMode === 'digest_only' && itemCount > 0) {
      return {
        passed: true,
        reason: 'Weekend mode: items will be batched into digest',
        metadata: { batch_mode: true, weekend: true },
      }
    }
    
    return {
      passed: true,
      reason: `Temporal gate passed (${itemCount} items, batch: ${batchMode})`,
      metadata: { item_count: itemCount, batch_mode: batchMode },
    }
  }
}

/**
 * Emergence Detector Gate
 * Detects significant changes/developments
 */
export class EmergenceDetectorGate implements Gate {
  async evaluate(changes: NetworkChanges, config: GateConfig): Promise<GateResult> {
    const detectNewThemes = (config.config.detect_new_themes as boolean) ?? true
    const detectTrajectoryShifts = (config.config.detect_trajectory_shifts as boolean) ?? true
    const detectGameTransitions = (config.config.detect_game_transitions as boolean) ?? true
    const minSignificance = (config.config.min_significance as number) || 0.7
    
    // Check trajectory shift
    if (detectTrajectoryShifts && changes.trajectory_shift) {
      if (changes.trajectory_shift.detected && changes.trajectory_shift.significance >= minSignificance) {
        return {
          passed: true,
          reason: `Trajectory shift detected: ${changes.trajectory_shift.description}`,
          metadata: {
            shift_type: changes.trajectory_shift.shift_type,
            significance: changes.trajectory_shift.significance,
          },
        }
      }
    }
    
    // Check game transitions
    if (detectGameTransitions && changes.game_signature) {
      // This would compare with historical signature
      // For now, if we have a strong primary game, consider it significant
      const sortedGames = Object.entries(changes.game_signature).sort(([, a], [, b]) => b - a)
      const primaryPercentage = sortedGames[0]?.[1] || 0
      
      if (primaryPercentage >= minSignificance) {
        return {
          passed: true,
          reason: `Strong game signature detected (${(primaryPercentage * 100).toFixed(1)}%)`,
          metadata: { primary_game: sortedGames[0]?.[0], percentage: primaryPercentage },
        }
      }
    }
    
    // Check new themes
    if (detectNewThemes && changes.themes && changes.themes.length > 0) {
      // In production, would compare with historical themes
      return {
        passed: true,
        reason: `New themes detected: ${changes.themes.join(', ')}`,
        metadata: { themes: changes.themes },
      }
    }
    
    // If no emergence detected, gate passes but with lower priority
    return {
      passed: true,
      reason: 'No significant emergence detected, but content passes',
      metadata: { significance: 0.5 },
    }
  }
}

/**
 * Gate factory
 */
export function createGate(gateType: string): Gate {
  switch (gateType) {
    case 'game_filter':
      return new GameFilterGate()
    case 'quality_threshold':
      return new QualityThresholdGate()
    case 'relevance_matcher':
      return new RelevanceMatcherGate()
    case 'network_trust':
      return new NetworkTrustGate()
    case 'temporal':
      return new TemporalGate()
    case 'emergence_detector':
      return new EmergenceDetectorGate()
    default:
      throw new Error(`Unknown gate type: ${gateType}`)
  }
}

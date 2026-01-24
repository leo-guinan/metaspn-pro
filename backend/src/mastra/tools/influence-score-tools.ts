import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import { calculateCompletionRatio } from './metrics-tools'

export const applyTimeDecay = createTool({
  id: 'apply_time_decay',
  description: 'Apply exponential time decay based on days_after_listen.',
  inputSchema: z.object({
    similarity: z.number().min(0).max(1),
    days_after_listen: z.number().min(0),
    decay_factor: z.number().default(0.95),
  }),
  outputSchema: z.object({
    decayed_similarity: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { similarity, days_after_listen, decay_factor } = context
    const decayed = similarity * Math.pow(decay_factor, days_after_listen)
    return { decayed_similarity: decayed }
  },
})

export const applyCompletionWeight = createTool({
  id: 'apply_completion_weight',
  description: 'Apply completion weight: higher weight if user finished episode.',
  inputSchema: z.object({
    base_score: z.number(),
    completion_ratio: z.number().min(0).max(1),
    finished_multiplier: z.number().default(1.5),
  }),
  outputSchema: z.object({
    weighted_score: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { base_score, completion_ratio, finished_multiplier } = context
    const multiplier = completion_ratio >= 0.9 ? finished_multiplier : 1.0
    return { weighted_score: base_score * multiplier }
  },
})

export const calculateInfluenceScore = createTool({
  id: 'calculate_influence_score',
  description: 'Calculate Influence Score for an episode: sum of (similarity × time_decay × completion_weight) for all linked expressions.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    influence_score: z.number(),
    link_count: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, user_id } = context

    // Get completion ratio for weighting
    const completionResult = await (calculateCompletionRatio as any).execute({
      context: {
        episode_id,
        user_id,
      },
    })

    // Get all influence links for this episode and user's expressions
    const linksResult = await pool.query(
      `SELECT il.similarity, il.days_after_listen, e.expression_id
       FROM influence_links il
       JOIN expressions e ON il.expression_id = e.expression_id
       WHERE il.episode_id = $1 AND e.user_id = $2`,
      [episode_id, user_id]
    )

    let totalInfluence = 0
    const decayFactor = 0.95
    const finishedMultiplier = 1.5

    for (const link of linksResult.rows) {
      const similarity = parseFloat(link.similarity)
      const daysAfterListen = parseFloat(link.days_after_listen || 0)

      // Apply time decay
      const decayed = similarity * Math.pow(decayFactor, daysAfterListen)

      // Apply completion weight
      const completionRatio = completionResult.completion_ratio
      const multiplier = completionRatio >= 0.9 ? finishedMultiplier : 1.0

      totalInfluence += decayed * multiplier
    }

    return {
      influence_score: totalInfluence,
      link_count: linksResult.rows.length,
    }
  },
})

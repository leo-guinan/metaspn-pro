import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import { calculateCompletionRatio } from './metrics-tools'

export const calculateFanScore = createTool({
  id: 'calculate_fan_score',
  description: 'Calculate Fan Score for a podcast: sum of completion ratios across all episodes.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    fan_score: z.number(),
    episode_count: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id } = context

    // Get all episodes for this podcast that the user has listened to
    const episodesResult = await pool.query(
      `SELECT DISTINCT e.episode_id, e.duration_sec
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1 AND ev.user_id = $2`,
      [podcast_id, user_id]
    )

    let totalScore = 0
    let episodeCount = 0

    for (const episode of episodesResult.rows) {
      const completionResult = await (calculateCompletionRatio as any).execute({
        context: {
          episode_id: episode.episode_id,
          user_id,
        },
      })

      totalScore += completionResult.completion_ratio
      episodeCount++
    }

    return {
      fan_score: totalScore,
      episode_count: episodeCount,
    }
  },
})

export const calculateAdjustedFanScore = createTool({
  id: 'calculate_adjusted_fan_score',
  description: 'Calculate migration-aware Fan Score that handles data imports gracefully.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
    import_date: z.string().datetime().optional(),
  }),
  outputSchema: z.object({
    fan_score: z.number(),
    episode_count: z.number(),
    adjusted_score: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id, import_date } = context

    // Get episodes, filtering by import date if provided
    let query = `
      SELECT DISTINCT e.episode_id, e.duration_sec
      FROM episodes e
      JOIN events ev ON e.episode_id = ev.episode_id
      WHERE e.podcast_id = $1 AND ev.user_id = $2
    `
    const params: any[] = [podcast_id, user_id]

    if (import_date) {
      query += ` AND ev.created_at >= $3`
      params.push(import_date)
    }

    const episodesResult = await pool.query(query, params)

    let totalScore = 0
    let episodeCount = 0

    for (const episode of episodesResult.rows) {
      const completionResult = await (calculateCompletionRatio as any).execute({
        context: {
          episode_id: episode.episode_id,
          user_id,
        },
      })

      totalScore += completionResult.completion_ratio
      episodeCount++
    }

    // Adjusted score normalizes by episode count
    const adjusted_score = episodeCount > 0 ? totalScore / episodeCount : 0

    return {
      fan_score: totalScore,
      episode_count: episodeCount,
      adjusted_score,
    }
  },
})

export const calculateRecencyWeightedFanScore = createTool({
  id: 'calculate_recency_weighted_fan_score',
  description: 'Calculate Fan Score with recent listens weighted higher.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
    decay_factor: z.number().default(0.95), // Per day decay
  }),
  outputSchema: z.object({
    fan_score: z.number(),
    episode_count: z.number(),
    weighted_score: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id, decay_factor } = context

    // Get episodes with their last listen date
    const episodesResult = await pool.query(
      `SELECT DISTINCT e.episode_id, e.duration_sec,
              MAX(ev.timestamp_utc) as last_listen
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1 AND ev.user_id = $2
       GROUP BY e.episode_id, e.duration_sec`,
      [podcast_id, user_id]
    )

    let totalScore = 0
    let weightedScore = 0
    let episodeCount = 0
    const now = new Date()

    for (const episode of episodesResult.rows) {
      const completionResult = await (calculateCompletionRatio as any).execute({
        context: {
          episode_id: episode.episode_id,
          user_id,
        },
      })

      const completionRatio = completionResult.completion_ratio
      totalScore += completionRatio
      episodeCount++

      // Calculate recency weight
      const lastListen = new Date(episode.last_listen)
      const daysAgo = (now.getTime() - lastListen.getTime()) / (1000 * 60 * 60 * 24)
      const recencyWeight = Math.pow(decay_factor, daysAgo)

      weightedScore += completionRatio * recencyWeight
    }

    return {
      fan_score: totalScore,
      episode_count: episodeCount,
      weighted_score: weightedScore,
    }
  },
})

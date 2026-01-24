import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const calculateCompletionRatio = createTool({
  id: 'calculate_completion_ratio',
  description: 'Calculate completion ratio for an episode (last playhead / duration).',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    completion_ratio: z.number().min(0).max(1),
    last_playhead_sec: z.number().nullable(),
    episode_duration_sec: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, user_id } = context

    // Get episode duration
    const episodeResult = await pool.query(
      'SELECT duration_sec FROM episodes WHERE episode_id = $1',
      [episode_id]
    )

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found')
    }

    const episode_duration_sec = parseFloat(episodeResult.rows[0].duration_sec)

    // Get last playhead from events
    const eventResult = await pool.query(
      `SELECT playhead_sec, episode_duration_sec
       FROM events
       WHERE user_id = $1 AND episode_id = $2
       AND playhead_sec IS NOT NULL
       ORDER BY timestamp_utc DESC
       LIMIT 1`,
      [user_id, episode_id]
    )

    if (eventResult.rows.length === 0) {
      return {
        completion_ratio: 0,
        last_playhead_sec: null,
        episode_duration_sec,
      }
    }

    const last_playhead_sec = parseFloat(eventResult.rows[0].playhead_sec)
    const completion_ratio = Math.min(last_playhead_sec / episode_duration_sec, 1)

    return {
      completion_ratio,
      last_playhead_sec,
      episode_duration_sec,
    }
  },
})

export const isFinished = createTool({
  id: 'is_finished',
  description: 'Check if an episode is finished (completion_ratio >= 0.9).',
  inputSchema: z.object({
    completion_ratio: z.number().min(0).max(1),
  }),
  outputSchema: z.object({
    finished: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    return {
      finished: context.completion_ratio >= 0.9,
    }
  },
})

export const isBounced = createTool({
  id: 'is_bounced',
  description: 'Check if an episode was bounced (completion_ratio <= 0.2).',
  inputSchema: z.object({
    completion_ratio: z.number().min(0).max(1),
  }),
  outputSchema: z.object({
    bounced: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    return {
      bounced: context.completion_ratio <= 0.2,
    }
  },
})

export const getCompletionBucket = createTool({
  id: 'get_completion_bucket',
  description: 'Get completion bucket: finished (>=0.9), mostly (0.7-0.9), sampled (0.2-0.7), or bounced (<=0.2).',
  inputSchema: z.object({
    completion_ratio: z.number().min(0).max(1),
  }),
  outputSchema: z.object({
    bucket: z.enum(['finished', 'mostly', 'sampled', 'bounced']),
  }),
  execute: async ({ context }: any) => {
    const ratio = context.completion_ratio

    if (ratio >= 0.9) {
      return { bucket: 'finished' as const }
    } else if (ratio >= 0.7) {
      return { bucket: 'mostly' as const }
    } else if (ratio > 0.2) {
      return { bucket: 'sampled' as const }
    } else {
      return { bucket: 'bounced' as const }
    }
  },
})

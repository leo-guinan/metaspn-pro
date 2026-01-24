import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const getTotalEpisodesListened = createTool({
  id: 'get_total_episodes_listened',
  description: 'Get total number of episodes listened by a user.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    days: z.number().default(30),
  }),
  outputSchema: z.object({
    total_episodes: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, days } = context

    const result = await pool.query(
      `SELECT COUNT(DISTINCT episode_id) as count
       FROM events
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [user_id]
    )

    return {
      total_episodes: parseInt(result.rows[0].count, 10),
    }
  },
})

export const getTotalHoursListened = createTool({
  id: 'get_total_hours_listened',
  description: 'Get total hours listened by a user.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    days: z.number().default(30),
  }),
  outputSchema: z.object({
    total_hours: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, days } = context

    const result = await pool.query(
      `SELECT SUM(COALESCE(playhead_sec, 0)) / 3600.0 as hours
       FROM events
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${days} days'
       AND event_type = 'play'`,
      [user_id]
    )

    return {
      total_hours: parseFloat(result.rows[0].hours || 0),
    }
  },
})

export const getCompletionDistribution = createTool({
  id: 'get_completion_distribution',
  description: 'Get completion distribution (finished, mostly, sampled, bounced).',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    days: z.number().default(30),
  }),
  outputSchema: z.object({
    finished: z.number(),
    mostly: z.number(),
    sampled: z.number(),
    bounced: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, days } = context

    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.9) as finished,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.7 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.9) as mostly,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) > 0.2 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.7) as sampled,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) <= 0.2) as bounced
      FROM events
      WHERE user_id = $1
      AND created_at >= NOW() - INTERVAL '${days} days'
      AND playhead_sec IS NOT NULL
      AND episode_duration_sec IS NOT NULL`,
      [user_id]
    )

    const row = result.rows[0]
    return {
      finished: parseInt(row.finished, 10),
      mostly: parseInt(row.mostly, 10),
      sampled: parseInt(row.sampled, 10),
      bounced: parseInt(row.bounced, 10),
    }
  },
})

export const getTopPodcastsByFanScore = createTool({
  id: 'get_top_podcasts_by_fan_score',
  description: 'Get top podcasts by Fan Score for a user.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    limit: z.number().default(10),
  }),
  outputSchema: z.object({
    podcasts: z.array(
      z.object({
        podcast_id: z.string().uuid(),
        title: z.string(),
        episode_count: z.number(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { user_id, limit } = context

    const result = await pool.query(
      `SELECT p.podcast_id, p.title, COUNT(DISTINCT e.episode_id) as episode_count
       FROM podcasts p
       JOIN episodes e ON p.podcast_id = e.podcast_id
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE ev.user_id = $1
       GROUP BY p.podcast_id, p.title
       ORDER BY episode_count DESC
       LIMIT $2`,
      [user_id, limit]
    )

    return {
      podcasts: result.rows,
    }
  },
})

export const getTopEpisodesByInfluenceScore = createTool({
  id: 'get_top_episodes_by_influence_score',
  description: 'Get top episodes by Influence Score for a user.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    limit: z.number().default(10),
  }),
  outputSchema: z.object({
    episodes: z.array(
      z.object({
        episode_id: z.string().uuid(),
        title: z.string(),
        influence_score: z.number(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { user_id, limit } = context

    const result = await pool.query(
      `SELECT e.episode_id, e.title,
              COALESCE(SUM(il.similarity), 0) as influence_score
       FROM episodes e
       LEFT JOIN influence_links il ON e.episode_id = il.episode_id
       LEFT JOIN expressions exp ON il.expression_id = exp.expression_id
       WHERE exp.user_id = $1 OR exp.user_id IS NULL
       GROUP BY e.episode_id, e.title
       HAVING COUNT(il.link_id) > 0
       ORDER BY influence_score DESC
       LIMIT $2`,
      [user_id, limit]
    )

    return {
      episodes: result.rows.map((row) => ({
        episode_id: row.episode_id,
        title: row.title,
        influence_score: parseFloat(row.influence_score || 0),
      })),
    }
  },
})

export const getAppointmentListeningTrends = createTool({
  id: 'get_appointment_listening_trends',
  description: 'Get appointment listening trends (same-day, 1-3 days, 1 week, long-tail).',
  inputSchema: z.object({
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    same_day: z.number(),
    one_to_three_days: z.number(),
    one_week: z.number(),
    long_tail: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id } = context

    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 < 1) as same_day,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 1 AND 3) as one_to_three_days,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 3 AND 7) as one_week,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 > 7) as long_tail
      FROM episodes e
      JOIN events ev ON e.episode_id = ev.episode_id
      WHERE ev.user_id = $1
      AND e.release_time IS NOT NULL
      AND ev.event_type = 'play'
      GROUP BY e.episode_id, e.release_time`,
      [user_id]
    )

    const totals = result.rows.reduce(
      (acc, row) => ({
        same_day: acc.same_day + parseInt(row.same_day, 10),
        one_to_three_days: acc.one_to_three_days + parseInt(row.one_to_three_days, 10),
        one_week: acc.one_week + parseInt(row.one_week, 10),
        long_tail: acc.long_tail + parseInt(row.long_tail, 10),
      }),
      { same_day: 0, one_to_three_days: 0, one_week: 0, long_tail: 0 }
    )

    return totals
  },
})

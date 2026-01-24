import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import { calculateCompletionRatio } from './metrics-tools'
import { calculateFanScore } from './fan-score-tools'
import { calculateInfluenceScore } from './influence-score-tools'

export const getDashboardData = createTool({
  id: 'get_dashboard_data',
  description: 'Get comprehensive dashboard data for a user including stats, completion distribution, top podcasts, and influence timeline.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    stats: z.object({
      total_episodes: z.number(),
      total_hours: z.number(),
      completion_rate: z.number(),
    }),
    completion_distribution: z.object({
      finished: z.number(),
      mostly: z.number(),
      sampled: z.number(),
      bounced: z.number(),
    }),
    top_podcasts: z.array(z.any()),
    influence_timeline: z.array(z.any()),
    recent_activity: z.array(z.any()),
  }),
  execute: async ({ context }: any) => {
    const { user_id } = context

    // Get total episodes
    const episodesResult = await pool.query(
      `SELECT COUNT(DISTINCT episode_id) as count
       FROM events
       WHERE user_id = $1`,
      [user_id]
    )
    const total_episodes = parseInt(episodesResult.rows[0].count, 10)

    // Get total hours
    const hoursResult = await pool.query(
      `SELECT SUM(COALESCE(playhead_sec, 0)) / 3600.0 as hours
       FROM events
       WHERE user_id = $1
       AND event_type = 'play'`,
      [user_id]
    )
    const total_hours = parseFloat(hoursResult.rows[0].hours || 0)

    // Get completion distribution
    const completionResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.9) as finished,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.7 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.9) as mostly,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) > 0.2 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.7) as sampled,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) <= 0.2) as bounced
      FROM events
      WHERE user_id = $1
      AND playhead_sec IS NOT NULL
      AND episode_duration_sec IS NOT NULL`,
      [user_id]
    )
    const compRow = completionResult.rows[0]
    const completion_distribution = {
      finished: parseInt(compRow.finished, 10),
      mostly: parseInt(compRow.mostly, 10),
      sampled: parseInt(compRow.sampled, 10),
      bounced: parseInt(compRow.bounced, 10),
    }

    // Calculate average completion rate
    const avgCompletionResult = await pool.query(
      `SELECT AVG(playhead_sec / NULLIF(episode_duration_sec, 0)) as avg_completion
       FROM events
       WHERE user_id = $1
       AND playhead_sec IS NOT NULL
       AND episode_duration_sec IS NOT NULL`,
      [user_id]
    )
    const completion_rate = parseFloat(avgCompletionResult.rows[0].avg_completion || 0)

    // Get top podcasts
    const topPodcastsResult = await pool.query(
      `SELECT p.podcast_id, p.title, COUNT(DISTINCT e.episode_id) as episode_count
       FROM podcasts p
       JOIN episodes e ON p.podcast_id = e.podcast_id
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE ev.user_id = $1
       GROUP BY p.podcast_id, p.title
       ORDER BY episode_count DESC
       LIMIT 10`,
      [user_id]
    )

    // Get recent activity
    const recentActivityResult = await pool.query(
      `SELECT ev.event_id, e.title as episode_title, ev.event_type, ev.timestamp_utc
       FROM events ev
       JOIN episodes e ON ev.episode_id = e.episode_id
       WHERE ev.user_id = $1
       ORDER BY ev.timestamp_utc DESC
       LIMIT 20`,
      [user_id]
    )

    // Get influence timeline (simplified)
    const influenceTimelineResult = await pool.query(
      `SELECT e.episode_id, e.title, e.release_time,
              COALESCE(SUM(il.similarity), 0) as influence_score,
              AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) as completion_ratio
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       LEFT JOIN influence_links il ON e.episode_id = il.episode_id
       WHERE ev.user_id = $1
       GROUP BY e.episode_id, e.title, e.release_time
       HAVING COUNT(ev.event_id) > 0
       ORDER BY e.release_time DESC
       LIMIT 50`,
      [user_id]
    )

    return {
      stats: {
        total_episodes,
        total_hours,
        completion_rate,
      },
      completion_distribution,
      top_podcasts: topPodcastsResult.rows.map((row) => ({
        podcast_id: row.podcast_id,
        title: row.title,
        episode_count: parseInt(row.episode_count, 10),
      })),
      influence_timeline: influenceTimelineResult.rows.map((row) => ({
        date: row.release_time?.toISOString() || new Date().toISOString(),
        influence_score: parseFloat(row.influence_score || 0),
        completion_ratio: parseFloat(row.completion_ratio || 0),
        episode_title: row.title,
      })),
      recent_activity: recentActivityResult.rows.map((row) => ({
        event_id: row.event_id,
        episode_title: row.episode_title,
        event_type: row.event_type,
        timestamp_utc: row.timestamp_utc.toISOString(),
      })),
    }
  },
})

export const getPodcastDetails = createTool({
  id: 'get_podcast_details',
  description: 'Get podcast details with listening stats and fan proof data.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string().nullable(),
    episodes_listened: z.number(),
    avg_completion_rate: z.number(),
    fan_score: z.number(),
    influence_contribution: z.number(),
    appointment_listening: z.any(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id } = context

    // Get podcast info
    const podcastResult = await pool.query(
      'SELECT title, description FROM podcasts WHERE podcast_id = $1',
      [podcast_id]
    )

    if (podcastResult.rows.length === 0) {
      throw new Error('Podcast not found')
    }

    const podcast = podcastResult.rows[0]

    // Get episodes listened
    const episodesResult = await pool.query(
      `SELECT COUNT(DISTINCT e.episode_id) as count
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1 AND ev.user_id = $2`,
      [podcast_id, user_id]
    )
    const episodes_listened = parseInt(episodesResult.rows[0].count, 10)

    // Get average completion
    const completionResult = await pool.query(
      `SELECT AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) as avg_completion
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1 AND ev.user_id = $2
       AND ev.playhead_sec IS NOT NULL AND e.duration_sec IS NOT NULL`,
      [podcast_id, user_id]
    )
    const avg_completion_rate = parseFloat(completionResult.rows[0].avg_completion || 0)

    // Get fan score
    const fanScoreResult = await (calculateFanScore as any).execute({
      context: { podcast_id, user_id },
    })

    // Get influence contribution
    const influenceResult = await pool.query(
      `SELECT COALESCE(SUM(il.similarity), 0) as total_influence,
              COUNT(DISTINCT il.expression_id) as linked_expressions
       FROM episodes e
       JOIN influence_links il ON e.episode_id = il.episode_id
       JOIN expressions exp ON il.expression_id = exp.expression_id
       WHERE e.podcast_id = $1 AND exp.user_id = $2`,
      [podcast_id, user_id]
    )
    const influence_contribution = parseFloat(influenceResult.rows[0].total_influence || 0)

    // Get appointment listening
    const appointmentResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 < 1) as same_day,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 1 AND 3) as one_to_three_days,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 3 AND 7) as one_week,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 > 7) as long_tail
      FROM episodes e
      JOIN events ev ON e.episode_id = ev.episode_id
      WHERE e.podcast_id = $1 AND ev.user_id = $2
      AND e.release_time IS NOT NULL
      AND ev.event_type = 'play'
      GROUP BY e.episode_id, e.release_time`,
      [podcast_id, user_id]
    )

    const appointment = appointmentResult.rows.reduce(
      (acc, row) => ({
        same_day: acc.same_day + parseInt(row.same_day, 10),
        one_to_three_days: acc.one_to_three_days + parseInt(row.one_to_three_days, 10),
        one_week: acc.one_week + parseInt(row.one_week, 10),
        long_tail: acc.long_tail + parseInt(row.long_tail, 10),
      }),
      { same_day: 0, one_to_three_days: 0, one_week: 0, long_tail: 0 }
    )

    return {
      title: podcast.title,
      description: podcast.description,
      episodes_listened,
      avg_completion_rate,
      fan_score: (fanScoreResult as any)?.fan_score || 0,
      influence_contribution,
      appointment_listening: appointment,
    }
  },
})

export const getEpisodeDetails = createTool({
  id: 'get_episode_details',
  description: 'Get episode details with metrics, highlights, topics, and influence events.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string().nullable(),
    completion_ratio: z.number(),
    listen_count: z.number(),
    influence_score: z.number(),
    listen_timestamps: z.array(z.string()),
    highlights: z.array(z.any()),
    topics: z.array(z.string()),
    downstream_influence: z.array(z.any()),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, user_id } = context

    // Get episode info
    const episodeResult = await pool.query(
      'SELECT title, description FROM episodes WHERE episode_id = $1',
      [episode_id]
    )

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found')
    }

    const episode = episodeResult.rows[0]

    // Get completion ratio
    const completionResult = await (calculateCompletionRatio as any).execute({
      context: { episode_id, user_id },
    })

    // Get listen count
    const listenCountResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM events
       WHERE user_id = $1 AND episode_id = $2 AND event_type = 'play'`,
      [user_id, episode_id]
    )
    const listen_count = parseInt(listenCountResult.rows[0].count, 10)

    // Get influence score
    const influenceResult = await (calculateInfluenceScore as any).execute({
      context: { episode_id, user_id },
    })

    // Get listen timestamps
    const timestampsResult = await pool.query(
      `SELECT timestamp_utc
       FROM events
       WHERE user_id = $1 AND episode_id = $2 AND event_type = 'play'
       ORDER BY timestamp_utc ASC`,
      [user_id, episode_id]
    )

    // Get highlights
    const highlightsResult = await pool.query(
      `SELECT playhead_sec, metadata
       FROM events
       WHERE user_id = $1 AND episode_id = $2 AND event_type = 'highlight'
       ORDER BY timestamp_utc ASC`,
      [user_id, episode_id]
    )

    // Get topics (placeholder - would need topic detection)
    const topics: string[] = []

    // Get downstream influence
    const downstreamResult = await pool.query(
      `SELECT exp.text, exp.timestamp_utc, exp.source, il.similarity
       FROM influence_links il
       JOIN expressions exp ON il.expression_id = exp.expression_id
       WHERE il.episode_id = $1 AND exp.user_id = $2
       ORDER BY exp.timestamp_utc DESC`,
      [episode_id, user_id]
    )

    return {
      title: episode.title,
      description: episode.description,
      completion_ratio: (completionResult as any).completion_ratio || 0,
      listen_count,
      influence_score: (influenceResult as any).influence_score || 0,
      listen_timestamps: timestampsResult.rows.map((row) => row.timestamp_utc.toISOString()),
      highlights: highlightsResult.rows.map((row) => ({
        playhead_sec: parseFloat(row.playhead_sec),
        note: row.metadata?.note || null,
        transcript_context: null, // Would need to fetch from transcript_chunks
      })),
      topics,
      downstream_influence: downstreamResult.rows.map((row) => ({
        text: row.text,
        timestamp_utc: row.timestamp_utc.toISOString(),
        source: row.source,
        similarity: parseFloat(row.similarity),
      })),
    }
  },
})

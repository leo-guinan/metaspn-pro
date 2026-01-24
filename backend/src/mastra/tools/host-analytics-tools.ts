import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

/**
 * Get comprehensive analytics for a podcast owned by a host
 */
export const getHostPodcastAnalytics = createTool({
  id: 'get_host_podcast_analytics',
  description: 'Get comprehensive analytics for a podcast including listener stats, episode performance, and growth metrics.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    total_unique_listeners: z.number(),
    total_episode_plays: z.number(),
    total_episodes: z.number(),
    avg_completion_rate: z.number(),
    listener_growth: z.array(
      z.object({
        date: z.string(),
        new_listeners: z.number(),
        total_listeners: z.number(),
      })
    ),
    top_episodes: z.array(
      z.object({
        episode_id: z.string(),
        title: z.string(),
        play_count: z.number(),
        avg_completion_rate: z.number(),
        unique_listeners: z.number(),
      })
    ),
    appointment_listening: z.object({
      same_day: z.number(),
      one_to_three_days: z.number(),
      one_week: z.number(),
      long_tail: z.number(),
    }),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id } = context

    // Total unique listeners
    const uniqueListenersResult = await pool.query(
      `SELECT COUNT(DISTINCT ev.user_id) as count
       FROM events ev
       JOIN episodes e ON ev.episode_id = e.episode_id
       WHERE e.podcast_id = $1`,
      [podcast_id]
    )
    const total_unique_listeners = parseInt(uniqueListenersResult.rows[0].count, 10)

    // Total episode plays
    const totalPlaysResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM events ev
       JOIN episodes e ON ev.episode_id = e.episode_id
       WHERE e.podcast_id = $1 AND ev.event_type = 'play'`,
      [podcast_id]
    )
    const total_episode_plays = parseInt(totalPlaysResult.rows[0].count, 10)

    // Total episodes
    const totalEpisodesResult = await pool.query(
      `SELECT COUNT(*) as count FROM episodes WHERE podcast_id = $1`,
      [podcast_id]
    )
    const total_episodes = parseInt(totalEpisodesResult.rows[0].count, 10)

    // Average completion rate
    const avgCompletionResult = await pool.query(
      `SELECT AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) as avg_completion
       FROM events ev
       JOIN episodes e ON ev.episode_id = e.episode_id
       WHERE e.podcast_id = $1
       AND ev.playhead_sec IS NOT NULL
       AND e.duration_sec IS NOT NULL
       AND ev.event_type = 'play'`,
      [podcast_id]
    )
    const avg_completion_rate = parseFloat(avgCompletionResult.rows[0].avg_completion || 0)

    // Listener growth over time (last 30 days)
    const growthResult = await pool.query(
      `SELECT 
        DATE(ev.timestamp_utc) as date,
        COUNT(DISTINCT ev.user_id) FILTER (WHERE ev.timestamp_utc = (
          SELECT MIN(ev2.timestamp_utc) 
          FROM events ev2 
          WHERE ev2.user_id = ev.user_id 
          AND ev2.episode_id IN (SELECT episode_id FROM episodes WHERE podcast_id = $1)
        )) as new_listeners,
        COUNT(DISTINCT ev.user_id) as total_listeners
       FROM events ev
       JOIN episodes e ON ev.episode_id = e.episode_id
       WHERE e.podcast_id = $1
       AND ev.timestamp_utc >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(ev.timestamp_utc)
       ORDER BY date ASC`,
      [podcast_id]
    )
    const listener_growth = growthResult.rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      new_listeners: parseInt(row.new_listeners || 0, 10),
      total_listeners: parseInt(row.total_listeners, 10),
    }))

    // Top episodes by engagement
    const topEpisodesResult = await pool.query(
      `SELECT 
        e.episode_id,
        e.title,
        COUNT(DISTINCT ev.event_id) FILTER (WHERE ev.event_type = 'play') as play_count,
        AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) FILTER (WHERE ev.playhead_sec IS NOT NULL) as avg_completion_rate,
        COUNT(DISTINCT ev.user_id) as unique_listeners
       FROM episodes e
       LEFT JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1
       GROUP BY e.episode_id, e.title
       ORDER BY play_count DESC
       LIMIT 10`,
      [podcast_id]
    )
    const top_episodes = topEpisodesResult.rows.map((row) => ({
      episode_id: row.episode_id,
      title: row.title,
      play_count: parseInt(row.play_count || 0, 10),
      avg_completion_rate: parseFloat(row.avg_completion_rate || 0),
      unique_listeners: parseInt(row.unique_listeners || 0, 10),
    }))

    // Appointment listening metrics
    const appointmentResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 < 1) as same_day,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 1 AND 3) as one_to_three_days,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 BETWEEN 3 AND 7) as one_week,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (MIN(ev.timestamp_utc) - e.release_time)) / 86400 > 7) as long_tail
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE e.podcast_id = $1
       AND e.release_time IS NOT NULL
       AND ev.event_type = 'play'
       GROUP BY e.episode_id, e.release_time`,
      [podcast_id]
    )

    const appointment = appointmentResult.rows.reduce(
      (acc, row) => ({
        same_day: acc.same_day + parseInt(row.same_day || 0, 10),
        one_to_three_days: acc.one_to_three_days + parseInt(row.one_to_three_days || 0, 10),
        one_week: acc.one_week + parseInt(row.one_week || 0, 10),
        long_tail: acc.long_tail + parseInt(row.long_tail || 0, 10),
      }),
      { same_day: 0, one_to_three_days: 0, one_week: 0, long_tail: 0 }
    )

    return {
      total_unique_listeners,
      total_episode_plays,
      total_episodes,
      avg_completion_rate,
      listener_growth,
      top_episodes,
      appointment_listening: appointment,
    }
  },
})

/**
 * Get analytics for a specific episode
 */
export const getEpisodeAnalytics = createTool({
  id: 'get_episode_analytics',
  description: 'Get detailed analytics for a specific episode including play count, completion rate, and engagement metrics.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    podcast_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    episode_id: z.string(),
    title: z.string(),
    play_count: z.number(),
    unique_listeners: z.number(),
    completion_rate: z.number(),
    bounce_rate: z.number(),
    avg_playhead_position: z.number(),
    engagement_timeline: z.array(
      z.object({
        timestamp: z.string(),
        listeners: z.number(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, podcast_id } = context

    // Get episode info
    const episodeResult = await pool.query(
      `SELECT episode_id, title FROM episodes WHERE episode_id = $1 AND podcast_id = $2`,
      [episode_id, podcast_id]
    )

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found')
    }

    const episode = episodeResult.rows[0]

    // Play count
    const playCountResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM events
       WHERE episode_id = $1 AND event_type = 'play'`,
      [episode_id]
    )
    const play_count = parseInt(playCountResult.rows[0].count, 10)

    // Unique listeners
    const uniqueListenersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM events
       WHERE episode_id = $1 AND event_type = 'play'`,
      [episode_id]
    )
    const unique_listeners = parseInt(uniqueListenersResult.rows[0].count, 10)

    // Completion rate
    const completionResult = await pool.query(
      `SELECT AVG(playhead_sec / NULLIF(episode_duration_sec, 0)) as avg_completion
       FROM events
       WHERE episode_id = $1
       AND playhead_sec IS NOT NULL
       AND episode_duration_sec IS NOT NULL
       AND event_type = 'play'`,
      [episode_id]
    )
    const completion_rate = parseFloat(completionResult.rows[0].avg_completion || 0)

    // Bounce rate (listeners who played less than 20% of episode)
    const bounceResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM events
       WHERE episode_id = $1
       AND event_type = 'play'
       AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.2`,
      [episode_id]
    )
    const bounced = parseInt(bounceResult.rows[0].count, 10)
    const bounce_rate = unique_listeners > 0 ? bounced / unique_listeners : 0

    // Average playhead position
    const avgPlayheadResult = await pool.query(
      `SELECT AVG(playhead_sec / NULLIF(episode_duration_sec, 0)) as avg_position
       FROM events
       WHERE episode_id = $1
       AND playhead_sec IS NOT NULL
       AND episode_duration_sec IS NOT NULL
       AND event_type = 'play'`,
      [episode_id]
    )
    const avg_playhead_position = parseFloat(avgPlayheadResult.rows[0].avg_position || 0)

    // Engagement timeline (listeners over time)
    const timelineResult = await pool.query(
      `SELECT 
        DATE_TRUNC('hour', timestamp_utc) as timestamp,
        COUNT(DISTINCT user_id) as listeners
       FROM events
       WHERE episode_id = $1
       AND event_type = 'play'
       GROUP BY DATE_TRUNC('hour', timestamp_utc)
       ORDER BY timestamp ASC`,
      [episode_id]
    )
    const engagement_timeline = timelineResult.rows.map((row) => ({
      timestamp: row.timestamp.toISOString(),
      listeners: parseInt(row.listeners, 10),
    }))

    return {
      episode_id: episode.episode_id,
      title: episode.title,
      play_count,
      unique_listeners,
      completion_rate,
      bounce_rate,
      avg_playhead_position,
      engagement_timeline,
    }
  },
})

/**
 * Get analytics for guests on a podcast
 */
export const getGuestAnalytics = createTool({
  id: 'get_guest_analytics',
  description: 'Get analytics for guests including appearance counts and episode performance metrics.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    guests: z.array(
      z.object({
        guest_name: z.string(),
        appearance_count: z.number(),
        episodes: z.array(
          z.object({
            episode_id: z.string(),
            title: z.string(),
            play_count: z.number(),
            avg_completion_rate: z.number(),
          })
        ),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id } = context

    // Get all guests for this podcast
    const guestsResult = await pool.query(
      `SELECT DISTINCT eg.guest_name
       FROM episode_guests eg
       JOIN episodes e ON eg.episode_id = e.episode_id
       WHERE e.podcast_id = $1
       ORDER BY eg.guest_name`,
      [podcast_id]
    )

    const guests = await Promise.all(
      guestsResult.rows.map(async (row) => {
        const guest_name = row.guest_name

        // Get episodes featuring this guest
        const episodesResult = await pool.query(
          `SELECT e.episode_id, e.title
           FROM episodes e
           JOIN episode_guests eg ON e.episode_id = eg.episode_id
           WHERE e.podcast_id = $1 AND eg.guest_name = $2`,
          [podcast_id, guest_name]
        )

        const episodes = await Promise.all(
          episodesResult.rows.map(async (epRow) => {
            // Get play count for this episode
            const playCountResult = await pool.query(
              `SELECT COUNT(*) as count
               FROM events
               WHERE episode_id = $1 AND event_type = 'play'`,
              [epRow.episode_id]
            )
            const play_count = parseInt(playCountResult.rows[0].count, 10)

            // Get average completion rate
            const completionResult = await pool.query(
              `SELECT AVG(playhead_sec / NULLIF(episode_duration_sec, 0)) as avg_completion
               FROM events
               WHERE episode_id = $1
               AND playhead_sec IS NOT NULL
               AND episode_duration_sec IS NOT NULL
               AND event_type = 'play'`,
              [epRow.episode_id]
            )
            const avg_completion_rate = parseFloat(completionResult.rows[0].avg_completion || 0)

            return {
              episode_id: epRow.episode_id,
              title: epRow.title,
              play_count,
              avg_completion_rate,
            }
          })
        )

        return {
          guest_name,
          appearance_count: episodes.length,
          episodes,
        }
      })
    )

    return { guests }
  },
})

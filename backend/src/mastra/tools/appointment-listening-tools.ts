import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const calculateListenDelta = createTool({
  id: 'calculate_listen_delta',
  description: 'Calculate time delta between episode release and first listen.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    delta_hours: z.number(),
    delta_days: z.number(),
    first_listen_time: z.string().datetime().nullable(),
    release_time: z.string().datetime().nullable(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, user_id } = context

    // Get episode release time
    const episodeResult = await pool.query(
      'SELECT release_time FROM episodes WHERE episode_id = $1',
      [episode_id]
    )

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found')
    }

    const releaseTime = episodeResult.rows[0].release_time

    if (!releaseTime) {
      return {
        delta_hours: 0,
        delta_days: 0,
        first_listen_time: null,
        release_time: null,
      }
    }

    // Get first listen time
    const firstListenResult = await pool.query(
      `SELECT MIN(timestamp_utc) as first_listen
       FROM events
       WHERE user_id = $1 AND episode_id = $2 AND event_type = 'play'`,
      [user_id, episode_id]
    )

    const firstListenTime = firstListenResult.rows[0]?.first_listen

    if (!firstListenTime) {
      return {
        delta_hours: 0,
        delta_days: 0,
        first_listen_time: null,
        release_time: releaseTime.toISOString(),
      }
    }

    const release = new Date(releaseTime)
    const firstListen = new Date(firstListenTime)
    const deltaMs = firstListen.getTime() - release.getTime()
    const deltaHours = deltaMs / (1000 * 60 * 60)
    const deltaDays = deltaHours / 24

    return {
      delta_hours: deltaHours,
      delta_days: deltaDays,
      first_listen_time: firstListenTime.toISOString(),
      release_time: releaseTime.toISOString(),
    }
  },
})

export const bucketAppointmentListening = createTool({
  id: 'bucket_appointment_listening',
  description: 'Bucket appointment listening into: same-day, 1-3 days, 1 week, or long-tail.',
  inputSchema: z.object({
    delta_days: z.number(),
  }),
  outputSchema: z.object({
    bucket: z.enum(['same-day', '1-3 days', '1 week', 'long-tail']),
  }),
  execute: async ({ context }: any) => {
    const { delta_days } = context

    if (delta_days < 1) {
      return { bucket: 'same-day' as const }
    } else if (delta_days <= 3) {
      return { bucket: '1-3 days' as const }
    } else if (delta_days <= 7) {
      return { bucket: '1 week' as const }
    } else {
      return { bucket: 'long-tail' as const }
    }
  },
})

export const aggregatePodcastAppointmentMetrics = createTool({
  id: 'aggregate_podcast_appointment_metrics',
  description: 'Aggregate appointment listening metrics per podcast for host quality signal.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    same_day_count: z.number(),
    one_to_three_days_count: z.number(),
    one_week_count: z.number(),
    long_tail_count: z.number(),
    total_episodes: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, user_id } = context

    let query = `
      SELECT e.episode_id, e.release_time,
             MIN(ev.timestamp_utc) as first_listen
      FROM episodes e
      JOIN events ev ON e.episode_id = ev.episode_id
      WHERE e.podcast_id = $1
      AND ev.event_type = 'play'
      AND e.release_time IS NOT NULL
    `
    const params: any[] = [podcast_id]

    if (user_id) {
      query += ` AND ev.user_id = $2`
      params.push(user_id)
    }

    query += ` GROUP BY e.episode_id, e.release_time`

    const result = await pool.query(query, params)

    let sameDayCount = 0
    let oneToThreeDaysCount = 0
    let oneWeekCount = 0
    let longTailCount = 0

    for (const row of result.rows) {
      if (!row.first_listen || !row.release_time) continue

      const release = new Date(row.release_time)
      const firstListen = new Date(row.first_listen)
      const deltaMs = firstListen.getTime() - release.getTime()
      const deltaDays = deltaMs / (1000 * 60 * 60 * 24)

      if (deltaDays < 1) {
        sameDayCount++
      } else if (deltaDays <= 3) {
        oneToThreeDaysCount++
      } else if (deltaDays <= 7) {
        oneWeekCount++
      } else {
        longTailCount++
      }
    }

    return {
      same_day_count: sameDayCount,
      one_to_three_days_count: oneToThreeDaysCount,
      one_week_count: oneWeekCount,
      long_tail_count: longTailCount,
      total_episodes: result.rows.length,
    }
  },
})

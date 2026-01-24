import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

const EventSchema = z.object({
  user_id: z.string().uuid(),
  episode_id: z.string().uuid(),
  podcast_id: z.string().uuid(),
  event_type: z.enum(['play', 'pause', 'finish', 'bounce', 'highlight', 'note', 'share']),
  timestamp_utc: z.string().datetime(),
  playhead_sec: z.number().optional(),
  episode_duration_sec: z.number().optional(),
  client: z.enum(['web', 'ios', 'import']),
  metadata: z.record(z.any()).optional(),
})

export const ingestListeningEvent = createTool({
  id: 'ingest_listening_event',
  description: 'Ingest a listening event into the append-only event ledger. Validates event data and stores it immutably.',
  inputSchema: EventSchema,
  outputSchema: z.object({
    event_id: z.string().uuid(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const event = context

    // Validate playhead ranges if provided
    if (event.playhead_sec !== undefined && event.episode_duration_sec !== undefined) {
      if (event.playhead_sec < 0 || event.playhead_sec > event.episode_duration_sec) {
        throw new Error('Invalid playhead: must be between 0 and episode duration')
      }
    }

    // Insert event into database
    const result = await pool.query(
      `INSERT INTO events (
        user_id, episode_id, podcast_id, event_type, 
        timestamp_utc, playhead_sec, episode_duration_sec, 
        client, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING event_id`,
      [
        event.user_id,
        event.episode_id,
        event.podcast_id,
        event.event_type,
        event.timestamp_utc,
        event.playhead_sec ?? null,
        event.episode_duration_sec ?? null,
        event.client,
        JSON.stringify(event.metadata || {}),
      ]
    )

    return {
      event_id: result.rows[0].event_id,
      success: true,
    }
  },
})

export const listEvents = createTool({
  id: 'list_events',
  description: 'List events with optional filters for user, episode, podcast, or date range.',
  inputSchema: z.object({
    user_id: z.string().uuid().optional(),
    episode_id: z.string().uuid().optional(),
    podcast_id: z.string().uuid().optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    limit: z.number().int().positive().max(1000).default(100),
    offset: z.number().int().nonnegative().default(0),
  }),
  outputSchema: z.object({
    events: z.array(z.any()),
    total: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, episode_id, podcast_id, start_date, end_date, limit, offset } = context

    let query = 'SELECT * FROM events WHERE 1=1'
    const params: any[] = []
    let paramCount = 0

    if (user_id) {
      paramCount++
      query += ` AND user_id = $${paramCount}`
      params.push(user_id)
    }

    if (episode_id) {
      paramCount++
      query += ` AND episode_id = $${paramCount}`
      params.push(episode_id)
    }

    if (podcast_id) {
      paramCount++
      query += ` AND podcast_id = $${paramCount}`
      params.push(podcast_id)
    }

    if (start_date) {
      paramCount++
      query += ` AND timestamp_utc >= $${paramCount}`
      params.push(start_date)
    }

    if (end_date) {
      paramCount++
      query += ` AND timestamp_utc <= $${paramCount}`
      params.push(end_date)
    }

    query += ` ORDER BY timestamp_utc DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`
    params.push(limit, offset)

    const result = await pool.query(query, params)

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1'
    const countParams: any[] = []
    let countParamCount = 0

    if (user_id) {
      countParamCount++
      countQuery += ` AND user_id = $${countParamCount}`
      countParams.push(user_id)
    }
    if (episode_id) {
      countParamCount++
      countQuery += ` AND episode_id = $${countParamCount}`
      countParams.push(episode_id)
    }
    if (podcast_id) {
      countParamCount++
      countQuery += ` AND podcast_id = $${countParamCount}`
      countParams.push(podcast_id)
    }
    if (start_date) {
      countParamCount++
      countQuery += ` AND timestamp_utc >= $${countParamCount}`
      countParams.push(start_date)
    }
    if (end_date) {
      countParamCount++
      countQuery += ` AND timestamp_utc <= $${countParamCount}`
      countParams.push(end_date)
    }

    const countResult = await pool.query(countQuery, countParams)
    const total = parseInt(countResult.rows[0].count, 10)

    return {
      events: result.rows,
      total,
    }
  },
})

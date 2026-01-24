import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const saveUserPodcastPreferences = createTool({
  id: 'save_user_podcast_preferences',
  description: 'Store or update listener preferences for a podcast.',
  inputSchema: z.object({
    user_id: z.string().min(1), // Accept any string for now (UUID validation can be added later)
    podcast_id: z.string().uuid(),
    started_listening_date: z.string().date().nullable().optional(),
    listen_regularity: z.enum(['every-episode', 'most-episodes', 'occasional', 'rarely']).nullable().optional(),
    typical_listen_speed: z.enum(['same-day', '1-3-days', '1-week', 'long-tail']).nullable().optional(),
  }),
  outputSchema: z.object({
    preference_id: z.string().uuid(),
    created: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, podcast_id, started_listening_date, listen_regularity, typical_listen_speed } = context

    // Check if preference already exists
    const existing = await pool.query(
      'SELECT preference_id FROM user_podcast_preferences WHERE user_id = $1 AND podcast_id = $2',
      [user_id, podcast_id]
    )

    if (existing.rows.length > 0) {
      // Update existing preference
      const result = await pool.query(
        `UPDATE user_podcast_preferences
         SET started_listening_date = $1,
             listen_regularity = $2,
             typical_listen_speed = $3
         WHERE preference_id = $4
         RETURNING preference_id`,
        [
          started_listening_date ? new Date(started_listening_date) : null,
          listen_regularity || null,
          typical_listen_speed || null,
          existing.rows[0].preference_id,
        ]
      )

      return {
        preference_id: result.rows[0].preference_id,
        created: false,
      }
    }

    // Create new preference
    const result = await pool.query(
      `INSERT INTO user_podcast_preferences (user_id, podcast_id, started_listening_date, listen_regularity, typical_listen_speed)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING preference_id`,
      [
        user_id,
        podcast_id,
        started_listening_date ? new Date(started_listening_date) : null,
        listen_regularity || null,
        typical_listen_speed || null,
      ]
    )

    return {
      preference_id: result.rows[0].preference_id,
      created: true,
    }
  },
})

export const getUserPodcastPreferences = createTool({
  id: 'get_user_podcast_preferences',
  description: 'Retrieve listener preferences for podcasts. Can get all preferences or for a specific podcast.',
  inputSchema: z.object({
    user_id: z.string().min(1), // Accept any string for now (UUID validation can be added later)
    podcast_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    preferences: z.array(
      z.object({
        preference_id: z.string().uuid(),
        podcast_id: z.string().uuid(),
        podcast_title: z.string(),
        started_listening_date: z.string().date().nullable(),
        listen_regularity: z.string().nullable(),
        typical_listen_speed: z.string().nullable(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { user_id, podcast_id } = context

    let query = `
      SELECT 
        up.preference_id,
        up.podcast_id,
        p.title as podcast_title,
        up.started_listening_date,
        up.listen_regularity,
        up.typical_listen_speed
      FROM user_podcast_preferences up
      JOIN podcasts p ON up.podcast_id = p.podcast_id
      WHERE up.user_id = $1
    `
    const params: any[] = [user_id]

    if (podcast_id) {
      query += ' AND up.podcast_id = $2'
      params.push(podcast_id)
    }

    query += ' ORDER BY up.created_at DESC'

    const result = await pool.query(query, params)

    return {
      preferences: result.rows.map((row) => ({
        preference_id: row.preference_id,
        podcast_id: row.podcast_id,
        podcast_title: row.podcast_title,
        started_listening_date: row.started_listening_date
          ? row.started_listening_date.toISOString().split('T')[0]
          : null,
        listen_regularity: row.listen_regularity,
        typical_listen_speed: row.typical_listen_speed,
      })),
    }
  },
})

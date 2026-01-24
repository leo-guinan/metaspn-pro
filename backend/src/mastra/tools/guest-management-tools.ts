import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

/**
 * Add a guest to an episode
 */
export const addEpisodeGuest = createTool({
  id: 'add_episode_guest',
  description: 'Add a guest to an episode with optional metadata.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    guest_name: z.string(),
    guest_role: z.enum(['guest', 'co-host', 'host']).optional().default('guest'),
    metadata: z.record(z.any()).optional(),
  }),
  outputSchema: z.object({
    guest_id: z.string().uuid(),
    episode_id: z.string().uuid(),
    guest_name: z.string(),
    guest_role: z.string(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, guest_name, guest_role = 'guest', metadata = {} } = context

    // Check if episode exists
    const episodeCheck = await pool.query('SELECT episode_id FROM episodes WHERE episode_id = $1', [
      episode_id,
    ])

    if (episodeCheck.rows.length === 0) {
      throw new Error('Episode not found')
    }

    // Check if guest already exists for this episode
    const existing = await pool.query(
      'SELECT guest_id FROM episode_guests WHERE episode_id = $1 AND guest_name = $2',
      [episode_id, guest_name]
    )

    if (existing.rows.length > 0) {
      // Update existing guest
      await pool.query(
        `UPDATE episode_guests 
         SET guest_role = $1, metadata = $2, updated_at = NOW()
         WHERE guest_id = $3`,
        [guest_role, JSON.stringify(metadata), existing.rows[0].guest_id]
      )

      return {
        guest_id: existing.rows[0].guest_id,
        episode_id,
        guest_name,
        guest_role,
      }
    }

    // Create new guest
    const result = await pool.query(
      `INSERT INTO episode_guests (episode_id, guest_name, guest_role, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING guest_id`,
      [episode_id, guest_name, guest_role, JSON.stringify(metadata)]
    )

    return {
      guest_id: result.rows[0].guest_id,
      episode_id,
      guest_name,
      guest_role,
    }
  },
})

/**
 * Get all guests for an episode
 */
export const getEpisodeGuests = createTool({
  id: 'get_episode_guests',
  description: 'Get all guests for a specific episode.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    guests: z.array(
      z.object({
        guest_id: z.string().uuid(),
        guest_name: z.string(),
        guest_role: z.string(),
        metadata: z.record(z.any()),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { episode_id } = context

    const result = await pool.query(
      `SELECT guest_id, guest_name, guest_role, metadata
       FROM episode_guests
       WHERE episode_id = $1
       ORDER BY guest_name`,
      [episode_id]
    )

    return {
      guests: result.rows.map((row) => ({
        guest_id: row.guest_id,
        guest_name: row.guest_name,
        guest_role: row.guest_role,
        metadata: row.metadata || {},
      })),
    }
  },
})

/**
 * Get all unique guests across a podcast
 */
export const getPodcastGuests = createTool({
  id: 'get_podcast_guests',
  description: 'Get all unique guests across all episodes of a podcast with appearance counts.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
  }),
  outputSchema: z.object({
    guests: z.array(
      z.object({
        guest_name: z.string(),
        appearance_count: z.number(),
        episodes: z.array(
          z.object({
            episode_id: z.string().uuid(),
            title: z.string(),
            guest_role: z.string(),
          })
        ),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id } = context

    // Get all unique guests with their episodes
    const result = await pool.query(
      `SELECT 
        eg.guest_name,
        COUNT(DISTINCT eg.episode_id) as appearance_count,
        array_agg(
          json_build_object(
            'episode_id', e.episode_id,
            'title', e.title,
            'guest_role', eg.guest_role
          )
        ) as episodes
       FROM episode_guests eg
       JOIN episodes e ON eg.episode_id = e.episode_id
       WHERE e.podcast_id = $1
       GROUP BY eg.guest_name
       ORDER BY appearance_count DESC, eg.guest_name`,
      [podcast_id]
    )

    return {
      guests: result.rows.map((row) => ({
        guest_name: row.guest_name,
        appearance_count: parseInt(row.appearance_count, 10),
        episodes: row.episodes || [],
      })),
    }
  },
})

/**
 * Update guest information
 */
export const updateEpisodeGuest = createTool({
  id: 'update_episode_guest',
  description: 'Update guest information for an episode.',
  inputSchema: z.object({
    guest_id: z.string().uuid(),
    guest_name: z.string().optional(),
    guest_role: z.enum(['guest', 'co-host', 'host']).optional(),
    metadata: z.record(z.any()).optional(),
  }),
  outputSchema: z.object({
    guest_id: z.string().uuid(),
    guest_name: z.string(),
    guest_role: z.string(),
    metadata: z.record(z.any()),
  }),
  execute: async ({ context }: any) => {
    const { guest_id, guest_name, guest_role, metadata } = context

    // Check if guest exists
    const existing = await pool.query('SELECT * FROM episode_guests WHERE guest_id = $1', [guest_id])

    if (existing.rows.length === 0) {
      throw new Error('Guest not found')
    }

    const current = existing.rows[0]

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (guest_name !== undefined) {
      updates.push(`guest_name = $${paramIndex++}`)
      params.push(guest_name)
    }

    if (guest_role !== undefined) {
      updates.push(`guest_role = $${paramIndex++}`)
      params.push(guest_role)
    }

    if (metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`)
      params.push(JSON.stringify(metadata))
    }

    if (updates.length === 0) {
      // No updates, return current data
      return {
        guest_id: current.guest_id,
        guest_name: current.guest_name,
        guest_role: current.guest_role,
        metadata: current.metadata || {},
      }
    }

    updates.push(`updated_at = NOW()`)
    params.push(guest_id)

    const query = `UPDATE episode_guests SET ${updates.join(', ')} WHERE guest_id = $${paramIndex} RETURNING *`

    const result = await pool.query(query, params)

    return {
      guest_id: result.rows[0].guest_id,
      guest_name: result.rows[0].guest_name,
      guest_role: result.rows[0].guest_role,
      metadata: result.rows[0].metadata || {},
    }
  },
})

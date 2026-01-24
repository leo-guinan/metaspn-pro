import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { pool } from '../../db'

const gatherUserMetricsStep = createStep({
  id: 'gather_user_metrics',
  inputSchema: z.object({
    user_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    user_ids: z.array(z.string().uuid()),
  }),
  execute: async ({ inputData }: any) => {
    const { user_id } = inputData

    if (!user_id) {
      // Process all users
      const usersResult = await pool.query('SELECT user_id FROM users')
      return { user_ids: usersResult.rows.map((r) => r.user_id) }
    }

    return { user_ids: [user_id] }
  },
})

const generateDigestsStep = createStep({
  id: 'generate_digests',
  inputSchema: z.object({
    user_ids: z.array(z.string().uuid()),
  }),
  outputSchema: z.object({
    generated: z.array(z.string()),
    total: z.number(),
  }),
  execute: async ({ inputData }: any) => {
    const { user_ids } = inputData
    const generated: string[] = []

    for (const uid of user_ids) {
      try {
        // Gather monthly metrics
        const metrics = {
          total_episodes: 0,
          total_hours: 0,
          completion_distribution: {
            finished: 0,
            mostly: 0,
            sampled: 0,
            bounced: 0,
          },
          top_podcasts: [] as any[],
          top_episodes_by_influence: [] as any[],
        }

        // Total episodes listened
        const episodesResult = await pool.query(
          `SELECT COUNT(DISTINCT episode_id) as count
           FROM events
           WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
          [uid]
        )
        metrics.total_episodes = parseInt(episodesResult.rows[0].count, 10)

        // Total hours (approximate)
        const hoursResult = await pool.query(
          `SELECT SUM(COALESCE(playhead_sec, 0)) / 3600.0 as hours
           FROM events
           WHERE user_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
           AND event_type = 'play'`,
          [uid]
        )
        metrics.total_hours = parseFloat(hoursResult.rows[0].hours || 0)

        // Top podcasts by fan score (simplified - count episodes)
        const topPodcastsResult = await pool.query(
          `SELECT p.podcast_id, p.title, COUNT(DISTINCT e.episode_id) as episode_count
           FROM podcasts p
           JOIN episodes e ON p.podcast_id = e.podcast_id
           JOIN events ev ON e.episode_id = ev.episode_id
           WHERE ev.user_id = $1
           AND ev.created_at >= NOW() - INTERVAL '30 days'
           GROUP BY p.podcast_id, p.title
           ORDER BY episode_count DESC
           LIMIT 5`,
          [uid]
        )
        metrics.top_podcasts = topPodcastsResult.rows

        // Generate markdown report
        const reportContent = `# Monthly Influence Digest

## Overview
- Total Episodes Listened: ${metrics.total_episodes}
- Total Hours: ${metrics.total_hours.toFixed(1)}

## Top Podcasts
${metrics.top_podcasts.map((p, i) => `${i + 1}. ${p.title} (${p.episode_count} episodes)`).join('\n')}

Generated on ${new Date().toISOString()}
`

        // Store report
        await pool.query(
          `INSERT INTO reports (user_id, report_type, content, metadata)
           VALUES ($1, $2, $3, $4)`,
          [uid, 'monthly', reportContent, JSON.stringify(metrics)]
        )

        generated.push(uid)
      } catch (error) {
        console.error(`Failed to generate digest for user ${uid}:`, error)
      }
    }

    return { generated, total: user_ids.length }
  },
})

export const monthlyDigestWorkflow = createWorkflow({
  id: 'monthly_digest_workflow',
  inputSchema: z.object({
    user_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    generated: z.array(z.string()),
    total: z.number(),
  }),
})
  .then(gatherUserMetricsStep)
  .then(generateDigestsStep)
  .commit()

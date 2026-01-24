import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { pool } from '../../db'
import { dailyReportAgent } from '../agents/daily-report-agent'

const gatherMetricsStep = createStep({
  id: 'gather_metrics',
  inputSchema: z.object({}),
  outputSchema: z.object({
    metrics: z.object({
      total_events: z.number(),
      total_users: z.number(),
      total_episodes_listened: z.number(),
      completion_distribution: z.object({
        finished: z.number(),
        mostly: z.number(),
        sampled: z.number(),
        bounced: z.number(),
      }),
      top_podcasts: z.array(z.any()),
    }),
  }),
  execute: async (): Promise<any> => {
    // Gather key metrics from the database
    const metrics = {
      total_events: 0,
      total_users: 0,
      total_episodes_listened: 0,
      completion_distribution: {
        finished: 0,
        mostly: 0,
        sampled: 0,
        bounced: 0,
      },
      top_podcasts: [] as any[],
    }

    // Total events
    const eventsResult = await pool.query(
      "SELECT COUNT(*) as count FROM events WHERE created_at >= NOW() - INTERVAL '1 day'"
    )
    metrics.total_events = parseInt(eventsResult.rows[0].count, 10)

    // Total active users
    const usersResult = await pool.query(
      "SELECT COUNT(DISTINCT user_id) as count FROM events WHERE created_at >= NOW() - INTERVAL '1 day'"
    )
    metrics.total_users = parseInt(usersResult.rows[0].count, 10)

    // Total episodes listened
    const episodesResult = await pool.query(
      "SELECT COUNT(DISTINCT episode_id) as count FROM events WHERE created_at >= NOW() - INTERVAL '1 day'"
    )
    metrics.total_episodes_listened = parseInt(episodesResult.rows[0].count, 10)

    // Completion distribution (approximate from events)
    const completionResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.9) as finished,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) >= 0.7 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.9) as mostly,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) > 0.2 AND playhead_sec / NULLIF(episode_duration_sec, 0) < 0.7) as sampled,
        COUNT(*) FILTER (WHERE playhead_sec / NULLIF(episode_duration_sec, 0) <= 0.2) as bounced
      FROM events
      WHERE created_at >= NOW() - INTERVAL '1 day'
      AND playhead_sec IS NOT NULL
      AND episode_duration_sec IS NOT NULL
    `)
    const compRow = completionResult.rows[0]
    metrics.completion_distribution = {
      finished: parseInt(compRow.finished, 10),
      mostly: parseInt(compRow.mostly, 10),
      sampled: parseInt(compRow.sampled, 10),
      bounced: parseInt(compRow.bounced, 10),
    }

    // Top podcasts by event count
    const topPodcastsResult = await pool.query(`
      SELECT p.podcast_id, p.title, COUNT(*) as event_count
      FROM podcasts p
      JOIN events e ON p.podcast_id = e.podcast_id
      WHERE e.created_at >= NOW() - INTERVAL '1 day'
      GROUP BY p.podcast_id, p.title
      ORDER BY event_count DESC
      LIMIT 10
    `)
    metrics.top_podcasts = topPodcastsResult.rows

    return { metrics }
  },
})

const generateReportStep = createStep({
  id: 'generate_report',
  inputSchema: z.object({
    metrics: z.object({
      total_events: z.number(),
      total_users: z.number(),
      total_episodes_listened: z.number(),
      completion_distribution: z.any(),
      top_podcasts: z.array(z.any()),
    }),
  }),
  outputSchema: z.object({
    report_content: z.string(),
    metrics: z.any(),
  }),
  execute: async ({ inputData }: any) => {
    const metrics = inputData.metrics

    // Use agent to analyze and generate report
    const reportPrompt = `Based on the following metrics from the last 24 hours, generate a daily analytics report.

Metrics:
- Total events: ${metrics.total_events}
- Active users: ${metrics.total_users}
- Episodes listened: ${metrics.total_episodes_listened}
- Completion distribution:
  - Finished: ${metrics.completion_distribution.finished}
  - Mostly: ${metrics.completion_distribution.mostly}
  - Sampled: ${metrics.completion_distribution.sampled}
  - Bounced: ${metrics.completion_distribution.bounced}
- Top podcasts: ${metrics.top_podcasts.map((p: any) => `${p.title} (${p.event_count} events)`).join(', ')}

Please provide:
1. Top insights about listener behavior
2. Anomalies or patterns worth investigating
3. One actionable recommendation for product improvement

Format the response as markdown.`

    const reportResult = await (dailyReportAgent as any).generate({
      messages: [{ role: 'user', content: reportPrompt }],
    })

    return {
      report_content: (reportResult as any).text || (reportResult as any).content || JSON.stringify(reportResult),
      metrics,
    }
  },
})

const storeReportStep = createStep({
  id: 'store_report',
  inputSchema: z.object({
    report_content: z.string(),
    metrics: z.any(),
  }),
  outputSchema: z.object({
    report_id: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ inputData }: any) => {
    const { report_content, metrics } = inputData

    // Store report in database
    const result = await pool.query(
      `INSERT INTO reports (report_type, content, metadata)
       VALUES ($1, $2, $3)
       RETURNING report_id`,
      ['daily', report_content, JSON.stringify(metrics)]
    )

    return {
      report_id: result.rows[0].report_id,
      success: true,
    }
  },
})

export const generateDailyReportWorkflow = createWorkflow({
  id: 'generate_daily_report_workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    report_id: z.string(),
    success: z.boolean(),
  }),
})
  .then(gatherMetricsStep)
  .then(generateReportStep)
  .then(storeReportStep)
  .commit()

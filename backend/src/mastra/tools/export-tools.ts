import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const exportFanSummary = createTool({
  id: 'export_fan_summary',
  description: 'Export fan summary report in JSON, Markdown, or PDF format.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    podcast_id: z.string().uuid().optional(),
    format: z.enum(['json', 'markdown', 'pdf']).default('markdown'),
  }),
  outputSchema: z.object({
    content: z.string(),
    format: z.string(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, podcast_id, format } = context

    // Get fan score data
    let query = `
      SELECT p.podcast_id, p.title, COUNT(DISTINCT e.episode_id) as episodes_listened,
             AVG(ev.playhead_sec / NULLIF(e.duration_sec, 0)) as avg_completion
      FROM podcasts p
      JOIN episodes e ON p.podcast_id = e.podcast_id
      JOIN events ev ON e.episode_id = ev.episode_id
      WHERE ev.user_id = $1
    `
    const params: any[] = [user_id]

    if (podcast_id) {
      query += ` AND p.podcast_id = $2`
      params.push(podcast_id)
    }

    query += ` GROUP BY p.podcast_id, p.title ORDER BY episodes_listened DESC`

    const result = await pool.query(query, params)

    if (format === 'json') {
      return {
        content: JSON.stringify(result.rows, null, 2),
        format: 'json',
      }
    }

    // Markdown format
    let markdown = `# Fan Summary\n\n`
    for (const row of result.rows) {
      markdown += `## ${row.title}\n`
      markdown += `- Episodes Listened: ${row.episodes_listened}\n`
      markdown += `- Average Completion: ${(parseFloat(row.avg_completion || 0) * 100).toFixed(1)}%\n\n`
    }

    if (format === 'pdf') {
      // For PDF, return markdown (would need a PDF library like puppeteer in production)
      return {
        content: markdown,
        format: 'pdf',
      }
    }

    return {
      content: markdown,
      format: 'markdown',
    }
  },
})

export const exportInfluenceDigest = createTool({
  id: 'export_influence_digest',
  description: 'Export influence digest report in JSON, Markdown, or PDF format.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    format: z.enum(['json', 'markdown', 'pdf']).default('markdown'),
  }),
  outputSchema: z.object({
    content: z.string(),
    format: z.string(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, format } = context

    // Get latest monthly report
    const reportResult = await pool.query(
      `SELECT content, metadata FROM reports
       WHERE user_id = $1 AND report_type = 'monthly'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id]
    )

    if (reportResult.rows.length === 0) {
      throw new Error('No monthly report found for user')
    }

    const report = reportResult.rows[0]

    if (format === 'json') {
      return {
        content: JSON.stringify({
          content: report.content,
          metadata: report.metadata,
        }, null, 2),
        format: 'json',
      }
    }

    // Markdown or PDF
    if (format === 'pdf') {
      // For PDF, return markdown (would need a PDF library in production)
      return {
        content: report.content,
        format: 'pdf',
      }
    }

    return {
      content: report.content,
      format: 'markdown',
    }
  },
})

export const exportEventLedger = createTool({
  id: 'export_event_ledger',
  description: 'Export event ledger in JSONL or CSV format.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    format: z.enum(['jsonl', 'csv']).default('jsonl'),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
  }),
  outputSchema: z.object({
    content: z.string(),
    format: z.string(),
    event_count: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, format, start_date, end_date } = context

    let query = `SELECT * FROM events WHERE user_id = $1`
    const params: any[] = [user_id]

    if (start_date) {
      query += ` AND timestamp_utc >= $${params.length + 1}`
      params.push(start_date)
    }

    if (end_date) {
      query += ` AND timestamp_utc <= $${params.length + 1}`
      params.push(end_date)
    }

    query += ` ORDER BY timestamp_utc ASC`

    const result = await pool.query(query, params)

    if (format === 'jsonl') {
      const lines = result.rows.map((row) => JSON.stringify(row))
      return {
        content: lines.join('\n'),
        format: 'jsonl',
        event_count: result.rows.length,
      }
    }

    // CSV format
    if (result.rows.length === 0) {
      return {
        content: '',
        format: 'csv',
        event_count: 0,
      }
    }

    const headers = Object.keys(result.rows[0]).join(',')
    const rows = result.rows.map((row) =>
      Object.values(row)
        .map((val) => {
          if (val === null) return ''
          if (typeof val === 'object') return JSON.stringify(val)
          return String(val).replace(/,/g, ';')
        })
        .join(',')
    )

    return {
      content: [headers, ...rows].join('\n'),
      format: 'csv',
      event_count: result.rows.length,
    }
  },
})

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'

export const findRecentEpisodes = createTool({
  id: 'find_recent_episodes',
  description: 'Find episodes listened by a user in the last N days (default: 30).',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    days: z.number().default(30),
  }),
  outputSchema: z.object({
    episodes: z.array(
      z.object({
        episode_id: z.string().uuid(),
        podcast_id: z.string().uuid(),
        title: z.string(),
        last_listen_time: z.string().datetime(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { user_id, days } = context

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const result = await pool.query(
      `SELECT DISTINCT e.episode_id, e.podcast_id, e.title,
              MAX(ev.timestamp_utc) as last_listen_time
       FROM episodes e
       JOIN events ev ON e.episode_id = ev.episode_id
       WHERE ev.user_id = $1
       AND ev.timestamp_utc >= $2
       GROUP BY e.episode_id, e.podcast_id, e.title
       ORDER BY last_listen_time DESC`,
      [user_id, cutoffDate.toISOString()]
    )

    return {
      episodes: result.rows.map((row) => ({
        episode_id: row.episode_id,
        podcast_id: row.podcast_id,
        title: row.title,
        last_listen_time: row.last_listen_time.toISOString(),
      })),
    }
  },
})

export const getTranscriptChunks = createTool({
  id: 'get_transcript_chunks',
  description: 'Retrieve transcript chunks for episodes with their embeddings.',
  inputSchema: z.object({
    episode_ids: z.array(z.string().uuid()),
  }),
  outputSchema: z.object({
    chunks: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        episode_id: z.string().uuid(),
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        embedding: z.array(z.number()),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { episode_ids } = context

    if (episode_ids.length === 0) {
      return { chunks: [] }
    }

    const placeholders = episode_ids.map((_: any, i: number) => `$${i + 1}`).join(',')
    const result = await pool.query(
      `SELECT chunk_id, episode_id, start_sec, end_sec, text, embedding
       FROM transcript_chunks
       WHERE episode_id IN (${placeholders})
       ORDER BY episode_id, start_sec`,
      episode_ids
    )

    return {
      chunks: result.rows.map((row) => ({
        chunk_id: row.chunk_id,
        episode_id: row.episode_id,
        start_sec: parseFloat(row.start_sec),
        end_sec: parseFloat(row.end_sec),
        text: row.text,
        embedding: Array.isArray(row.embedding) ? row.embedding : JSON.parse(row.embedding),
      })),
    }
  },
})

export const computeSimilarity = createTool({
  id: 'compute_similarity',
  description: 'Compute cosine similarity between expression embedding and transcript chunk embeddings using pgvector.',
  inputSchema: z.object({
    expression_embedding: z.array(z.number()),
    chunk_embeddings: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        embedding: z.array(z.number()),
      })
    ),
    threshold: z.number().default(0.3),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        similarity: z.number(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { expression_embedding, chunk_embeddings, threshold } = context

    // Cosine similarity function
    const cosineSimilarity = (a: number[], b: number[]): number => {
      if (a.length !== b.length) return 0

      let dotProduct = 0
      let normA = 0
      let normB = 0

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
      }

      const denominator = Math.sqrt(normA) * Math.sqrt(normB)
      return denominator === 0 ? 0 : dotProduct / denominator
    }

    const matches: Array<{ chunk_id: string; similarity: number }> = []

    for (const chunk of chunk_embeddings) {
      const similarity = cosineSimilarity(expression_embedding, chunk.embedding)
      if (similarity >= threshold) {
        matches.push({
          chunk_id: chunk.chunk_id,
          similarity,
        })
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity)

    return { matches }
  },
})

export const createInfluenceLink = createTool({
  id: 'create_influence_link',
  description: 'Create an influence link record between an expression and a transcript chunk.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    expression_id: z.string().uuid(),
    chunk_id: z.string().uuid().optional(),
    similarity: z.number().min(0).max(1),
    days_after_listen: z.number().optional(),
  }),
  outputSchema: z.object({
    link_id: z.string().uuid(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, expression_id, chunk_id, similarity, days_after_listen } = context

    // Check if link already exists
    const existingResult = await pool.query(
      `SELECT link_id FROM influence_links
       WHERE episode_id = $1 AND expression_id = $2 AND chunk_id = $3`,
      [episode_id, expression_id, chunk_id || null]
    )

    if (existingResult.rows.length > 0) {
      // Update existing link
      await pool.query(
        `UPDATE influence_links
         SET similarity = $1, days_after_listen = $2
         WHERE link_id = $3`,
        [similarity, days_after_listen || null, existingResult.rows[0].link_id]
      )

      return {
        link_id: existingResult.rows[0].link_id,
        success: true,
      }
    }

    // Create new link
    const result = await pool.query(
      `INSERT INTO influence_links (episode_id, expression_id, chunk_id, similarity, days_after_listen)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING link_id`,
      [episode_id, expression_id, chunk_id || null, similarity, days_after_listen || null]
    )

    return {
      link_id: result.rows[0].link_id,
      success: true,
    }
  },
})

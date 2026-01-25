import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import { getTranscriptChunksCollection } from '../../services/chroma.js'

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
  description: 'Retrieve transcript chunks for episodes. Returns text from PostgreSQL, embeddings fetched from Chroma if needed.',
  inputSchema: z.object({
    episode_ids: z.array(z.string().uuid()),
    include_embeddings: z.boolean().default(false),
  }),
  outputSchema: z.object({
    chunks: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        episode_id: z.string().uuid(),
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        embedding: z.array(z.number()).optional(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { episode_ids, include_embeddings } = context

    if (episode_ids.length === 0) {
      return { chunks: [] }
    }

    // Get chunks from PostgreSQL
    const placeholders = episode_ids.map((_: any, i: number) => `$${i + 1}`).join(',')
    const result = await pool.query(
      `SELECT chunk_id, episode_id, start_sec, end_sec, text, chroma_id
       FROM transcript_chunks
       WHERE episode_id IN (${placeholders})
       ORDER BY episode_id, start_sec`,
      episode_ids
    )

    const chunks = result.rows.map((row) => ({
      chunk_id: row.chunk_id,
      episode_id: row.episode_id,
      start_sec: parseFloat(row.start_sec),
      end_sec: parseFloat(row.end_sec),
      text: row.text,
    }))

    // If embeddings are needed, fetch from Chroma
    if (include_embeddings) {
      const collection = await getTranscriptChunksCollection()
      const chromaIds = result.rows
        .filter((r) => r.chroma_id)
        .map((r) => r.chroma_id)

      if (chromaIds.length > 0) {
        try {
          const chromaResults = await collection.get({ ids: chromaIds })
          const embeddingMap = new Map<string, number[]>()
          
          if (chromaResults.embeddings) {
            chromaIds.forEach((id, idx) => {
              if (chromaResults.embeddings && chromaResults.embeddings[idx]) {
                embeddingMap.set(id, chromaResults.embeddings[idx] as number[])
              }
            })
          }

          // Add embeddings to chunks (if needed)
          chunks.forEach((chunk) => {
            const row = result.rows.find((r) => r.chunk_id === chunk.chunk_id)
            if (row?.chroma_id && embeddingMap.has(row.chroma_id)) {
              // Type assertion needed since embedding is optional
              ;(chunk as any).embedding = embeddingMap.get(row.chroma_id)!
            }
          })
        } catch (error) {
          console.warn('Error fetching embeddings from Chroma:', error)
        }
      }
    }

    return { chunks }
  },
})

export const findSimilarChunks = createTool({
  id: 'find_similar_chunks',
  description: 'Find similar transcript chunks using Chroma Cloud vector search.',
  inputSchema: z.object({
    expression_embedding: z.array(z.number()),
    episode_ids: z.array(z.string().uuid()).optional(),
    limit: z.number().default(10),
    threshold: z.number().default(0.3),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        episode_id: z.string().uuid(),
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        similarity: z.number(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { expression_embedding, episode_ids, limit, threshold } = context
    const collection = await getTranscriptChunksCollection()

    // Build where clause for Chroma
    const where: any = {}
    if (episode_ids && episode_ids.length > 0) {
      where.episode_id = { $in: episode_ids }
    }

    // Query Chroma for similar chunks
    const results = await collection.query({
      queryEmbeddings: [expression_embedding],
      nResults: limit,
      where: Object.keys(where).length > 0 ? where : undefined,
    })

    // Get chunk IDs and similarities from Chroma results
    const chromaIds = results.ids[0] || []
    // Chroma returns distances (lower is more similar), convert to similarity (higher is more similar)
    const distances = results.distances?.[0] || []
    const similarities = distances
      .filter((d): d is number => d !== null && d !== undefined)
      .map((d: number) => 1 - d) // Convert distance to similarity
    const metadatas = (results.metadatas?.[0] || []) as Array<Record<string, string | number | boolean> | null>

    if (chromaIds.length === 0) {
      return { matches: [] }
    }

    // Fetch full chunk data from PostgreSQL using chroma_id
    const placeholders = chromaIds.map((_: string, i: number) => `$${i + 1}`).join(',')
    const dbResult = await pool.query(
      `SELECT chunk_id, episode_id, start_sec, end_sec, text
       FROM transcript_chunks
       WHERE chroma_id IN (${placeholders})`,
      chromaIds
    )

    // Create a map of chroma_id to database row
    const chunkMap = new Map<string, any>()
    dbResult.rows.forEach((row) => {
      // Find the chroma_id that matches this chunk
      const idx = chromaIds.findIndex((id) => {
        // Match by checking if metadata episode_id and start_sec match
        const metadata = metadatas[chromaIds.indexOf(id)]
        if (!metadata) return false
        const episodeId = String(metadata.episode_id || '')
        const startSec = String(metadata.start_sec || '0')
        return (
          episodeId === row.episode_id &&
          parseFloat(startSec) === parseFloat(row.start_sec)
        )
      })
      if (idx >= 0 && idx < similarities.length) {
        chunkMap.set(chromaIds[idx], { ...row, similarity: similarities[idx] })
      }
    })

    // Combine Chroma results with PostgreSQL data
    const matches = chromaIds
      .map((chromaId, idx) => {
        const chunk = chunkMap.get(chromaId)
        if (!chunk) return null

        return {
          chunk_id: chunk.chunk_id,
          episode_id: chunk.episode_id,
          start_sec: parseFloat(chunk.start_sec),
          end_sec: parseFloat(chunk.end_sec),
          text: chunk.text,
          similarity: chunk.similarity || similarities[idx] || 0,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null && m.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity) // Sort by similarity descending

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

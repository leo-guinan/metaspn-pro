import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { pool } from '../../db'
import { findRecentEpisodes, findSimilarChunks, createInfluenceLink } from '../tools/influence-linking-tools'
import { getExpressionsCollection } from '../../services/chroma.js'
import { safeExecuteTool } from '../utils/tool-helpers'

const findNewExpressionsStep = createStep({
  id: 'find_new_expressions',
  inputSchema: z.object({
    expression_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    expressions: z.array(
      z.object({
        expression_id: z.string(),
        user_id: z.string(),
        text: z.string(),
        embedding: z.any(),
        timestamp_utc: z.string(),
      })
    ),
  }),
  execute: async ({ inputData }: any) => {
    // Find expressions that haven't been linked yet
    let query = `
      SELECT e.expression_id, e.user_id, e.text, e.chroma_id, e.timestamp_utc
      FROM expressions e
      WHERE NOT EXISTS (
        SELECT 1 FROM influence_links il WHERE il.expression_id = e.expression_id
      )
      AND e.chroma_id IS NOT NULL
    `
    const params: any[] = []

    if (inputData.expression_id) {
      query += ` AND e.expression_id = $1`
      params.push(inputData.expression_id)
    } else {
      // Only process expressions from last 7 days
      query += ` AND e.created_at >= NOW() - INTERVAL '7 days'`
    }

    query += ` ORDER BY e.created_at DESC LIMIT 100`

    const result = await pool.query(query, params)
    return { expressions: result.rows }
  },
})

const processExpressionsStep = createStep({
  id: 'process_expressions',
  inputSchema: z.object({
    expressions: z.array(z.any()),
  }),
  outputSchema: z.object({
    processed: z.array(z.string()),
    failed: z.array(z.string()),
    total: z.number(),
  }),
  execute: async ({ inputData }: any) => {
    const expressions = inputData.expressions
    const processed: string[] = []
    const failed: string[] = []

    for (const expression of expressions) {
      try {
        const user_id = expression.user_id
        const chromaId = expression.chroma_id

        if (!chromaId) {
          console.warn(`Expression ${expression.expression_id} has no chroma_id, skipping`)
          continue
        }

        // Get expression embedding from Chroma
        const expressionsCollection = await getExpressionsCollection()
        const chromaResult = await expressionsCollection.get({ ids: [chromaId] })
        
        if (!chromaResult.embeddings || chromaResult.embeddings.length === 0) {
          console.warn(`No embedding found in Chroma for expression ${expression.expression_id}`)
          continue
        }

        const expression_embedding = chromaResult.embeddings[0] as number[]

        // Find recent episodes
        const episodesResult = await safeExecuteTool<{ episodes: Array<{ episode_id: string; podcast_id: string; title: string; last_listen_time: string }> }>(
          findRecentEpisodes,
          { user_id, days: 30 }
        )

        if (episodesResult.episodes.length === 0) {
          continue
        }

        const episode_ids = episodesResult.episodes.map((e: any) => e.episode_id)

        // Find similar chunks using Chroma
        const similarityResult = await safeExecuteTool<{ matches: Array<{ chunk_id: string; episode_id: string; start_sec: number; end_sec: number; text: string; similarity: number }> }>(
          findSimilarChunks,
          {
            expression_embedding,
            episode_ids,
            limit: 20,
            threshold: 0.3,
          }
        )

        if (similarityResult.matches.length === 0) {
          continue
        }

        // Create influence links
        for (const match of similarityResult.matches) {
          // Find episode for this chunk
          const episode = episodesResult.episodes.find((e: any) => e.episode_id === match.episode_id)
          if (!episode) continue

          // Calculate days_after_listen
          const expressionDate = new Date(expression.timestamp_utc)
          const lastListenDate = new Date(episode.last_listen_time)
          const daysAfterListen = (expressionDate.getTime() - lastListenDate.getTime()) / (1000 * 60 * 60 * 24)

          await safeExecuteTool(createInfluenceLink, {
            episode_id: match.episode_id,
            expression_id: expression.expression_id,
            chunk_id: match.chunk_id,
            similarity: match.similarity,
            days_after_listen: daysAfterListen,
          })
        }

        processed.push(expression.expression_id)
      } catch (error) {
        console.error(`Failed to process expression ${expression.expression_id}:`, error)
        failed.push(expression.expression_id)
      }
    }

    return { processed, failed, total: expressions.length }
  },
})

export const influenceLinkingWorkflow = createWorkflow({
  id: 'influence_linking_workflow',
  inputSchema: z.object({
    expression_id: z.string().uuid().optional(),
  }),
  outputSchema: z.object({
    processed: z.array(z.string()),
    failed: z.array(z.string()),
    total: z.number(),
  }),
})
  .then(findNewExpressionsStep)
  .then(processExpressionsStep)
  .commit()

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import OpenAI from 'openai'
import { getExpressionsCollection } from '../../services/chroma.js'
import { randomUUID } from 'crypto'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const createExpression = createTool({
  id: 'create_expression',
  description: 'Create a new expression (note, tweet, post) with automatic embedding generation.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    text: z.string().min(1),
    source: z.enum(['manual', 'twitter', 'bluesky', 'github']),
    timestamp_utc: z.string().datetime().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  outputSchema: z.object({
    expression_id: z.string().uuid(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, text, source, timestamp_utc, metadata } = context

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })

    const embedding = embeddingResponse.data[0].embedding
    const expressionId = randomUUID()
    const timestamp = timestamp_utc || new Date().toISOString()

    // Store embedding in Chroma
    const collection = await getExpressionsCollection()
    try {
      await collection.add({
        ids: [expressionId],
        embeddings: [embedding],
        documents: [text],
        metadatas: [
          {
            user_id,
            timestamp_utc: timestamp,
            source,
          },
        ],
      })
    } catch (error) {
      console.error('Error storing expression in Chroma:', error)
      throw new Error(`Failed to store embedding in Chroma: ${error}`)
    }

    // Insert expression in PostgreSQL (text only, reference to Chroma)
    const result = await pool.query(
      `INSERT INTO expressions (expression_id, user_id, timestamp_utc, text, source, chroma_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING expression_id`,
      [
        expressionId,
        user_id,
        timestamp,
        text,
        source,
        expressionId, // chroma_id is the same as expression_id
        JSON.stringify(metadata || {}),
      ]
    )

    return {
      expression_id: result.rows[0].expression_id,
      success: true,
    }
  },
})

export const connectGitHubOAuth = createTool({
  id: 'connect_github_oauth',
  description: 'Connect GitHub OAuth for expression import.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    access_token: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    // Store OAuth token (in production, use secure storage)
    // For now, just return success
    return { success: true }
  },
})

export const watchGitHubRepo = createTool({
  id: 'watch_github_repo',
  description: 'Watch a GitHub repository for markdown files to import as expressions.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    repo_owner: z.string(),
    repo_name: z.string(),
    path: z.string().default(''),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files_found: z.number(),
  }),
  execute: async ({ context }: any) => {
    // In production, this would set up a webhook or polling mechanism
    // For now, return success
    return { success: true, files_found: 0 }
  },
})

export const importTwitterArchive = createTool({
  id: 'import_twitter_archive',
  description: 'Import Twitter archive JSON file as expressions.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    archive_data: z.any(), // JSON data from Twitter archive
  }),
  outputSchema: z.object({
    imported_count: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, archive_data } = context
    let imported = 0

    // Parse Twitter archive format
    if (archive_data.tweets && Array.isArray(archive_data.tweets)) {
      for (const tweet of archive_data.tweets) {
        if (tweet.full_text) {
          await (createExpression as any).execute({
            context: {
              user_id,
              text: tweet.full_text,
              source: 'twitter',
              timestamp_utc: tweet.created_at,
              metadata: { tweet_id: tweet.id_str },
            },
          })
          imported++
        }
      }
    }

    return { imported_count: imported, success: true }
  },
})

export const importBlueskyArchive = createTool({
  id: 'import_bluesky_archive',
  description: 'Import Bluesky archive JSON file as expressions.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    archive_data: z.any(), // JSON data from Bluesky archive
  }),
  outputSchema: z.object({
    imported_count: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { user_id, archive_data } = context
    let imported = 0

    // Parse Bluesky archive format
    if (Array.isArray(archive_data)) {
      for (const post of archive_data) {
        if (post.record?.text) {
          await (createExpression as any).execute({
            context: {
              user_id,
              text: post.record.text,
              source: 'bluesky',
              timestamp_utc: post.record.createdAt,
              metadata: { post_uri: post.uri },
            },
          })
          imported++
        }
      }
    }

    return { imported_count: imported, success: true }
  },
})

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const discoverTranscript = createTool({
  id: 'discover_transcript',
  description: 'Check RSS feeds for transcript URLs. Looks for <podcast:transcript> tags or common transcript URL patterns.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    rss_feed_url: z.string().url().optional(),
  }),
  outputSchema: z.object({
    transcript_url: z.string().url().nullable(),
    found: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, rss_feed_url } = context

    // Get episode info
    const episodeResult = await pool.query(
      'SELECT e.*, p.rss_feed_url FROM episodes e JOIN podcasts p ON e.podcast_id = p.podcast_id WHERE e.episode_id = $1',
      [episode_id]
    )

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found')
    }

    const episode = episodeResult.rows[0]
    const feedUrl = rss_feed_url || episode.rss_feed_url

    if (!feedUrl) {
      return { transcript_url: null, found: false }
    }

    try {
      // Fetch RSS feed
      const response = await fetch(feedUrl)
      const xml = await response.text()

      // Look for transcript URL in RSS
      // Check for <podcast:transcript> tag
      const transcriptMatch = xml.match(/<podcast:transcript[^>]*url=["']([^"']+)["']/i)
      if (transcriptMatch) {
        return { transcript_url: transcriptMatch[1], found: true }
      }

      // Check if episode already has transcript_url
      if (episode.transcript_url) {
        return { transcript_url: episode.transcript_url, found: true }
      }

      return { transcript_url: null, found: false }
    } catch (error) {
      console.error('Error discovering transcript:', error)
      return { transcript_url: null, found: false }
    }
  },
})

export const parseTranscript = createTool({
  id: 'parse_transcript',
  description: 'Parse transcript from SRT, VTT, or plain text format with timestamps.',
  inputSchema: z.object({
    transcript_url: z.string().url(),
    format: z.enum(['srt', 'vtt', 'plain']).optional(),
  }),
  outputSchema: z.object({
    segments: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { transcript_url, format } = context

    try {
      const response = await fetch(transcript_url)
      const text = await response.text()

      // Auto-detect format if not specified
      let detectedFormat = format
      if (!detectedFormat) {
        if (text.includes('WEBVTT')) {
          detectedFormat = 'vtt'
        } else if (text.match(/^\d+$/m) && text.includes('-->')) {
          detectedFormat = 'srt'
        } else {
          detectedFormat = 'plain'
        }
      }

      const segments: Array<{ start_sec: number; end_sec: number; text: string }> = []

      if (detectedFormat === 'srt') {
        // Parse SRT format
        const blocks = text.split(/\n\s*\n/)
        for (const block of blocks) {
          const timeMatch = block.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/)
          if (timeMatch) {
            const startSec =
              parseInt(timeMatch[1]) * 3600 +
              parseInt(timeMatch[2]) * 60 +
              parseInt(timeMatch[3]) +
              parseInt(timeMatch[4]) / 1000
            const endSec =
              parseInt(timeMatch[5]) * 3600 +
              parseInt(timeMatch[6]) * 60 +
              parseInt(timeMatch[7]) +
              parseInt(timeMatch[8]) / 1000
            const textLines = block.split('\n').slice(2).join(' ').trim()
            if (textLines) {
              segments.push({ start_sec: startSec, end_sec: endSec, text: textLines })
            }
          }
        }
      } else if (detectedFormat === 'vtt') {
        // Parse VTT format
        const lines = text.split('\n')
        let currentStart = 0
        let currentEnd = 0
        let currentText: string[] = []

        for (const line of lines) {
          const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/)
          if (timeMatch) {
            if (currentText.length > 0) {
              segments.push({
                start_sec: currentStart,
                end_sec: currentEnd,
                text: currentText.join(' '),
              })
              currentText = []
            }
            currentStart =
              parseInt(timeMatch[1]) * 3600 +
              parseInt(timeMatch[2]) * 60 +
              parseInt(timeMatch[3]) +
              parseInt(timeMatch[4]) / 1000
            currentEnd =
              parseInt(timeMatch[5]) * 3600 +
              parseInt(timeMatch[6]) * 60 +
              parseInt(timeMatch[7]) +
              parseInt(timeMatch[8]) / 1000
          } else if (line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('NOTE')) {
            currentText.push(line.trim())
          }
        }
        if (currentText.length > 0) {
          segments.push({
            start_sec: currentStart,
            end_sec: currentEnd,
            text: currentText.join(' '),
          })
        }
      } else {
        // Plain text - create single segment or try to parse timestamps
        // For now, treat as single segment
        segments.push({
          start_sec: 0,
          end_sec: 0,
          text: text.trim(),
        })
      }

      return { segments }
    } catch (error) {
      throw new Error(`Failed to parse transcript: ${error}`)
    }
  },
})

export const chunkTranscript = createTool({
  id: 'chunk_transcript',
  description: 'Split transcript segments into time windows (default 30-60 second chunks).',
  inputSchema: z.object({
    segments: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
      })
    ),
    chunk_duration_sec: z.number().default(45),
  }),
  outputSchema: z.object({
    chunks: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { segments, chunk_duration_sec } = context

    const chunks: Array<{ start_sec: number; end_sec: number; text: string }> = []
    let currentChunkStart = segments[0]?.start_sec || 0
    let currentChunkText: string[] = []

    for (const segment of segments) {
      if (segment.end_sec - currentChunkStart >= chunk_duration_sec && currentChunkText.length > 0) {
        // Finalize current chunk
        chunks.push({
          start_sec: currentChunkStart,
          end_sec: segment.start_sec,
          text: currentChunkText.join(' '),
        })
        currentChunkStart = segment.start_sec
        currentChunkText = [segment.text]
      } else {
        currentChunkText.push(segment.text)
      }
    }

    // Add final chunk
    if (currentChunkText.length > 0) {
      const lastSegment = segments[segments.length - 1]
      chunks.push({
        start_sec: currentChunkStart,
        end_sec: lastSegment?.end_sec || currentChunkStart + chunk_duration_sec,
        text: currentChunkText.join(' '),
      })
    }

    return { chunks }
  },
})

export const generateEmbeddings = createTool({
  id: 'generate_embeddings',
  description: 'Generate embeddings for transcript chunks using OpenAI API.',
  inputSchema: z.object({
    chunks: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    chunks_with_embeddings: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        embedding: z.array(z.number()),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { chunks } = context

    // Generate embeddings in batches
    const batchSize = 100
    const chunksWithEmbeddings: Array<{
      start_sec: number
      end_sec: number
      text: string
      embedding: number[]
    }> = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const texts = batch.map((chunk: any) => chunk.text)

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      })

      for (let j = 0; j < batch.length; j++) {
        chunksWithEmbeddings.push({
          start_sec: batch[j].start_sec,
          end_sec: batch[j].end_sec,
          text: batch[j].text,
          embedding: response.data[j].embedding,
        })
      }
    }

    return { chunks_with_embeddings: chunksWithEmbeddings }
  },
})

export const storeTranscriptChunks = createTool({
  id: 'store_transcript_chunks',
  description: 'Store transcript chunks with embeddings in the database using pgvector.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    chunks_with_embeddings: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        embedding: z.array(z.number()),
      })
    ),
  }),
  outputSchema: z.object({
    stored_count: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, chunks_with_embeddings } = context

    // Delete existing chunks for this episode
    await pool.query('DELETE FROM transcript_chunks WHERE episode_id = $1', [episode_id])

    // Insert new chunks
    for (const chunk of chunks_with_embeddings) {
      await pool.query(
        `INSERT INTO transcript_chunks (episode_id, start_sec, end_sec, text, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [episode_id, chunk.start_sec, chunk.end_sec, chunk.text, JSON.stringify(chunk.embedding)]
      )
    }

    return {
      stored_count: chunks_with_embeddings.length,
      success: true,
    }
  },
})

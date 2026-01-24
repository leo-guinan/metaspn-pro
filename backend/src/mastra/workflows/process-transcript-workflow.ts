import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import {
  discoverTranscript,
  parseTranscript,
  chunkTranscript,
  generateEmbeddings,
  storeTranscriptChunks,
} from '../tools/transcript-tools'
import { safeExecuteTool } from '../utils/tool-helpers'


const parseStep = createStep({
  id: 'parse',
  inputSchema: z.object({
    transcript_url: z.string().url(),
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
  execute: async ({ inputData }: any) => {
    const result = await safeExecuteTool<{ segments: Array<{ start_sec: number; end_sec: number; text: string }> }>(
      parseTranscript,
      { transcript_url: inputData.transcript_url }
    )
    return result
  },
})

const chunkStep = createStep({
  id: 'chunk',
  inputSchema: z.object({
    segments: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
      })
    ),
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
  execute: async ({ inputData }: any) => {
    const result = await safeExecuteTool<{ chunks: Array<{ start_sec: number; end_sec: number; text: string }> }>(
      chunkTranscript,
      {
        segments: inputData.segments,
        chunk_duration_sec: 45,
      }
    )
    return result
  },
})

const embedStep = createStep({
  id: 'embed',
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
  execute: async ({ inputData }: any) => {
    const result = await safeExecuteTool<{ chunks_with_embeddings: Array<{ start_sec: number; end_sec: number; text: string; embedding: number[] }> }>(
      generateEmbeddings,
      { chunks: inputData.chunks }
    )
    return result
  },
})

const storeStep = createStep({
  id: 'store',
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
  execute: async ({ inputData }: any) => {
    const result = await safeExecuteTool<{ stored_count: number; success: boolean }>(
      storeTranscriptChunks,
      {
        episode_id: inputData.episode_id,
        chunks_with_embeddings: inputData.chunks_with_embeddings,
      }
    )
    return result
  },
})

// Workflow that chains steps together
export const processTranscriptWorkflow = createWorkflow({
  id: 'process_transcript_workflow',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    rss_feed_url: z.string().url().optional(),
  }),
  outputSchema: z.object({
    stored_count: z.number(),
    success: z.boolean(),
  }),
  stateSchema: z.object({
    episode_id: z.string().uuid(),
  }),
})
  .then(
    createStep({
      id: 'init',
      inputSchema: z.object({
        episode_id: z.string().uuid(),
        rss_feed_url: z.string().url().optional(),
      }),
      outputSchema: z.object({
        episode_id: z.string().uuid(),
        rss_feed_url: z.string().url().optional(),
        transcript_url: z.string().url().nullable(),
        found: z.boolean(),
      }),
      stateSchema: z.object({
        episode_id: z.string().uuid(),
      }),
      execute: async ({ inputData, setState }: any) => {
        setState({ episode_id: inputData.episode_id })
        const result = await safeExecuteTool<{ transcript_url: string | null; found: boolean }>(
          discoverTranscript,
          {
            episode_id: inputData.episode_id,
            rss_feed_url: inputData.rss_feed_url,
          }
        )
        return {
          episode_id: inputData.episode_id,
          rss_feed_url: inputData.rss_feed_url,
          ...result,
        }
      },
    })
  )
  .then(
    createStep({
      id: 'check_discover',
      inputSchema: z.object({
        episode_id: z.string().uuid(),
        transcript_url: z.string().url().nullable(),
        found: z.boolean(),
      }),
      outputSchema: z.object({
        transcript_url: z.string().url(),
      }),
      execute: async ({ inputData }: any) => {
        if (!inputData.found || !inputData.transcript_url) {
          throw new Error('No transcript URL found')
        }
        return { transcript_url: inputData.transcript_url }
      },
    })
  )
  .then(parseStep)
  .then(chunkStep)
  .then(embedStep)
  .then(
    createStep({
      id: 'prepare_store',
      inputSchema: z.object({
        chunks_with_embeddings: z.array(z.any()),
      }),
      outputSchema: z.object({
        episode_id: z.string().uuid(),
        chunks_with_embeddings: z.array(z.any()),
      }),
      execute: async ({ inputData, state }: any) => {
        return {
          episode_id: state.episode_id,
          chunks_with_embeddings: inputData.chunks_with_embeddings,
        }
      },
    })
  )
  .then(storeStep)
  .commit()

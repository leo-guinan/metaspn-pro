import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { pool } from '../../db'
import { processTranscriptWorkflow } from './process-transcript-workflow'
import { discoverTranscript } from '../tools/transcript-tools'
import { safeExecuteTool } from '../utils/tool-helpers'

const findEpisodesStep = createStep({
  id: 'find_episodes',
  inputSchema: z.object({}),
  outputSchema: z.object({
    episodes: z.array(
      z.object({
        episode_id: z.string(),
        podcast_id: z.string(),
        rss_feed_url: z.string().nullable(),
      })
    ),
  }),
  execute: async (): Promise<any> => {
    // Find episodes from subscribed podcasts that don't have transcripts yet
    const result = await pool.query(
      `SELECT e.episode_id, e.podcast_id, p.rss_feed_url
       FROM episodes e
       JOIN podcasts p ON e.podcast_id = p.podcast_id
       WHERE e.transcript_url IS NULL
       AND e.release_time IS NOT NULL
       AND e.release_time > NOW() - INTERVAL '30 days'
       LIMIT 100`
    )
    return { episodes: result.rows }
  },
})

const discoverAndProcessStep = createStep({
  id: 'discover_and_process',
  inputSchema: z.object({
    episodes: z.array(z.any()),
  }),
  outputSchema: z.object({
    processed: z.array(z.string()),
    failed: z.array(z.string()),
    total: z.number(),
  }),
  execute: async ({ inputData }: any) => {
    const episodes = inputData.episodes
    const processed: string[] = []
    const failed: string[] = []

        for (const episode of episodes) {
          try {
            // Discover transcript
            const discoverResult = await safeExecuteTool<{ transcript_url: string | null; found: boolean }>(
              discoverTranscript,
              {
                episode_id: episode.episode_id,
                rss_feed_url: episode.rss_feed_url,
              }
            )

            if (discoverResult.found && discoverResult.transcript_url) {
          // Update episode with transcript URL
          await pool.query('UPDATE episodes SET transcript_url = $1 WHERE episode_id = $2', [
            discoverResult.transcript_url,
            episode.episode_id,
          ])

          // Trigger processing workflow
          const run = await processTranscriptWorkflow.createRun()
          await run.start({
            inputData: {
              episode_id: episode.episode_id,
              rss_feed_url: episode.rss_feed_url,
            },
          })

          processed.push(episode.episode_id)
        }
      } catch (error) {
        console.error(`Failed to process episode ${episode.episode_id}:`, error)
        failed.push(episode.episode_id)
      }
    }

    return { processed, failed, total: episodes.length }
  },
})

export const transcriptDiscoveryWorkflow = createWorkflow({
  id: 'transcript_discovery_workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processed: z.array(z.string()),
    failed: z.array(z.string()),
    total: z.number(),
  }),
})
  .then(findEpisodesStep)
  .then(discoverAndProcessStep)
  .commit()

import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { safeExecuteTool } from '../utils/tool-helpers'
import {
  searchPodcastByName,
  searchPodcastWeb,
  discoverRSSFeed,
  parseRSSFeed,
  createPodcast,
  createEpisodes,
} from '../tools/podcast-discovery-tools'
import { saveUserPodcastPreferences } from '../tools/user-preference-tools'

const searchPodcastStep = createStep({
  id: 'search_podcast',
  inputSchema: z.object({
    podcast_name: z.string(),
    user_id: z.string().uuid(),
    preferences: z.object({
      started_listening_date: z.string().date().nullable().optional(),
      listen_regularity: z.enum(['every-episode', 'most-episodes', 'occasional', 'rarely']).nullable().optional(),
      typical_listen_speed: z.enum(['same-day', '1-3-days', '1-week', 'long-tail']).nullable().optional(),
    }),
  }),
  outputSchema: z.object({
    search_results: z.array(z.any()),
    podcast_name: z.string(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  execute: async ({ inputData }: any) => {
    const { podcast_name } = inputData

    // Try iTunes API first
    const itunesResult = await safeExecuteTool<{ results: any[] }>(searchPodcastByName, { podcast_name })

    if (itunesResult.results.length > 0) {
      return {
        search_results: itunesResult.results,
        podcast_name: inputData.podcast_name,
        user_id: inputData.user_id,
        preferences: inputData.preferences,
      }
    }

    // Fallback to web search (for now returns empty, can be enhanced)
    const webResult = await safeExecuteTool<{ potential_feeds: string[]; website_urls: string[] }>(
      searchPodcastWeb,
      { podcast_name }
    )

    return {
      search_results: [],
      podcast_name: inputData.podcast_name,
      user_id: inputData.user_id,
      preferences: inputData.preferences,
      web_results: webResult,
    }
  },
})

const parseRSSStep = createStep({
  id: 'parse_rss',
  inputSchema: z.object({
    rss_feed_url: z.string().url(),
    podcast_name: z.string(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  outputSchema: z.object({
    podcast_metadata: z.any(),
    episodes_data: z.array(z.any()),
    rss_feed_url: z.string().url(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  execute: async ({ inputData }: any) => {
    const { rss_feed_url } = inputData

    const parseResult = await safeExecuteTool<{
      podcast: any
      episodes: any[]
    }>(parseRSSFeed, { rss_feed_url })

    return {
      podcast_metadata: parseResult.podcast,
      episodes_data: parseResult.episodes,
      rss_feed_url: inputData.rss_feed_url,
      user_id: inputData.user_id,
      preferences: inputData.preferences,
    }
  },
})

const createPodcastStep = createStep({
  id: 'create_podcast',
  inputSchema: z.object({
    podcast_metadata: z.any(),
    episodes_data: z.array(z.any()),
    rss_feed_url: z.string().url(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  outputSchema: z.object({
    podcast_id: z.string().uuid(),
    episodes_data: z.array(z.any()),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  execute: async ({ inputData }: any) => {
    const { podcast_metadata, rss_feed_url } = inputData

    const createResult = await safeExecuteTool<{ podcast_id: string; created: boolean }>(createPodcast, {
      title: podcast_metadata.title,
      description: podcast_metadata.description,
      rss_feed_url,
      website_url: podcast_metadata.website_url,
      image_url: podcast_metadata.image_url,
    })

    return {
      podcast_id: createResult.podcast_id,
      episodes_data: inputData.episodes_data,
      user_id: inputData.user_id,
      preferences: inputData.preferences,
    }
  },
})

const createEpisodesStep = createStep({
  id: 'create_episodes',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    episodes_data: z.array(z.any()),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  outputSchema: z.object({
    podcast_id: z.string().uuid(),
    episode_ids: z.array(z.string().uuid()),
    created_count: z.number(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  execute: async ({ inputData }: any) => {
    const { podcast_id, episodes_data } = inputData

    const episodesResult = await safeExecuteTool<{
      episode_ids: string[]
      created_count: number
      skipped_count: number
    }>(createEpisodes, {
      podcast_id,
      episodes: episodes_data,
    })

    return {
      podcast_id: inputData.podcast_id,
      episode_ids: episodesResult.episode_ids,
      created_count: episodesResult.created_count,
      user_id: inputData.user_id,
      preferences: inputData.preferences,
    }
  },
})

const savePreferencesStep = createStep({
  id: 'save_preferences',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    user_id: z.string().uuid(),
    preferences: z.any(),
  }),
  outputSchema: z.object({
    preference_id: z.string().uuid(),
    podcast_id: z.string().uuid(),
    created_count: z.number(),
  }),
  execute: async ({ inputData }: any) => {
    const { podcast_id, user_id, preferences } = inputData

    const prefResult = await safeExecuteTool<{ preference_id: string; created: boolean }>(
      saveUserPodcastPreferences,
      {
        user_id,
        podcast_id,
        ...preferences,
      }
    )

    return {
      preference_id: prefResult.preference_id,
      podcast_id: inputData.podcast_id,
      created_count: inputData.created_count || 0,
    }
  },
})

export const podcastDiscoveryWorkflow = createWorkflow({
  id: 'podcast_discovery_workflow',
  inputSchema: z.object({
    podcast_name: z.string(),
    user_id: z.string().uuid(),
    preferences: z
      .object({
        started_listening_date: z.string().date().nullable().optional(),
        listen_regularity: z.enum(['every-episode', 'most-episodes', 'occasional', 'rarely']).nullable().optional(),
        typical_listen_speed: z.enum(['same-day', '1-3-days', '1-week', 'long-tail']).nullable().optional(),
      })
      .optional(),
    rss_feed_url: z.string().url().optional(), // Allow manual RSS entry
  }),
  outputSchema: z.object({
    podcast_id: z.string().uuid(),
    preference_id: z.string().uuid(),
    created_count: z.number(),
  }),
})
  .then(
    createStep({
      id: 'check_rss_or_search',
      inputSchema: z.object({
        podcast_name: z.string(),
        user_id: z.string().uuid(),
        preferences: z.any().optional(),
        rss_feed_url: z.string().url().optional(),
      }),
      outputSchema: z.object({
        search_results: z.array(z.any()),
        podcast_name: z.string(),
        user_id: z.string().uuid(),
        preferences: z.any(),
        rss_feed_url: z.string().url().optional(),
      }),
      execute: async ({ inputData }: any) => {
        // If RSS feed URL was provided directly, skip search
        if (inputData.rss_feed_url) {
          return {
            search_results: [],
            podcast_name: inputData.podcast_name,
            user_id: inputData.user_id,
            preferences: inputData.preferences || {},
            rss_feed_url: inputData.rss_feed_url,
          }
        }

        // Otherwise search for podcast
        return await searchPodcastStep.execute({ inputData } as any)
      },
    })
  )
  .then(
    createStep({
      id: 'discover_rss_from_search',
      inputSchema: z.object({
        search_results: z.array(z.any()),
        podcast_name: z.string(),
        user_id: z.string().uuid(),
        preferences: z.any(),
        rss_feed_url: z.string().url().optional(),
      }),
      outputSchema: z.object({
        rss_feed_url: z.string().url(),
        podcast_name: z.string(),
        user_id: z.string().uuid(),
        preferences: z.any(),
      }),
      execute: async ({ inputData }: any) => {
        // If RSS feed URL was already provided, use it
        if (inputData.rss_feed_url) {
          return {
            rss_feed_url: inputData.rss_feed_url,
            podcast_name: inputData.podcast_name,
            user_id: inputData.user_id,
            preferences: inputData.preferences,
          }
        }

        const { search_results } = inputData

        // If we have iTunes results, use the first one
        if (search_results && search_results.length > 0) {
          const selectedPodcast = search_results[0]
          const rssResult = await safeExecuteTool<{ rss_feed_url: string | null; found: boolean }>(
            discoverRSSFeed,
            {
              feed_url: selectedPodcast.feedUrl,
              podcast_data: selectedPodcast,
            }
          )

          if (rssResult.found && rssResult.rss_feed_url) {
            return {
              rss_feed_url: rssResult.rss_feed_url,
              podcast_name: inputData.podcast_name,
              user_id: inputData.user_id,
              preferences: inputData.preferences,
            }
          }
        }

        throw new Error('Could not discover RSS feed. Please provide RSS feed URL manually.')
      },
    })
  )
  .then(parseRSSStep)
  .then(createPodcastStep)
  .then(createEpisodesStep)
  .then(savePreferencesStep)
  .commit()

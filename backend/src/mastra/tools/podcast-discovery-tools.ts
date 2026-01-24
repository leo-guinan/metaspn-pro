import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { pool } from '../../db'
import Parser from 'rss-parser'

const parser = new Parser()

export const searchPodcastByName = createTool({
  id: 'search_podcast_by_name',
  description: 'Search for podcasts using iTunes/Apple Podcasts API. Returns array of matching podcasts with RSS feeds.',
  inputSchema: z.object({
    podcast_name: z.string().min(1),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        collectionId: z.number().optional(),
        collectionName: z.string(),
        artistName: z.string().optional(),
        feedUrl: z.string().url().optional(),
        artworkUrl100: z.string().url().optional(),
        artworkUrl600: z.string().url().optional(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { podcast_name } = context

    try {
      const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(podcast_name)}&media=podcast&limit=10`
      const response = await fetch(searchUrl)
      const data = (await response.json()) as { results?: any[] }

      return {
        results: (data.results || []).map((result: any) => ({
          collectionId: result.collectionId,
          collectionName: result.collectionName,
          artistName: result.artistName,
          feedUrl: result.feedUrl,
          artworkUrl100: result.artworkUrl100,
          artworkUrl600: result.artworkUrl600,
        })),
      }
    } catch (error) {
      console.error('Error searching iTunes API:', error)
      return { results: [] }
    }
  },
})

export const searchPodcastWeb = createTool({
  id: 'search_podcast_web',
  description: 'Fallback web search for podcast RSS feeds. Uses web search to find podcast websites and RSS feeds.',
  inputSchema: z.object({
    podcast_name: z.string().min(1),
  }),
  outputSchema: z.object({
    potential_feeds: z.array(z.string().url()),
    website_urls: z.array(z.string().url()),
  }),
  execute: async ({ context }: any) => {
    const { podcast_name } = context

    // For now, return empty arrays - can be enhanced with actual web search
    // This would typically use a search API or LLM to extract RSS URLs
    return {
      potential_feeds: [],
      website_urls: [],
    }
  },
})

export const discoverRSSFeed = createTool({
  id: 'discover_rss_feed',
  description: 'Extract RSS feed URL from podcast data or website. Checks common RSS feed locations.',
  inputSchema: z.object({
    feed_url: z.string().url().optional(),
    website_url: z.string().url().optional(),
    podcast_data: z.any().optional(),
  }),
  outputSchema: z.object({
    rss_feed_url: z.string().url().nullable(),
    found: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { feed_url, website_url, podcast_data } = context

    // If RSS feed URL is already provided, use it
    if (feed_url) {
      return { rss_feed_url: feed_url, found: true }
    }

    // If podcast data from iTunes has feedUrl, use it
    if (podcast_data?.feedUrl) {
      return { rss_feed_url: podcast_data.feedUrl, found: true }
    }

    // If website URL provided, try common RSS feed locations
    if (website_url) {
      const commonPaths = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/podcast.xml', '/podcast.rss']
      for (const path of commonPaths) {
        try {
          const testUrl = new URL(path, website_url).href
          const response = await fetch(testUrl, { method: 'HEAD' })
          if (response.ok && response.headers.get('content-type')?.includes('xml')) {
            return { rss_feed_url: testUrl, found: true }
          }
        } catch {
          // Continue to next path
        }
      }
    }

    return { rss_feed_url: null, found: false }
  },
})

export const parseRSSFeed = createTool({
  id: 'parse_rss_feed',
  description: 'Parse RSS feed and extract podcast metadata and episodes.',
  inputSchema: z.object({
    rss_feed_url: z.string().url(),
  }),
  outputSchema: z.object({
    podcast: z.object({
      title: z.string(),
      description: z.string().nullable(),
      image_url: z.string().url().nullable(),
      website_url: z.string().url().nullable(),
    }),
    episodes: z.array(
      z.object({
        title: z.string(),
        description: z.string().nullable(),
        duration_sec: z.number(),
        release_time: z.string().datetime().nullable(),
        audio_url: z.string().url().nullable(),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { rss_feed_url } = context

    try {
      const feed = await parser.parseURL(rss_feed_url)

      // Extract podcast metadata
      const podcast = {
        title: feed.title || 'Unknown Podcast',
        description: feed.description || feed.itunes?.summary || null,
        image_url: feed.image?.url || feed.itunes?.image || null,
        website_url: feed.link || null,
      }

      // Extract episodes
      const episodes = (feed.items || []).map((item: any) => {
        // Parse duration (can be in various formats: "HH:MM:SS", "MM:SS", or seconds)
        let duration_sec = 0
        if (item.itunes?.duration) {
          const duration = item.itunes.duration
          if (typeof duration === 'number') {
            duration_sec = duration
          } else if (typeof duration === 'string') {
            const parts = duration.split(':').map(Number)
            if (parts.length === 3) {
              duration_sec = parts[0] * 3600 + parts[1] * 60 + parts[2]
            } else if (parts.length === 2) {
              duration_sec = parts[0] * 60 + parts[1]
            }
          }
        }

        // Parse release date
        let release_time: string | null = null
        if (item.pubDate) {
          release_time = new Date(item.pubDate).toISOString()
        } else if (item.isoDate) {
          release_time = item.isoDate
        }

        return {
          title: item.title || 'Untitled Episode',
          description: item.contentSnippet || item.content || item.itunes?.summary || null,
          duration_sec,
          release_time,
          audio_url: item.enclosure?.url || item.link || null,
        }
      })

      return { podcast, episodes }
    } catch (error) {
      console.error('Error parsing RSS feed:', error)
      throw new Error(`Failed to parse RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  },
})

export const createPodcast = createTool({
  id: 'create_podcast',
  description: 'Create or get existing podcast entry in database. Checks for duplicates by title or RSS feed URL.',
  inputSchema: z.object({
    title: z.string(),
    description: z.string().nullable().optional(),
    rss_feed_url: z.string().url().nullable().optional(),
    website_url: z.string().url().nullable().optional(),
    image_url: z.string().url().nullable().optional(),
  }),
  outputSchema: z.object({
    podcast_id: z.string().uuid(),
    created: z.boolean(),
  }),
  execute: async ({ context }: any) => {
    const { title, description, rss_feed_url, website_url, image_url } = context

    // Check if podcast already exists
    let query = 'SELECT podcast_id FROM podcasts WHERE title = $1'
    const params: any[] = [title]

    if (rss_feed_url) {
      query += ' OR rss_feed_url = $2'
      params.push(rss_feed_url)
    }

    const existing = await pool.query(query, params)

    if (existing.rows.length > 0) {
      return {
        podcast_id: existing.rows[0].podcast_id,
        created: false,
      }
    }

    // Create new podcast
    const result = await pool.query(
      `INSERT INTO podcasts (title, description, rss_feed_url, website_url, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING podcast_id`,
      [title, description || null, rss_feed_url || null, website_url || null, image_url || null]
    )

    return {
      podcast_id: result.rows[0].podcast_id,
      created: true,
    }
  },
})

export const createEpisodes = createTool({
  id: 'create_episodes',
  description: 'Batch create episode entries for a podcast. Skips episodes that already exist.',
  inputSchema: z.object({
    podcast_id: z.string().uuid(),
    episodes: z.array(
      z.object({
        title: z.string(),
        description: z.string().nullable().optional(),
        duration_sec: z.number(),
        release_time: z.string().datetime().nullable().optional(),
        audio_url: z.string().url().nullable().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    episode_ids: z.array(z.string().uuid()),
    created_count: z.number(),
    skipped_count: z.number(),
  }),
  execute: async ({ context }: any) => {
    const { podcast_id, episodes } = context
    const episode_ids: string[] = []
    let created_count = 0
    let skipped_count = 0

    for (const episode of episodes) {
      // Check if episode already exists (by title and release_time)
      const existingQuery = episode.release_time
        ? 'SELECT episode_id FROM episodes WHERE podcast_id = $1 AND title = $2 AND release_time = $3'
        : 'SELECT episode_id FROM episodes WHERE podcast_id = $1 AND title = $2 AND release_time IS NULL'

      const existingParams = episode.release_time
        ? [podcast_id, episode.title, new Date(episode.release_time)]
        : [podcast_id, episode.title]

      const existing = await pool.query(existingQuery, existingParams)

      if (existing.rows.length > 0) {
        episode_ids.push(existing.rows[0].episode_id)
        skipped_count++
        continue
      }

      // Create new episode
      const result = await pool.query(
        `INSERT INTO episodes (podcast_id, title, description, duration_sec, release_time, audio_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING episode_id`,
        [
          podcast_id,
          episode.title,
          episode.description || null,
          episode.duration_sec,
          episode.release_time ? new Date(episode.release_time) : null,
          episode.audio_url || null,
        ]
      )

      episode_ids.push(result.rows[0].episode_id)
      created_count++
    }

    return {
      episode_ids,
      created_count,
      skipped_count,
    }
  },
})

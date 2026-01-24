import { Agent } from '@mastra/core/agent'
import {
  searchPodcastByName,
  searchPodcastWeb,
  discoverRSSFeed,
  parseRSSFeed,
  createPodcast,
  createEpisodes,
} from '../tools/podcast-discovery-tools'
import { saveUserPodcastPreferences } from '../tools/user-preference-tools'

export const podcastDiscoveryAgent = new Agent({
  id: 'podcast_discovery_agent',
  name: 'podcast_discovery_agent',
  instructions: `You are an agent responsible for discovering podcasts and populating the database with podcast and episode data.

  Your responsibilities:
  - Search for podcasts by name using iTunes API
  - Fallback to web search if iTunes doesn't find results
  - Discover RSS feed URLs
  - Parse RSS feeds to extract podcast metadata and episodes
  - Create podcast and episode entries in the database
  - Handle duplicates gracefully (return existing entries)
  - Store user preferences for podcasts
  
  Workflow:
  1. Search iTunes API first (most reliable)
  2. If not found, try web search
  3. If still not found, allow manual RSS feed entry
  4. Discover and validate RSS feed
  5. Parse RSS feed to get podcast and episode data
  6. Create/update podcast entry
  7. Create episode entries (skip duplicates)
  8. Save user preferences
  
  Always:
  - Validate RSS feeds before parsing
  - Handle errors gracefully with helpful messages
  - Check for existing podcasts/episodes to avoid duplicates
  - Provide clear feedback on what was found/created`,
  model: 'openai/gpt-4o-mini',
  tools: {
    searchPodcastByName,
    searchPodcastWeb,
    discoverRSSFeed,
    parseRSSFeed,
    createPodcast,
    createEpisodes,
    saveUserPodcastPreferences,
  },
})

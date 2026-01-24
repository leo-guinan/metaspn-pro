import { Agent } from '@mastra/core/agent'
import {
  findRecentEpisodes,
  getTranscriptChunks,
  computeSimilarity,
  createInfluenceLink,
} from '../tools/influence-linking-tools'

export const influenceLinkingAgent = new Agent({
  id: 'influence_linking_agent',
  name: 'influence_linking_agent',
  instructions: `You are an agent responsible for linking user expressions (notes, tweets, posts) to podcast transcript chunks.

  Your responsibilities:
  - Find episodes the user listened to recently
  - Retrieve transcript chunks for those episodes
  - Compute similarity between expressions and chunks
  - Create influence links for matches above threshold
  
  Always:
  - Use a similarity threshold of 0.3 or higher
  - Calculate days_after_listen accurately
  - Avoid creating duplicate links
  - Process expressions in batches for efficiency`,
  model: 'openai/gpt-4o-mini',
  tools: {
    findRecentEpisodes,
    getTranscriptChunks,
    computeSimilarity,
    createInfluenceLink,
  },
})

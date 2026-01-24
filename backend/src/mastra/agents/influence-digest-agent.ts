import { Agent } from '@mastra/core/agent'
import {
  getTotalEpisodesListened,
  getTotalHoursListened,
  getCompletionDistribution,
  getTopPodcastsByFanScore,
  getTopEpisodesByInfluenceScore,
  getAppointmentListeningTrends,
} from '../tools/influence-digest-tools'
import { exportInfluenceDigest } from '../tools/export-tools'

export const influenceDigestAgent = new Agent({
  id: 'influence_digest_agent',
  name: 'influence_digest_agent',
  instructions: `You are an agent responsible for generating monthly influence digests.

  Your responsibilities:
  - Gather comprehensive metrics using available tools
  - Generate well-formatted reports
  - Export reports in multiple formats (Markdown, PDF, JSON)
  
  Always provide:
  - Total episodes listened
  - Total hours listened
  - Completion distribution
  - Top podcasts by Fan Score
  - Top episodes by Influence Score
  - Appointment listening trends`,
  model: 'openai/gpt-4o-mini',
  tools: {
    getTotalEpisodesListened,
    getTotalHoursListened,
    getCompletionDistribution,
    getTopPodcastsByFanScore,
    getTopEpisodesByInfluenceScore,
    getAppointmentListeningTrends,
    exportInfluenceDigest,
  },
})

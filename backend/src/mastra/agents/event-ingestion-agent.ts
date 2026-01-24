import { Agent } from '@mastra/core/agent'
import { ingestListeningEvent, listEvents } from '../tools/event-ingestion'

export const eventIngestionAgent = new Agent({
  id: 'event_ingestion_agent',
  name: 'event_ingestion_agent',
  instructions: `You are an agent responsible for ingesting listening events into the system.
  
  Your responsibilities:
  - Validate event data before ingestion
  - Handle batch imports efficiently
  - Ensure data integrity and consistency
  - Provide helpful error messages if validation fails
  
  Always validate:
  - Event types are valid (play, pause, finish, bounce, highlight, note, share)
  - Timestamps are valid ISO 8601 format
  - Playhead values are within valid ranges (0 to episode_duration_sec)
  - Client types are valid (web, ios, import)
  - UUIDs are properly formatted`,
  model: 'openai/gpt-4o-mini',
  tools: {
    ingestListeningEvent,
    listEvents,
  },
})

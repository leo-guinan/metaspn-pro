import { randomUUID } from 'crypto'

export type SourceType = 'podcast' | 'youtube' | 'twitter' | 'blog' | 'book'
export type EventType = 'start' | 'progress' | 'complete' | 'pause' | 'skip' | 'read' | 'post' | 'edit' | 'delete'

interface DatabaseEvent {
  event_id: string
  user_id: string
  episode_id: string
  podcast_id: string
  event_type: 'play' | 'pause' | 'finish' | 'bounce' | 'highlight' | 'note' | 'share'
  timestamp_utc: Date | string
  playhead_sec?: number | string | null
  episode_duration_sec?: number | string | null
  client: 'web' | 'ios' | 'import'
  metadata?: Record<string, unknown> | null
}

interface PodcastInfo {
  podcast_id: string
  title: string
  description?: string | null
  rss_feed_url?: string | null
  website_url?: string | null
  image_url?: string | null
}

interface EpisodeInfo {
  episode_id: string
  title: string
  description?: string | null
  duration_sec: number | string
  release_time?: Date | string | null
  audio_url?: string | null
  transcript_url?: string | null
}

export interface TransformedPodcastEvent {
  id: string
  timestamp: string
  source_type: 'podcast'
  event_type: EventType
  user_id: string
  version: string
  podcast: {
    title: string
    show_id: string
    feed_url?: string | null
    host?: string
  }
  episode: {
    title: string
    episode_id: string
    guid?: string
    publish_date?: string
    duration_seconds: number
    episode_url?: string | null
  }
  listening: {
    start_time?: string
    end_time?: string
    duration_seconds?: number
    completion_percentage?: number
    playback_speed?: number
    skips?: Array<{ from_seconds: number; to_seconds: number }>
    replays?: Array<{ from_seconds: number; to_seconds: number; count: number }>
  }
  context: {
    device?: string
    location?: string
    player_app?: string
  }
}

/**
 * Map old event types to new standardized event types
 */
export function mapEventType(oldType: string): EventType {
  const mapping: Record<string, EventType> = {
    play: 'start',
    finish: 'complete',
    pause: 'pause',
    bounce: 'skip',
    highlight: 'progress',
    note: 'progress',
    share: 'progress',
  }
  return mapping[oldType] || 'progress'
}

/**
 * Generate a UUID v4 for events
 */
export function generateEventId(): string {
  return randomUUID()
}

/**
 * Transform a database event to the new podcast listening event schema
 */
export function transformPodcastEventToNewSchema(
  dbEvent: DatabaseEvent,
  podcast: PodcastInfo,
  episode: EpisodeInfo
): TransformedPodcastEvent {
  const eventType = mapEventType(dbEvent.event_type)
  let timestamp: string
  if (typeof dbEvent.timestamp_utc === 'string') {
    timestamp = dbEvent.timestamp_utc
  } else if (dbEvent.timestamp_utc instanceof Date) {
    timestamp = dbEvent.timestamp_utc.toISOString()
  } else {
    timestamp = new Date().toISOString()
  }
  
  const playheadSec = dbEvent.playhead_sec != null ? Number(dbEvent.playhead_sec) : null
  const durationSec = episode.duration_sec != null ? Number(episode.duration_sec) : 0
  const completionPercentage = playheadSec != null && durationSec > 0 ? (playheadSec / durationSec) * 100 : undefined

  // Extract skips and replays from metadata if available
  const metadata = dbEvent.metadata || {}
  const skips = metadata.skips as Array<{ from_seconds: number; to_seconds: number }> | undefined
  const replays = metadata.replays as Array<{ from_seconds: number; to_seconds: number; count: number }> | undefined

  // Determine device/location from client and metadata
  const device = dbEvent.client === 'ios' ? 'iPhone' : dbEvent.client === 'web' ? 'Desktop' : 'Unknown'
  const location = metadata.location as string | undefined
  const playerApp = dbEvent.client === 'ios' ? 'Apple Podcasts' : dbEvent.client === 'web' ? 'Web Player' : undefined

  // Extract host from podcast metadata or description if available
  const host = metadata.host as string | undefined

  const transformed: TransformedPodcastEvent = {
    id: generateEventId(),
    timestamp,
    source_type: 'podcast',
    event_type: eventType,
    user_id: dbEvent.user_id,
    version: '1.0.0',
    podcast: {
      title: podcast.title,
      show_id: podcast.podcast_id,
      feed_url: podcast.rss_feed_url || null,
      host: host,
    },
    episode: {
      title: episode.title,
      episode_id: episode.episode_id,
      guid: episode.episode_id, // Use episode_id as GUID if no actual GUID available
      publish_date: episode.release_time
        ? typeof episode.release_time === 'string'
          ? episode.release_time
          : episode.release_time.toISOString()
        : undefined,
      duration_seconds: durationSec,
      episode_url: episode.audio_url || null,
    },
    listening: {
      duration_seconds: playheadSec != null ? playheadSec : undefined,
      completion_percentage: completionPercentage,
      playback_speed: metadata.playback_speed as number | undefined || 1.0,
      skips: skips && skips.length > 0 ? skips : undefined,
      replays: replays && replays.length > 0 ? replays : undefined,
    },
    context: {
      device,
      location,
      player_app: playerApp,
    },
  }

  // For 'complete' events, set end_time to timestamp and calculate duration
  if (eventType === 'complete' && playheadSec != null) {
    transformed.listening.end_time = timestamp
    transformed.listening.start_time = metadata.start_time as string | undefined
    if (transformed.listening.start_time) {
      const start = new Date(transformed.listening.start_time)
      const end = new Date(timestamp)
      transformed.listening.duration_seconds = Math.round((end.getTime() - start.getTime()) / 1000)
    }
  }

  // For 'start' events, set start_time
  if (eventType === 'start') {
    transformed.listening.start_time = timestamp
  }

  return transformed
}

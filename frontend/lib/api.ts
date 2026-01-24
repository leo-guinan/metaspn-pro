const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const TOKEN_KEY = 'metaspn_token'

// Get auth token from localStorage
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    // Try to parse error response
    let errorMessage = response.statusText
    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || response.statusText
    } catch {
      // If JSON parsing fails, use status text
    }
    const error: any = new Error(errorMessage)
    error.status = response.status
    error.response = response
    throw error
  }

  return response.json()
}

// Event endpoints
export const eventsApi = {
  list: (params?: {
    user_id?: string
    episode_id?: string
    podcast_id?: string
    start_date?: string
    end_date?: string
    limit?: number
    offset?: number
  }) => apiRequest('/api/events', {
    method: 'GET',
    ...(params && { body: JSON.stringify(params) }),
  }),

  create: (event: any) => apiRequest('/api/events', {
    method: 'POST',
    body: JSON.stringify(event),
  }),
}

// Dashboard endpoints
export const dashboardApi = {
  getStats: (user_id: string) => apiRequest(`/api/users/${user_id}/dashboard`),
  getInfluenceReport: (user_id: string) => apiRequest(`/api/users/${user_id}/influence-report`),
}

// Export endpoints
export const exportsApi = {
  fanSummary: (user_id: string, format: 'json' | 'markdown' | 'pdf' = 'markdown') =>
    apiRequest(`/api/exports/fan-summary?user_id=${user_id}&format=${format}`),
  influenceDigest: (user_id: string, format: 'json' | 'markdown' | 'pdf' = 'markdown') =>
    apiRequest(`/api/exports/influence-digest?user_id=${user_id}&format=${format}`),
  eventLedger: (user_id: string, format: 'jsonl' | 'csv' = 'jsonl') =>
    apiRequest(`/api/exports/event-ledger?user_id=${user_id}&format=${format}`),
}

// Podcast discovery endpoints
export const podcastsApi = {
  discover: (data: {
    podcast_name: string
    user_id: string
    preferences?: {
      started_listening_date?: string | null
      listen_regularity?: 'every-episode' | 'most-episodes' | 'occasional' | 'rarely' | null
      typical_listen_speed?: 'same-day' | '1-3-days' | '1-week' | 'long-tail' | null
    },
    rss_feed_url?: string
  }) =>
    apiRequest<{ podcast_id: string; preference_id: string; created_count: number }>('/api/podcasts/discover', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getUserPodcasts: (user_id: string, podcast_id?: string) => {
    const url = podcast_id
      ? `/api/users/${user_id}/podcast-preferences?podcast_id=${podcast_id}`
      : `/api/users/${user_id}/podcast-preferences`
    return apiRequest<{ preferences: any[] }>(url)
  },
  updatePreferences: (
    user_id: string,
    podcast_id: string,
    preferences: {
      started_listening_date?: string | null
      listen_regularity?: 'every-episode' | 'most-episodes' | 'occasional' | 'rarely' | null
      typical_listen_speed?: 'same-day' | '1-3-days' | '1-week' | 'long-tail' | null
    }
  ) =>
    apiRequest<{ preference_id: string }>(`/api/users/${user_id}/podcast-preferences/${podcast_id}`, {
      method: 'PUT',
      body: JSON.stringify(preferences),
    }),
}

// GitHub integrations
export const githubIntegrationsApi = {
  authUrl: (user_id: string) =>
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/integrations/github/auth?user_id=${encodeURIComponent(user_id)}`,
  status: (user_id: string) =>
    apiRequest<{ repos: { id: string; full_name: string; repo_owner: string; repo_name: string; branch: string; is_created_by_us: boolean; last_push_at: string | null; last_twitter_sync_at: string | null; last_error: string | null }[] }>(
      `/api/integrations/github/status?user_id=${encodeURIComponent(user_id)}`
    ),
  connect: (data: {
    user_id: string
    code?: string
    personal_access_token?: string
    create_new?: boolean
    repo_name?: string
    is_private?: boolean
    owner?: string
    repo?: string
  }) =>
    apiRequest<{ repo_owner: string; repo_name: string; branch: string }>('/api/integrations/github/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  push: (user_id: string) =>
    apiRequest<{ pushed: boolean; last_push_at?: string; error?: string }>('/api/integrations/github/push', {
      method: 'POST',
      body: JSON.stringify({ user_id }),
    }),
}

// Twitter integrations
export const twitterIntegrationsApi = {
  archiveStatus: () =>
    apiRequest<{ available: boolean; username: string | null }>('/api/integrations/twitter/archive-status'),
  sync: () =>
    apiRequest<{ success: boolean; tweets_synced: number; error?: string; last_synced_at?: string }>('/api/integrations/twitter/sync', {
      method: 'POST',
    }),
}

// Authentication API
export const authApi = {
  me: () =>
    apiRequest<{
      user: {
        user_id: string
        email: string
        name: string | null
        display_name: string | null
        avatar_url: string | null
        primary_provider: 'twitter' | 'github' | null
        created_at: string
      }
      accounts: Array<{
        account_id: string
        provider: 'twitter' | 'github'
        provider_username: string | null
        verified: boolean
        created_at: string
      }>
    }>('/api/auth/me'),

  login: (provider: 'twitter' | 'github') => {
    // This redirects, so we don't use apiRequest
    window.location.href = `${API_URL}/api/auth/${provider}/login`
  },

  linkAccount: (provider: 'twitter' | 'github') => {
    // This redirects, so we don't use apiRequest
    const token = getAuthToken()
    if (!token) {
      console.error('No token available for account linking')
      return
    }
    window.location.href = `${API_URL}/api/auth/${provider}/link?token=${encodeURIComponent(token)}`
  },

  unlinkAccount: (provider: 'twitter' | 'github') =>
    apiRequest<{ success: boolean; message: string }>(`/api/auth/${provider}/unlink`, {
      method: 'DELETE',
    }),

  logout: () =>
    apiRequest<{ success: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
}

// Host API endpoints
export const hostApi = {
  claimPodcast: (data: { podcast_id?: string; rss_feed_url?: string; podcast_name?: string }) =>
    apiRequest<{
      ownership_id: string
      verification_token: string
      verification_instructions: string
      podcast_id: string
    }>('/api/podcasts/claim', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyOwnership: (podcast_id: string) =>
    apiRequest<{ verified: boolean; message: string }>(`/api/podcasts/${podcast_id}/verify`, {
      method: 'POST',
    }),

  getOwnedPodcasts: () =>
    apiRequest<{
      podcasts: Array<{
        ownership_id: string
        podcast_id: string
        title: string
        description: string | null
        image_url: string | null
        website_url: string | null
        verification_status: string
        verification_token: string
        verified_at: string | null
        created_at: string
      }>
    }>('/api/podcasts/owned'),

  getOwnership: (podcast_id: string) =>
    apiRequest<{
      ownership_id: string
      verification_status: string
      verification_token: string
      verified_at: string | null
      created_at: string
    }>(`/api/podcasts/${podcast_id}/ownership`),

  getHostAnalytics: (podcast_id: string) =>
    apiRequest<{
      total_unique_listeners: number
      total_episode_plays: number
      total_episodes: number
      avg_completion_rate: number
      listener_growth: Array<{
        date: string
        new_listeners: number
        total_listeners: number
      }>
      top_episodes: Array<{
        episode_id: string
        title: string
        play_count: number
        avg_completion_rate: number
        unique_listeners: number
      }>
      appointment_listening: {
        same_day: number
        one_to_three_days: number
        one_week: number
        long_tail: number
      }
    }>(`/api/podcasts/${podcast_id}/host/analytics`),

  getHostEpisodes: (podcast_id: string) =>
    apiRequest<{
      episodes: Array<{
        episode_id: string
        title: string
        description: string | null
        duration_sec: number
        release_time: string | null
        audio_url: string | null
        play_count: number
        unique_listeners: number
        avg_completion_rate: number
        guests: Array<{
          guest_id: string
          guest_name: string
          guest_role: string
          metadata: Record<string, any>
        }>
      }>
    }>(`/api/podcasts/${podcast_id}/host/episodes`),

  getHostGuests: (podcast_id: string) =>
    apiRequest<{
      guests: Array<{
        guest_name: string
        appearance_count: number
        episodes: Array<{
          episode_id: string
          title: string
          play_count: number
          avg_completion_rate: number
        }>
      }>
    }>(`/api/podcasts/${podcast_id}/host/guests`),

  addEpisodeGuest: (episode_id: string, data: { guest_name: string; guest_role?: string; metadata?: any }) =>
    apiRequest<{
      guest_id: string
      episode_id: string
      guest_name: string
      guest_role: string
    }>(`/api/episodes/${episode_id}/guests`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGuest: (guest_id: string, data: { guest_name?: string; guest_role?: string; metadata?: any }) =>
    apiRequest<{
      guest_id: string
      guest_name: string
      guest_role: string
      metadata: Record<string, any>
    }>(`/api/guests/${guest_id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getEpisodeAnalytics: (episode_id: string) =>
    apiRequest<{
      episode_id: string
      title: string
      play_count: number
      unique_listeners: number
      completion_rate: number
      bounce_rate: number
      avg_playhead_position: number
      engagement_timeline: Array<{
        timestamp: string
        listeners: number
      }>
    }>(`/api/episodes/${episode_id}/analytics`),
}

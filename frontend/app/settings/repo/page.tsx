'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { githubIntegrationsApi } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'
import AppNav from '@/components/navigation/AppNav'

interface GameSignature {
  G1: number
  G2: number
  G3: number
  G4: number
  G5: number
  G6: number
}

interface GameStats {
  primary_game: string | null
  primary_percentage: number
  classified_count: number
  total_count: number
  signature: GameSignature
}

interface SourceStats {
  file_count: number
  event_count: number
  recent: any[]
  files: string[]
}

interface ArtifactStats {
  file_count: number
  item_count: number
  recent: any[]
  files: string[]
  game_stats?: GameStats
}

interface RepoStats {
  connected: boolean
  repo: { owner: string; name: string; branch: string } | null
  schema_version: string | null
  last_sync: string | null
  sources: Record<string, SourceStats>
  artifacts: Record<string, ArtifactStats>
  reports: string[]
  preferences: string[]
  total_events: number
  total_artifacts: number
}

function formatSourceName(name: string): string {
  const names: Record<string, string> = {
    podcasts: 'Podcasts',
    youtube: 'YouTube',
    twitter: 'Twitter',
    blogs: 'Blogs',
    books: 'Books',
  }
  return names[name] || name.charAt(0).toUpperCase() + name.slice(1)
}

function formatArtifactName(name: string): string {
  const names: Record<string, string> = {
    twitter: 'Tweets',
    blog: 'Blog Posts',
    youtube: 'Videos',
    podcast: 'Episodes',
  }
  return names[name] || name.charAt(0).toUpperCase() + name.slice(1)
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  } catch {
    return ''
  }
}

// Icon components
function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  )
}

function RetweetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
    </svg>
  )
}

// Game names mapping based on the 6 Games framework
const GAME_NAMES: Record<string, string> = {
  G1: 'Identity / Canon',
  G2: 'Idea / Play Mining',
  G3: 'Model / Understanding',
  G4: 'Performance / Coaching',
  G5: 'Meaning / Sensemaking',
  G6: 'Network / Coordination',
}

const GAME_SHORT_NAMES: Record<string, string> = {
  G1: 'Identity',
  G2: 'Ideas',
  G3: 'Models',
  G4: 'Performance',
  G5: 'Meaning',
  G6: 'Network',
}

const GAME_QUESTIONS: Record<string, string> = {
  G1: 'Who should people become—and who should they study?',
  G2: 'What can we extract and apply right now?',
  G3: 'How does this actually work?',
  G4: 'How do you get better results?',
  G5: 'What does this mean for how we live?',
  G6: 'Who should be connected—and how?',
}

const GAME_COLORS: Record<string, string> = {
  G1: '#3b82f6', // blue
  G2: '#10b981', // emerald
  G3: '#f59e0b', // amber
  G4: '#8b5cf6', // violet
  G5: '#ec4899', // pink
  G6: '#ef4444', // red
}

// Game Badge Component - displays primary game and percentage
function GameBadge({ 
  gameStats, 
  size = 'normal',
  showPercentage = true,
}: { 
  gameStats?: GameStats | null
  size?: 'small' | 'normal'
  showPercentage?: boolean
}) {
  if (!gameStats?.primary_game || gameStats.primary_percentage === 0) {
    return (
      <span 
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${size === 'small' ? 'text-xs' : 'text-sm'}`}
        style={{ 
          background: 'var(--bg-darker)', 
          color: 'var(--fg-subtle)',
          border: '1px solid var(--border)'
        }}
      >
        <span style={{ fontSize: size === 'small' ? '0.65rem' : '0.75rem' }}>○</span>
        <span>Not classified</span>
      </span>
    )
  }

  const game = gameStats.primary_game
  const color = GAME_COLORS[game] || 'var(--gold)'
  const shortName = GAME_SHORT_NAMES[game] || game
  const fullName = GAME_NAMES[game] || game
  const question = GAME_QUESTIONS[game] || ''
  
  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${size === 'small' ? 'text-xs' : 'text-sm'}`}
      style={{ 
        background: `${color}15`, 
        color: color,
        border: `1px solid ${color}40`
      }}
      title={`${fullName}\n${question}${showPercentage ? `\n\n${gameStats.primary_percentage}% confidence` : ''}`}
    >
      <span style={{ fontWeight: 600 }}>{game}</span>
      <span style={{ opacity: 0.85 }}>{shortName}</span>
      {showPercentage && (
        <span style={{ opacity: 0.7, marginLeft: '2px' }}>{gameStats.primary_percentage}%</span>
      )}
    </span>
  )
}

// Item-level game badge - extracts game info from artifact item
function ItemGameBadge({ item, size = 'small' }: { item: any; size?: 'small' | 'normal' }) {
  const analysis = item.analysis
  if (!analysis?.game_signature) {
    return <GameBadge gameStats={null} size={size} showPercentage={false} />
  }
  
  const sig = analysis.game_signature as GameSignature
  const entries = Object.entries(sig) as [string, number][]
  const sorted = entries.sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, val]) => sum + val, 0)
  
  if (sorted[0][1] === 0 || total === 0) {
    return <GameBadge gameStats={null} size={size} showPercentage={false} />
  }
  
  const gameStats: GameStats = {
    primary_game: sorted[0][0],
    primary_percentage: Math.round((sorted[0][1] / total) * 100),
    classified_count: 1,
    total_count: 1,
    signature: sig,
  }
  
  return <GameBadge gameStats={gameStats} size={size} />
}

// Tweet Card Component
function TweetCard({ tweet }: { tweet: any }) {
  const text = tweet.tweet?.text || tweet.full_text || tweet.text || ''
  const likes = tweet.metrics?.likes ?? tweet.favorite_count ?? 0
  const retweets = tweet.metrics?.retweets ?? tweet.retweet_count ?? 0
  const timestamp = tweet.tweet?.created_at || tweet.timestamp || tweet.created_at
  const url = tweet.tweet?.url || (tweet.id ? `https://twitter.com/i/web/status/${tweet.id}` : null)
  const tweetType = tweet.tweet?.type || 'original'
  
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          {tweetType === 'reply' && (
            <div className="text-xs mb-1" style={{ color: 'var(--fg-subtle)' }}>
              Replying to a tweet
            </div>
          )}
        </div>
        <ItemGameBadge item={tweet} size="small" />
      </div>
      <p className="text-sm mb-2" style={{ color: 'var(--fg)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
        {text}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-subtle)' }}>
            <HeartIcon /> {likes.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-subtle)' }}>
            <RetweetIcon /> {retweets.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {timestamp && (
            <span className="text-xs" style={{ color: 'var(--fg-subtle)' }} title={formatTimestamp(timestamp)}>
              {formatRelativeTime(timestamp)}
            </span>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs"
              style={{ color: 'var(--gold)' }}
            >
              View
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// Source Event Card Component
function SourceEventCard({ event, sourceType }: { event: any; sourceType: string }) {
  const timestamp = event.timestamp
  
  // Podcast listening event
  if (sourceType === 'podcasts' || event.podcast) {
    const podcastTitle = event.podcast?.title || 'Unknown Podcast'
    const episodeTitle = event.episode?.title || 'Unknown Episode'
    const eventType = event.event_type || 'listen'
    const completion = event.listening?.completion_percentage
    
    return (
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--fg)' }}>
              {episodeTitle}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>
              {podcastTitle}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs capitalize" style={{ color: eventType === 'complete' ? 'var(--gold)' : 'var(--fg-subtle)' }}>
              {eventType}
            </div>
            {completion !== undefined && (
              <div className="text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>
                {Math.round(completion)}%
              </div>
            )}
          </div>
        </div>
        {timestamp && (
          <div className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }} title={formatTimestamp(timestamp)}>
            {formatRelativeTime(timestamp)}
          </div>
        )}
      </div>
    )
  }
  
  // Twitter reading event
  if (sourceType === 'twitter' && event.tweet) {
    const text = event.tweet.text || ''
    return (
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--fg-dim)' }}>
          {text.length > 120 ? text.substring(0, 120) + '...' : text}
        </p>
        {timestamp && (
          <div className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }} title={formatTimestamp(timestamp)}>
            {formatRelativeTime(timestamp)}
          </div>
        )}
      </div>
    )
  }
  
  // Generic event
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
      <p className="text-sm" style={{ color: 'var(--fg-dim)', wordBreak: 'break-word' }}>
        {event.title || event.text || JSON.stringify(event).substring(0, 150)}...
      </p>
      {timestamp && (
        <div className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }} title={formatTimestamp(timestamp)}>
          {formatRelativeTime(timestamp)}
        </div>
      )}
    </div>
  )
}

// Format duration in minutes/hours
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes} min`
}

// Artifact Card Component - determines which card to use based on type
function ArtifactCard({ item, artifactType }: { item: any; artifactType: string }) {
  if (artifactType === 'twitter') {
    return <TweetCard tweet={item} />
  }
  
  // Podcast episode artifact
  if (artifactType === 'podcast') {
    const episode = item.episode || {}
    const title = episode.title || item.title || 'Untitled Episode'
    const description = episode.description || ''
    const publishDate = episode.publish_date || item.timestamp
    const duration = episode.duration_seconds
    const url = episode.episode_url
    const episodeId = episode.episode_id || item.id
    
    return (
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
                {title}
              </div>
              <ItemGameBadge item={item} size="small" />
            </div>
            {description && (
              <p className="text-xs mt-1" style={{ color: 'var(--fg-dim)', lineHeight: '1.4' }}>
                {description.length > 150 ? description.substring(0, 150) + '...' : description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {publishDate && (
                <span className="text-xs" style={{ color: 'var(--fg-subtle)' }} title={formatTimestamp(publishDate)}>
                  {formatRelativeTime(publishDate)}
                </span>
              )}
              {duration && (
                <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                  {formatDuration(duration)}
                </span>
              )}
              {episodeId && (
                <span className="text-xs font-mono" style={{ color: 'var(--fg-subtle)' }}>
                  {episodeId}
                </span>
              )}
            </div>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs flex-shrink-0"
              style={{ color: 'var(--gold)' }}
            >
              Listen
            </a>
          )}
        </div>
      </div>
    )
  }
  
  // Blog post
  if (artifactType === 'blog') {
    const title = item.title || item.post?.title || 'Untitled Post'
    const excerpt = item.excerpt || item.post?.excerpt || ''
    const timestamp = item.timestamp || item.created_at
    
    return (
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{title}</div>
          <ItemGameBadge item={item} size="small" />
        </div>
        {excerpt && (
          <p className="text-xs mt-1" style={{ color: 'var(--fg-dim)' }}>
            {excerpt.length > 150 ? excerpt.substring(0, 150) + '...' : excerpt}
          </p>
        )}
        {timestamp && (
          <div className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }}>
            {formatRelativeTime(timestamp)}
          </div>
        )}
      </div>
    )
  }
  
  // YouTube video
  if (artifactType === 'youtube') {
    const video = item.video || {}
    const title = video.title || item.title || 'Untitled Video'
    const description = video.description || item.description || ''
    const timestamp = video.publish_date || item.timestamp || item.created_at
    const duration = video.duration_seconds || item.duration_seconds
    const url = video.url || item.url
    
    return (
      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{title}</div>
              <ItemGameBadge item={item} size="small" />
            </div>
            {description && (
              <p className="text-xs mt-1" style={{ color: 'var(--fg-dim)' }}>
                {description.length > 100 ? description.substring(0, 100) + '...' : description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {timestamp && (
                <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                  {formatRelativeTime(timestamp)}
                </span>
              )}
              {duration && (
                <span className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                  {formatDuration(duration)}
                </span>
              )}
            </div>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs flex-shrink-0"
              style={{ color: 'var(--gold)' }}
            >
              Watch
            </a>
          )}
        </div>
      </div>
    )
  }
  
  // Generic artifact - try to find title in nested structures
  const title = item.title || item.episode?.title || item.video?.title || item.post?.title || item.name || 'Untitled'
  const timestamp = item.timestamp || item.created_at || item.episode?.publish_date
  
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm" style={{ color: 'var(--fg)' }}>{title}</div>
        <ItemGameBadge item={item} size="small" />
      </div>
      {timestamp && (
        <div className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }}>
          {formatRelativeTime(timestamp)}
        </div>
      )}
    </div>
  )
}

export default function RepoStatsPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<RepoStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (user) {
      loadStats()
    }
  }, [user])

  async function loadStats() {
    try {
      setLoading(true)
      setError(null)
      const data = await githubIntegrationsApi.repoStats()
      setStats(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load repo stats')
    } finally {
      setLoading(false)
    }
  }

  function toggleSection(section: string) {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1>Repository Content</h1>
          <Link href="/settings/integrations" className="button secondary">
            Back to Integrations
          </Link>
        </div>

        <p className="mb-8" style={{ color: 'var(--fg-dim)' }}>
          View the contents of your connected MetaSPN content repository.
        </p>

        {!user && (
          <div className="mb-8 p-4 question-card" style={{ background: 'rgba(212, 175, 55, 0.1)', borderColor: 'var(--gold)' }}>
            <p style={{ color: 'var(--gold)' }}>Please log in to view repo stats.</p>
          </div>
        )}

        {user && loading && (
          <div className="text-center py-12">
            <p style={{ color: 'var(--fg-subtle)' }}>Loading repository contents...</p>
          </div>
        )}

        {user && error && (
          <div className="mb-4 error-message" style={{ padding: '0.75rem', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)' }}>
            {error}
          </div>
        )}

        {user && !loading && stats && !stats.connected && (
          <div className="question-card text-center py-8">
            <p className="mb-4" style={{ color: 'var(--fg-dim)' }}>No repository connected.</p>
            <Link href="/settings/integrations" className="button">
              Connect Repository
            </Link>
          </div>
        )}

        {user && !loading && stats && stats.connected && stats.repo && (
          <>
            {/* Repo Info */}
            <section className="mb-8">
              <div className="question-card">
                <h2 className="mb-4">Repository Info</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Repository</div>
                    <a
                      href={`https://github.com/${stats.repo.owner}/${stats.repo.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm"
                      style={{ color: 'var(--gold)' }}
                    >
                      {stats.repo.owner}/{stats.repo.name}
                    </a>
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Branch</div>
                    <div className="font-mono text-sm">{stats.repo.branch}</div>
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Schema Version</div>
                    <div className="font-mono text-sm">{stats.schema_version || 'Unknown'}</div>
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Last Sync</div>
                    <div className="text-sm">{stats.last_sync ? formatTimestamp(stats.last_sync) : 'Never'}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Overview Stats */}
            <section className="mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="question-card">
                  <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Total Events</div>
                  <div className="text-4xl font-bold" style={{ color: 'var(--gold)' }}>{stats.total_events.toLocaleString()}</div>
                  <div className="text-sm mt-2" style={{ color: 'var(--fg-subtle)' }}>
                    Across {Object.keys(stats.sources).length} source types
                  </div>
                </div>
                <div className="question-card">
                  <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Total Artifacts</div>
                  <div className="text-4xl font-bold" style={{ color: 'var(--gold)' }}>{stats.total_artifacts.toLocaleString()}</div>
                  <div className="text-sm mt-2" style={{ color: 'var(--fg-subtle)' }}>
                    Across {Object.keys(stats.artifacts).length} artifact types
                  </div>
                </div>
              </div>
            </section>

            {/* Sources Breakdown */}
            <section className="mb-8">
              <h2 className="mb-4">Sources</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
                Raw event logs for content consumption (append-only). These files are populated as you log listening/reading activity.
              </p>
              {Object.keys(stats.sources).length === 0 ? (
                <div className="question-card">
                  <p style={{ color: 'var(--fg-subtle)' }}>No source directories found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(stats.sources).map(([sourceType, source]) => (
                    <div key={sourceType} className="question-card">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleSection(`source-${sourceType}`)}
                      >
                        <div className="flex items-center gap-4">
                          <h3 className="font-medium">{formatSourceName(sourceType)}</h3>
                          <span className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                            {source.file_count} file{source.file_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span 
                            className="text-2xl font-bold" 
                            style={{ color: source.event_count > 0 ? 'var(--gold)' : 'var(--fg-subtle)' }}
                          >
                            {source.event_count.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--fg-subtle)' }}>
                            {expandedSections[`source-${sourceType}`] ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      {expandedSections[`source-${sourceType}`] && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                          {/* File info */}
                          {source.files?.length > 0 && (
                            <div className="mb-4">
                              <div className="text-xs mb-2" style={{ color: 'var(--fg-subtle)' }}>
                                Files:
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {source.files.map((file) => (
                                  <span
                                    key={file}
                                    className="text-xs font-mono px-2 py-1 rounded"
                                    style={{ background: 'var(--bg-darker)', color: 'var(--fg-dim)' }}
                                  >
                                    {file}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Recent events */}
                          {source.recent.length > 0 ? (
                            <>
                              <div className="text-sm font-medium mb-3" style={{ color: 'var(--fg-dim)' }}>
                                Recent Events
                              </div>
                              <div className="space-y-3">
                                {source.recent.map((event, idx) => (
                                  <SourceEventCard key={idx} event={event} sourceType={sourceType} />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                              No events recorded yet in these files.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Artifacts Breakdown */}
            <section className="mb-8">
              <h2 className="mb-4">Artifacts</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
                Content you created (your output). Synced from your connected accounts.
              </p>
              {Object.keys(stats.artifacts).length === 0 ? (
                <div className="question-card">
                  <p style={{ color: 'var(--fg-subtle)' }}>No artifacts recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(stats.artifacts).map(([artifactType, artifact]) => (
                    <div key={artifactType} className="question-card">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleSection(`artifact-${artifactType}`)}
                      >
                        <div className="flex items-center gap-4">
                          <h3 className="font-medium">{formatArtifactName(artifactType)}</h3>
                          <span className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                            {artifact.file_count} file{artifact.file_count !== 1 ? 's' : ''}
                          </span>
                          {artifact.game_stats && (
                            <GameBadge gameStats={artifact.game_stats} size="normal" />
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span 
                            className="text-2xl font-bold" 
                            style={{ color: artifact.item_count > 0 ? 'var(--gold)' : 'var(--fg-subtle)' }}
                          >
                            {artifact.item_count.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--fg-subtle)' }}>
                            {expandedSections[`artifact-${artifactType}`] ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      {expandedSections[`artifact-${artifactType}`] && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                          {/* Classification stats */}
                          {artifact.game_stats && (
                            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-darker)' }}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                                    Game Classification
                                  </span>
                                  <div className="text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>
                                    {artifact.game_stats.classified_count} of {artifact.game_stats.total_count} items classified
                                  </div>
                                </div>
                                {artifact.game_stats.primary_game && (
                                  <div className="text-right">
                                    <div className="text-lg font-bold" style={{ color: GAME_COLORS[artifact.game_stats.primary_game] || 'var(--gold)' }}>
                                      {artifact.game_stats.primary_game}: {GAME_SHORT_NAMES[artifact.game_stats.primary_game] || ''}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                                      {GAME_NAMES[artifact.game_stats.primary_game] || artifact.game_stats.primary_game}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Game distribution bar */}
                              {artifact.game_stats.classified_count > 0 && (
                                <div className="mt-3">
                                  <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
                                    {Object.entries(artifact.game_stats.signature)
                                      .filter(([, val]) => val > 0.01)
                                      .sort((a, b) => b[1] - a[1])
                                      .map(([game, val]) => (
                                        <div
                                          key={game}
                                          style={{
                                            width: `${val * 100}%`,
                                            backgroundColor: GAME_COLORS[game] || 'var(--fg-subtle)',
                                          }}
                                          title={`${game}: ${Math.round(val * 100)}%`}
                                        />
                                      ))}
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {Object.entries(artifact.game_stats.signature)
                                      .filter(([, val]) => val > 0.01)
                                      .sort((a, b) => b[1] - a[1])
                                      .map(([game, val]) => (
                                        <span
                                          key={game}
                                          className="text-xs"
                                          style={{ color: GAME_COLORS[game] || 'var(--fg-subtle)' }}
                                        >
                                          {game}: {Math.round(val * 100)}%
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {/* File info */}
                          {artifact.files?.length > 0 && (
                            <div className="mb-4">
                              <div className="text-xs mb-2" style={{ color: 'var(--fg-subtle)' }}>
                                Files:
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {artifact.files.map((file) => (
                                  <span
                                    key={file}
                                    className="text-xs font-mono px-2 py-1 rounded"
                                    style={{ background: 'var(--bg-darker)', color: 'var(--fg-dim)' }}
                                  >
                                    {file}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Recent items */}
                          {artifact.recent.length > 0 ? (
                            <>
                              <div className="text-sm font-medium mb-3" style={{ color: 'var(--fg-dim)' }}>
                                Recent {formatArtifactName(artifactType)}
                              </div>
                              <div className="space-y-3">
                                {artifact.recent.map((item, idx) => (
                                  <ArtifactCard key={idx} item={item} artifactType={artifactType} />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                              No items recorded yet in these files.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Reports & Preferences */}
            <section className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="question-card">
                  <h3 className="font-medium mb-3">Reports</h3>
                  {stats.reports.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>No reports generated yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {stats.reports.map((report) => (
                        <li key={report} className="text-sm font-mono" style={{ color: 'var(--fg-dim)' }}>
                          {report}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="question-card">
                  <h3 className="font-medium mb-3">Preferences</h3>
                  {stats.preferences.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>No preferences saved yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {stats.preferences.map((pref) => (
                        <li key={pref} className="text-sm font-mono" style={{ color: 'var(--fg-dim)' }}>
                          {pref}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Refresh Button */}
            <div className="text-center">
              <button onClick={loadStats} className="button secondary" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh Stats'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

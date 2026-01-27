'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { githubIntegrationsApi } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'
import AppNav from '@/components/navigation/AppNav'

interface SourceStats {
  file_count: number
  event_count: number
  recent: any[]
}

interface ArtifactStats {
  file_count: number
  item_count: number
  recent: any[]
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
  const date = new Date(timestamp)
  return date.toLocaleString()
}

function getEventPreview(event: any): string {
  // Try to get a meaningful preview based on event type
  if (event.podcast?.title) {
    return `${event.podcast.title}${event.episode?.title ? ` - ${event.episode.title}` : ''}`
  }
  if (event.tweet?.text) {
    return event.tweet.text.substring(0, 100) + (event.tweet.text.length > 100 ? '...' : '')
  }
  if (event.title) {
    return event.title
  }
  if (event.text) {
    return event.text.substring(0, 100) + (event.text.length > 100 ? '...' : '')
  }
  return JSON.stringify(event).substring(0, 80) + '...'
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
                Raw event logs for content consumption (append-only).
              </p>
              {Object.keys(stats.sources).length === 0 ? (
                <div className="question-card">
                  <p style={{ color: 'var(--fg-subtle)' }}>No source events recorded yet.</p>
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
                          <span className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                            {source.event_count.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--fg-subtle)' }}>
                            {expandedSections[`source-${sourceType}`] ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      {expandedSections[`source-${sourceType}`] && source.recent.length > 0 && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                          <div className="text-sm font-medium mb-2" style={{ color: 'var(--fg-dim)' }}>Recent Events</div>
                          <div className="space-y-2">
                            {source.recent.map((event, idx) => (
                              <div
                                key={idx}
                                className="text-sm p-2 rounded"
                                style={{ background: 'var(--bg-darker)', color: 'var(--fg-subtle)' }}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className="flex-1" style={{ wordBreak: 'break-word' }}>
                                    {getEventPreview(event)}
                                  </span>
                                  {event.timestamp && (
                                    <span className="text-xs whitespace-nowrap" style={{ color: 'var(--fg-subtle)' }}>
                                      {formatTimestamp(event.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
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
                Content you created (your output).
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
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                            {artifact.item_count.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--fg-subtle)' }}>
                            {expandedSections[`artifact-${artifactType}`] ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      {expandedSections[`artifact-${artifactType}`] && artifact.recent.length > 0 && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                          <div className="text-sm font-medium mb-2" style={{ color: 'var(--fg-dim)' }}>Recent Items</div>
                          <div className="space-y-2">
                            {artifact.recent.map((item, idx) => (
                              <div
                                key={idx}
                                className="text-sm p-2 rounded"
                                style={{ background: 'var(--bg-darker)', color: 'var(--fg-subtle)' }}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className="flex-1" style={{ wordBreak: 'break-word' }}>
                                    {getEventPreview(item)}
                                  </span>
                                  {item.timestamp && (
                                    <span className="text-xs whitespace-nowrap" style={{ color: 'var(--fg-subtle)' }}>
                                      {formatTimestamp(item.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
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

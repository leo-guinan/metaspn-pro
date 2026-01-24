'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import AddGuestForm from './AddGuestForm'

interface Episode {
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
}

interface EpisodeListProps {
  podcast_id: string
}

export default function EpisodeList({ podcast_id }: EpisodeListProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null)

  useEffect(() => {
    loadEpisodes()
  }, [podcast_id])

  const loadEpisodes = async () => {
    try {
      setLoading(true)
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      const result = await api.hostApi.getHostEpisodes(podcast_id)
      setEpisodes(result.episodes)
    } catch (err: any) {
      setError(err.message || 'Failed to load episodes')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  if (loading) {
    return (
      <div className="question-card">
        <p style={{ color: 'var(--fg-dim)' }}>Loading episodes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-message">
        {error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {episodes.map((episode) => (
        <div
          key={episode.episode_id}
          className="question-card"
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem', margin: 0 }}>{episode.title}</h3>
              {episode.description && (
                <p style={{ fontSize: '0.9rem', color: 'var(--fg-dim)', lineHeight: 1.6, marginTop: '0.5rem' }}>
                  {episode.description}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Duration</p>
              <p style={{ fontWeight: 500, margin: 0 }}>{formatDuration(episode.duration_sec)}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Plays</p>
              <p style={{ fontWeight: 500, margin: 0 }}>{episode.play_count}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Listeners</p>
              <p style={{ fontWeight: 500, margin: 0 }}>{episode.unique_listeners}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Completion</p>
              <p style={{ fontWeight: 500, margin: 0 }}>{(episode.avg_completion_rate * 100).toFixed(1)}%</p>
            </div>
          </div>

          {/* Guests */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Guests</h4>
              <button
                onClick={() =>
                  setSelectedEpisode(
                    selectedEpisode === episode.episode_id ? null : episode.episode_id
                  )
                }
                style={{ 
                  fontSize: '0.85rem', 
                  color: 'var(--gold)', 
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  textDecoration: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                {selectedEpisode === episode.episode_id ? 'Cancel' : 'Add Guest'}
              </button>
            </div>
            {episode.guests.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {episode.guests.map((guest) => (
                  <span
                    key={guest.guest_id}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--mono)'
                    }}
                  >
                    {guest.guest_name} ({guest.guest_role})
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)' }}>No guests added</p>
            )}
          </div>

          {selectedEpisode === episode.episode_id && (
            <AddGuestForm
              episode_id={episode.episode_id}
              onSuccess={() => {
                setSelectedEpisode(null)
                loadEpisodes()
              }}
              onCancel={() => setSelectedEpisode(null)}
            />
          )}
        </div>
      ))}

      {episodes.length === 0 && (
        <div className="question-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--fg-dim)' }}>No episodes found</p>
        </div>
      )}
    </div>
  )
}

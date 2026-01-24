'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import Link from 'next/link'

interface Guest {
  guest_name: string
  appearance_count: number
  episodes: Array<{
    episode_id: string
    title: string
    play_count: number
    avg_completion_rate: number
  }>
}

interface GuestsListProps {
  podcast_id: string
}

export default function GuestsList({ podcast_id }: GuestsListProps) {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadGuests()
  }, [podcast_id])

  const loadGuests = async () => {
    try {
      setLoading(true)
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      const result = await api.hostApi.getHostGuests(podcast_id)
      setGuests(result.guests)
    } catch (err: any) {
      setError(err.message || 'Failed to load guests')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="question-card">
        <p style={{ color: 'var(--fg-dim)' }}>Loading guests...</p>
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
      {guests.map((guest) => (
        <div
          key={guest.guest_name}
          className="question-card"
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem', margin: 0 }}>{guest.guest_name}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)', fontFamily: 'var(--mono)' }}>
                {guest.appearance_count} appearance{guest.appearance_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 500, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-subtle)' }}>
              Episodes:
            </h4>
            {guest.episodes.map((episode) => (
              <div
                key={episode.episode_id}
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px'
                }}
              >
                <Link
                  href={`/game/podcast/host/podcast/${podcast_id}/episodes`}
                  style={{ fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  {episode.title}
                </Link>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--fg-dim)', marginTop: '0.25rem' }}>
                  <span>{episode.play_count} plays</span>
                  <span>{(episode.avg_completion_rate * 100).toFixed(1)}% completion</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {guests.length === 0 && (
        <div className="question-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--fg-dim)' }}>No guests found</p>
        </div>
      )}
    </div>
  )
}

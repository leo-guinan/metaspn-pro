'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import Link from 'next/link'

interface OwnedPodcast {
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
}

export default function OwnedPodcastsList() {
  const [podcasts, setPodcasts] = useState<OwnedPodcast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPodcasts()
  }, [])

  const loadPodcasts = async () => {
    try {
      setLoading(true)
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      const result = await api.hostApi.getOwnedPodcasts()
      setPodcasts(result.podcasts)
    } catch (err: any) {
      setError(err.message || 'Failed to load owned podcasts')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const baseStyle: React.CSSProperties = {
      padding: '0.25rem 0.75rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 500,
      fontFamily: 'var(--mono)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }
    
    switch (status) {
      case 'verified':
        return (
          <span style={{ ...baseStyle, background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)', border: '1px solid var(--gold)' }}>
            Verified
          </span>
        )
      case 'pending':
        return (
          <span style={{ ...baseStyle, background: 'rgba(212, 175, 55, 0.05)', color: 'var(--fg-dim)', border: '1px solid var(--border)' }}>
            Pending
          </span>
        )
      case 'failed':
        return (
          <span style={{ ...baseStyle, background: 'rgba(196, 30, 58, 0.1)', color: 'var(--red)', border: '1px solid var(--red)' }}>
            Failed
          </span>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="question-card">
        <p style={{ color: 'var(--fg-dim)' }}>Loading your podcasts...</p>
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

  if (podcasts.length === 0) {
    return (
      <div className="question-card">
        <p style={{ color: 'var(--fg-dim)' }}>
          You haven't claimed any podcasts yet. Claim your first podcast to get started!
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {podcasts.map((podcast) => (
        <div
          key={podcast.ownership_id}
          className="question-card"
        >
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            {podcast.image_url && (
              <img
                src={podcast.image_url}
                alt={podcast.title}
                style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover' }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{podcast.title}</h3>
                {getStatusBadge(podcast.verification_status)}
              </div>
              {podcast.description && (
                <p style={{ color: 'var(--fg-dim)', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                  {podcast.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <Link
                  href={`/game/podcast/host/podcast/${podcast.podcast_id}`}
                  style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '0.9rem', fontFamily: 'var(--mono)' }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  View Dashboard →
                </Link>
                {podcast.website_url && (
                  <a
                    href={podcast.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--fg-dim)', textDecoration: 'none', fontSize: '0.9rem' }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                  >
                    Visit Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

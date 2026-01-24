'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import GameNav from '@/components/game/GameNav'
import PodcastAnalytics from '@/components/host/PodcastAnalytics'
import EpisodeList from '@/components/host/EpisodeList'
import GuestsList from '@/components/host/GuestsList'
import * as api from '@/lib/api'
import Link from 'next/link'

type Tab = 'analytics' | 'episodes' | 'guests'

export default function HostPodcastPage() {
  const params = useParams()
  const router = useRouter()
  const podcast_id = params.podcast_id as string
  const [activeTab, setActiveTab] = useState<Tab>('analytics')
  const [podcast, setPodcast] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPodcast()
  }, [podcast_id])

  const loadPodcast = async () => {
    try {
      setLoading(true)
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      const result = await api.hostApi.getOwnedPodcasts()
      const found = result.podcasts.find((p) => p.podcast_id === podcast_id)
      if (found) {
        setPodcast(found)
      } else {
        setError('Podcast not found or you do not have access')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load podcast')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <GameNav />
        <div className="container mx-auto px-4 py-8">
          <p style={{ color: 'var(--fg-dim)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div>
        <GameNav />
        <div className="container mx-auto px-4 py-8">
          <div className="error-message">
            {error || 'Podcast not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <GameNav />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <Link
              href="/game/podcast/host"
              style={{ 
                color: 'var(--gold)', 
                textDecoration: 'none', 
                fontFamily: 'var(--mono)',
                fontSize: '0.9rem',
                marginBottom: '0.5rem',
                display: 'inline-block'
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              ← Back to Host Dashboard
            </Link>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginTop: '1rem' }}>
              {podcast.image_url && (
                <img
                  src={podcast.image_url}
                  alt={podcast.title}
                  style={{ width: '96px', height: '96px', borderRadius: '8px', objectFit: 'cover' }}
                />
              )}
              <div>
                <h1 style={{ marginBottom: '0.5rem' }}>{podcast.title}</h1>
                {podcast.description && (
                  <p style={{ color: 'var(--fg-dim)' }}>{podcast.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
            <nav style={{ display: 'flex', gap: '2rem' }}>
              {(['analytics', 'episodes', 'guests'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '1rem 0.25rem',
                    borderBottom: `2px solid ${activeTab === tab ? 'var(--gold)' : 'transparent'}`,
                    fontWeight: 500,
                    fontSize: '0.9rem',
                    fontFamily: 'var(--mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    color: activeTab === tab ? 'var(--gold)' : 'var(--fg-dim)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.color = 'var(--fg)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.color = 'var(--fg-dim)'
                    }
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'analytics' && <PodcastAnalytics podcast_id={podcast_id} />}
            {activeTab === 'episodes' && <EpisodeList podcast_id={podcast_id} />}
            {activeTab === 'guests' && <GuestsList podcast_id={podcast_id} />}
          </div>
        </div>
      </div>
    </div>
  )
}

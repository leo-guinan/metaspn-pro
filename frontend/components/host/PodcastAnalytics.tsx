'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/api'

interface PodcastAnalyticsProps {
  podcast_id: string
}

export default function PodcastAnalytics({ podcast_id }: PodcastAnalyticsProps) {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalytics()
  }, [podcast_id])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      const data = await api.hostApi.getHostAnalytics(podcast_id)
      setAnalytics(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="question-card">
        <p style={{ color: 'var(--fg-dim)' }}>Loading analytics...</p>
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

  if (!analytics) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Overview Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="question-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', color: 'var(--fg-subtle)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Listeners
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>{analytics.total_unique_listeners}</p>
        </div>
        <div className="question-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', color: 'var(--fg-subtle)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Plays
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>{analytics.total_episode_plays}</p>
        </div>
        <div className="question-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', color: 'var(--fg-subtle)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Episodes
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>{analytics.total_episodes}</p>
        </div>
        <div className="question-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', color: 'var(--fg-subtle)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Avg Completion
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>
            {(analytics.avg_completion_rate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Appointment Listening */}
      <div className="question-card">
        <h3 className="mb-4">Appointment Listening</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)', marginBottom: '0.5rem' }}>Same Day</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>{analytics.appointment_listening.same_day}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)', marginBottom: '0.5rem' }}>1-3 Days</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
              {analytics.appointment_listening.one_to_three_days}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)', marginBottom: '0.5rem' }}>1 Week</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>{analytics.appointment_listening.one_week}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--fg-dim)', marginBottom: '0.5rem' }}>Long Tail</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>{analytics.appointment_listening.long_tail}</p>
          </div>
        </div>
      </div>

      {/* Top Episodes */}
      <div className="question-card">
        <h3 className="mb-4">Top Episodes by Engagement</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {analytics.top_episodes.map((episode: any, index: number) => (
            <div
              key={episode.episode_id}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '0.75rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 500, margin: 0, marginBottom: '0.25rem' }}>{episode.title}</p>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--fg-dim)' }}>
                  <span>{episode.play_count} plays</span>
                  <span>{episode.unique_listeners} listeners</span>
                  <span>{(episode.avg_completion_rate * 100).toFixed(1)}% completion</span>
                </div>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--fg-subtle)', fontFamily: 'var(--mono)' }}>
                #{index + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Listener Growth (simplified - could add chart library later) */}
      {analytics.listener_growth.length > 0 && (
        <div className="question-card">
          <h3 className="mb-4">Listener Growth (Last 30 Days)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {analytics.listener_growth.slice(-7).map((day: any) => (
              <div key={day.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--fg-dim)' }}>{day.date}</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>
                    +{day.new_listeners} new
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{day.total_listeners} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

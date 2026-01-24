'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import GameNav from '@/components/game/GameNav'
import { useGame } from '@/lib/contexts/GameContext'
import { useAuth } from '@/lib/contexts/AuthContext'
import AddPodcastForm from '@/components/listener/AddPodcastForm'
import { podcastsApi, dashboardApi } from '@/lib/api'
import StatsOverview from '@/components/dashboard/StatsOverview'
import CompletionDistribution from '@/components/dashboard/CompletionDistribution'
import FanScoreList from '@/components/dashboard/FanScoreList'
import InfluenceTimeline from '@/components/dashboard/InfluenceTimeline'
import RecentActivity from '@/components/dashboard/RecentActivity'

export default function ListenerPage() {
  const router = useRouter()
  const { selection, setSelection } = useGame()
  const { user } = useAuth()
  const [showAddForm, setShowAddForm] = useState(false)
  const [podcasts, setPodcasts] = useState<any[]>([])
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Restore selection from route if not in context (e.g., on page refresh)
    if (typeof window !== 'undefined') {
      const path = window.location.pathname
      if (path.startsWith('/game/podcast/listener') && !selection) {
        setSelection({
          game: 'podcast',
          role: 'listener',
        })
      }
    }
  }, [setSelection])

  useEffect(() => {
    // Only redirect if we're mounted and selection doesn't match
    if (!mounted) return

    // Wait a moment for selection to be restored from localStorage
    const timer = setTimeout(() => {
      if (selection) {
        if (selection.game !== 'podcast' || selection.role !== 'listener') {
          router.push('/')
        }
      } else {
        // If no selection after mount, check route and restore or redirect
        if (typeof window !== 'undefined') {
          const path = window.location.pathname
          if (path.startsWith('/game/podcast/listener')) {
            // We're on the right route, restore selection
            setSelection({
              game: 'podcast',
              role: 'listener',
            })
          } else {
            router.push('/')
          }
        }
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [selection, router, mounted, setSelection])

  useEffect(() => {
    if (mounted && selection?.game === 'podcast' && selection.role === 'listener' && user) {
      loadPodcasts()
      loadDashboardData()
    }
  }, [selection, mounted, user])

  const loadDashboardData = async () => {
    if (!user) return
    try {
      const data = await dashboardApi.getStats(user.user_id)
      setDashboardData(data)
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setDashboardLoading(false)
    }
  }

  const loadPodcasts = async () => {
    if (!user) return
    try {
      const result = await podcastsApi.getUserPodcasts(user.user_id)
      setPodcasts(result.preferences || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load podcasts')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPodcast = async (data: any) => {
    if (!user) return

    setError(null)
    setLoading(true)

    try {
      const result = await podcastsApi.discover({
        podcast_name: data.podcast_name,
        user_id: user.user_id,
        preferences: {
          started_listening_date: data.started_listening_date,
          listen_regularity: data.listen_regularity,
          typical_listen_speed: data.typical_listen_speed,
        },
        rss_feed_url: data.rss_feed_url,
      })

      // Reload podcasts list to show the newly added podcast
      await loadPodcasts()
      setShowAddForm(false)
      
      // Show success message if available
      if (result.message) {
        // You could add a toast notification here
        console.log('Success:', result.message)
      }
    } catch (err: any) {
      console.error('Add podcast error:', err)
      // Extract error message from response
      const errorMessage = err.message || 
                          (err.error?.message) || 
                          (typeof err === 'string' ? err : 'Failed to add podcast')
      setError(errorMessage)
      setLoading(false)
    }
  }

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center loading">Loading...</div>
        </div>
      </div>
    )
  }

  // Show content even if selection is being restored
  const isListenerRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/game/podcast/listener')
  if (!selection && !isListenerRoute) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <GameNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center loading">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <GameNav />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1>Listener Dashboard</h1>
            <div className="flex items-center gap-3">
              <Link
                href="/settings/integrations"
                className="button secondary"
              >
                Integrations
              </Link>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="button"
                >
                  Add Podcast
                </button>
              )}
            </div>
          </div>

          <p className="mb-8" style={{ color: 'var(--fg-dim)', fontSize: '1.1rem' }}>
            Track your listening habits, discover your influence patterns, and see how podcasts shape your thinking.
          </p>

          {showAddForm && (
            <AddPodcastForm onSubmit={handleAddPodcast} onCancel={() => setShowAddForm(false)} />
          )}

          {error && (
            <div className="error-message mb-6" style={{ padding: '1rem', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)' }}>
              {error}
            </div>
          )}

          {/* Dashboard Stats Section */}
          {!dashboardLoading && dashboardData && (
            <div className="mb-12">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-1">
                  <StatsOverview data={dashboardData?.stats} />
                </div>
                <div className="lg:col-span-2">
                  <CompletionDistribution data={dashboardData?.completion_distribution} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <FanScoreList data={dashboardData?.top_podcasts} />
                <RecentActivity data={dashboardData?.recent_activity} />
              </div>

              <div className="mb-8">
                <h2 className="mb-4">Your Listening as a Graph of Influence Over Time</h2>
                <InfluenceTimeline data={dashboardData?.influence_timeline} />
              </div>
            </div>
          )}

          {/* Podcasts Section */}
          <div className="mb-8">
            <h2 className="mb-4">Your Podcasts</h2>
            {podcasts.length === 0 && !showAddForm ? (
              <div className="result-card text-center">
                <p className="mb-4" style={{ color: 'var(--fg-dim)' }}>You haven't added any podcasts yet.</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="button"
                >
                  Add Your First Podcast
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {podcasts.map((pref) => (
                  <div key={pref.preference_id} className="question-card">
                    <h3 className="mb-2">{pref.podcast_title}</h3>
                    <div className="space-y-2 text-sm" style={{ color: 'var(--fg-dim)' }}>
                      {pref.started_listening_date && (
                        <p>
                          Started listening: <span style={{ color: 'var(--fg)' }}>{pref.started_listening_date}</span>
                        </p>
                      )}
                      {pref.listen_regularity && (
                        <p>
                          Regularity: <span style={{ color: 'var(--fg)' }} className="capitalize">{pref.listen_regularity.replace('-', ' ')}</span>
                        </p>
                      )}
                      {pref.typical_listen_speed && (
                        <p>
                          Listen speed: <span style={{ color: 'var(--fg)' }} className="capitalize">{pref.typical_listen_speed.replace('-', ' ')}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

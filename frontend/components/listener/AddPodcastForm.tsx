'use client'

import { useState } from 'react'

interface AddPodcastFormProps {
  onSubmit: (data: {
    podcast_name: string
    started_listening_date?: string | null
    listen_regularity?: 'every-episode' | 'most-episodes' | 'occasional' | 'rarely' | null
    typical_listen_speed?: 'same-day' | '1-3-days' | '1-week' | 'long-tail' | null
    rss_feed_url?: string
  }) => Promise<void>
  onCancel?: () => void
}

export default function AddPodcastForm({ onSubmit, onCancel }: AddPodcastFormProps) {
  const [podcastName, setPodcastName] = useState('')
  const [startedDate, setStartedDate] = useState('')
  const [regularity, setRegularity] = useState<'every-episode' | 'most-episodes' | 'occasional' | 'rarely' | ''>('')
  const [listenSpeed, setListenSpeed] = useState<'same-day' | '1-3-days' | '1-week' | 'long-tail' | ''>('')
  const [rssFeedUrl, setRssFeedUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await onSubmit({
        podcast_name: podcastName,
        started_listening_date: startedDate || null,
        listen_regularity: (regularity || null) as any,
        typical_listen_speed: (listenSpeed || null) as any,
        rss_feed_url: rssFeedUrl || undefined,
      })
      // Reset form on success - parent component will reload the list
      setPodcastName('')
      setStartedDate('')
      setRegularity('')
      setListenSpeed('')
      setRssFeedUrl('')
      // Don't set loading to false here - let parent handle it after reload
    } catch (err: any) {
      setError(err.message || 'Failed to add podcast')
      setLoading(false)
    }
  }

  return (
    <div className="question-card mb-6">
      <h2 className="mb-4">Add a Podcast</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="podcast-name">
            Podcast Name <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input
            id="podcast-name"
            type="text"
            value={podcastName}
            onChange={(e) => setPodcastName(e.target.value)}
            required
            placeholder="Enter podcast name"
          />
        </div>

        <div>
          <label htmlFor="rss-feed">
            RSS Feed URL (optional - will be discovered automatically)
          </label>
          <input
            id="rss-feed"
            type="url"
            value={rssFeedUrl}
            onChange={(e) => setRssFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
          />
        </div>

        <div className="divider"></div>
        <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
          Optional: Help us understand your listening habits
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="started-date">
              When did you start listening?
            </label>
            <input
              id="started-date"
              type="date"
              value={startedDate}
              onChange={(e) => setStartedDate(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="regularity">
              How regularly do you listen?
            </label>
            <select
              id="regularity"
              value={regularity}
              onChange={(e) => setRegularity(e.target.value as any)}
            >
              <option value="">Select...</option>
              <option value="every-episode">Every episode</option>
              <option value="most-episodes">Most episodes</option>
              <option value="occasional">Occasional</option>
              <option value="rarely">Rarely</option>
            </select>
          </div>

          <div>
            <label htmlFor="listen-speed">
              How quickly after publishing do you typically listen?
            </label>
            <select
              id="listen-speed"
              value={listenSpeed}
              onChange={(e) => setListenSpeed(e.target.value as any)}
            >
              <option value="">Select...</option>
              <option value="same-day">Same day</option>
              <option value="1-3-days">1-3 days</option>
              <option value="1-week">Within a week</option>
              <option value="long-tail">Long tail</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="button-group">
          <button
            type="submit"
            disabled={loading || !podcastName.trim()}
            className="button"
          >
            {loading ? 'Adding...' : 'Add Podcast'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="button secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

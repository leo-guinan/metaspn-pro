'use client'

import { useState } from 'react'
import * as api from '@/lib/api'

interface ClaimPodcastFormProps {
  onSuccess: (data: {
    ownership_id: string
    verification_token: string
    verification_instructions: string
    podcast_id: string
  }) => void
  onCancel?: () => void
}

export default function ClaimPodcastForm({ onSuccess, onCancel }: ClaimPodcastFormProps) {
  const [podcastName, setPodcastName] = useState('')
  const [rssFeedUrl, setRssFeedUrl] = useState('')
  const [podcastId, setPodcastId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!rssFeedUrl && !podcastName && !podcastId) {
        throw new Error('Please provide either an RSS feed URL, podcast name, or podcast ID')
      }

      if (!api.hostApi) {
        throw new Error('API not available')
      }

      // Build request body with only non-empty fields
      const requestBody: {
        podcast_id?: string
        rss_feed_url?: string
        podcast_name?: string
      } = {}

      // Only add fields that have actual values (not empty strings)
      if (podcastId && podcastId.trim()) {
        requestBody.podcast_id = podcastId.trim()
      }
      if (rssFeedUrl && rssFeedUrl.trim()) {
        requestBody.rss_feed_url = rssFeedUrl.trim()
      }
      if (podcastName && podcastName.trim()) {
        requestBody.podcast_name = podcastName.trim()
      }

      // Ensure at least one field is provided
      if (Object.keys(requestBody).length === 0) {
        throw new Error('Please provide either an RSS feed URL, podcast name, or podcast ID')
      }

      console.log('Claiming podcast with body:', JSON.stringify(requestBody, null, 2))
      const result = await api.hostApi.claimPodcast(requestBody)

      onSuccess({
        ...result,
        podcast_id: result.podcast_id,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to claim podcast')
      setLoading(false)
    }
  }

  return (
    <div className="question-card mb-6">
      <h2 className="mb-4">Claim Your Podcast</h2>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="rss-feed">
            RSS Feed URL <span style={{ color: 'var(--fg-dim)', fontSize: '0.85rem' }}>(recommended)</span>
          </label>
          <input
            id="rss-feed"
            type="url"
            value={rssFeedUrl}
            onChange={(e) => setRssFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
          />
          <p className="text-sm mt-1" style={{ color: 'var(--fg-dim)' }}>
            Provide your podcast's RSS feed URL. We'll automatically create the podcast entry if it doesn't exist.
          </p>
        </div>

        <div className="divider"></div>
        <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
          Or use one of these options:
        </p>

        <div>
          <label htmlFor="podcast-name">
            Podcast Name
          </label>
          <input
            id="podcast-name"
            type="text"
            value={podcastName}
            onChange={(e) => setPodcastName(e.target.value)}
            placeholder="Enter your podcast name"
          />
          <p className="text-sm mt-1" style={{ color: 'var(--fg-dim)' }}>
            Search for an existing podcast by name.
          </p>
        </div>

        <div>
          <label htmlFor="podcast-id">
            Podcast ID <span style={{ color: 'var(--fg-dim)', fontSize: '0.85rem' }}>(advanced)</span>
          </label>
          <input
            id="podcast-id"
            type="text"
            value={podcastId}
            onChange={(e) => setPodcastId(e.target.value)}
            placeholder="Enter podcast UUID"
          />
          <p className="text-sm mt-1" style={{ color: 'var(--fg-dim)' }}>
            If you know the internal podcast UUID, you can enter it directly.
          </p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="button-group">
          <button
            type="submit"
            disabled={loading || (!rssFeedUrl.trim() && !podcastName.trim() && !podcastId.trim())}
            className="button"
          >
            {loading ? 'Claiming...' : 'Claim Podcast'}
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

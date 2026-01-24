'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiRequest } from '@/lib/api'

export default function EpisodePage() {
  const params = useParams()
  const episodeId = params.id as string
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiRequest(`/api/episodes/${episodeId}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [episodeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading episode...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h1 className="text-3xl font-bold mb-2">{data?.title}</h1>
        {data?.description && (
          <p className="text-gray-600 dark:text-gray-400">{data.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Listening Stats</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Completion Ratio</div>
              <div className="text-2xl font-bold">
                {((data?.completion_ratio || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Listen Count</div>
              <div className="text-2xl font-bold">{data?.listen_count || 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Influence Score</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Influence</div>
              <div className="text-2xl font-bold">{data?.influence_score?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Influence Links</div>
              <div className="text-2xl font-bold">{data?.influence_links_count || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {data?.listen_timestamps && data.listen_timestamps.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Listen Timestamps</h2>
          <div className="space-y-2">
            {data.listen_timestamps.map((timestamp: string, index: number) => (
              <div key={index} className="text-sm">
                {new Date(timestamp).toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.highlights && data.highlights.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Highlights</h2>
          <div className="space-y-4">
            {data.highlights.map((highlight: any, index: number) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {highlight.playhead_sec}s
                </div>
                {highlight.transcript_context && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    "{highlight.transcript_context}"
                  </div>
                )}
                {highlight.note && (
                  <div className="text-sm">{highlight.note}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.topics && data.topics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Topics Detected</h2>
          <div className="flex flex-wrap gap-2">
            {data.topics.map((topic: string, index: number) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {data?.downstream_influence && data.downstream_influence.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Downstream Influence Events</h2>
          <div className="space-y-3">
            {data.downstream_influence.map((expression: any, index: number) => (
              <div key={index} className="border-l-4 border-green-500 pl-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {new Date(expression.timestamp_utc).toLocaleString()} • {expression.source}
                </div>
                <div className="text-sm">{expression.text}</div>
                {expression.similarity && (
                  <div className="text-xs text-gray-500 mt-1">
                    Similarity: {(expression.similarity * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

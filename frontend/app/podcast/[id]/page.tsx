'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiRequest } from '@/lib/api'

export default function PodcastPage() {
  const params = useParams()
  const podcastId = params.id as string
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiRequest(`/api/podcasts/${podcastId}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [podcastId])

  const handleShare = () => {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({
        title: `Fan Proof: ${data?.title}`,
        text: `Check out my listening stats for ${data?.title}`,
        url,
      })
    } else {
      navigator.clipboard.writeText(url)
      alert('Link copied to clipboard!')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading podcast...</div>
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">{data?.title}</h1>
          <button
            onClick={handleShare}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Share Fan Proof
          </button>
        </div>
        {data?.description && (
          <p className="text-gray-600 dark:text-gray-400 mb-4">{data.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Listening Stats</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Episodes Listened</div>
              <div className="text-2xl font-bold">{data?.episodes_listened || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Average Completion Rate</div>
              <div className="text-2xl font-bold">
                {((data?.avg_completion_rate || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Fan Score</div>
              <div className="text-2xl font-bold">{data?.fan_score?.toFixed(1) || '0.0'}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Influence Contribution</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Influence Score</div>
              <div className="text-2xl font-bold">{data?.influence_contribution?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Linked Expressions</div>
              <div className="text-2xl font-bold">{data?.linked_expressions || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Time-to-First-Listen Distribution</h2>
        {data?.appointment_listening ? (
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{data.appointment_listening.same_day || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Same Day</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.appointment_listening.one_to_three_days || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">1-3 Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.appointment_listening.one_week || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">1 Week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.appointment_listening.long_tail || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Long Tail</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">No appointment listening data</div>
        )}
      </div>
    </div>
  )
}

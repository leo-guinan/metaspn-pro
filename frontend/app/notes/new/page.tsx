'use client'

import { useState } from 'react'
import { apiRequest } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'

export default function NewNotePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [episodeId, setEpisodeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!user) {
      setError('Please log in to create notes')
      return
    }

    try {
      await apiRequest('/api/expressions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.user_id,
          text,
          source: 'manual',
          metadata: episodeId ? { episode_id: episodeId } : {},
        }),
      })

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to create note')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Create New Note</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Note Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full border rounded px-3 py-2"
            placeholder="Write your note here..."
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Episode ID (optional)
          </label>
          <input
            type="text"
            value={episodeId}
            onChange={(e) => setEpisodeId(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Link to a specific episode"
          />
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Note'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

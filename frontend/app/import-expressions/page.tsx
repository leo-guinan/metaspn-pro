'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'

export default function ImportExpressionsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [source, setSource] = useState<'github' | 'twitter' | 'bluesky'>('twitter')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    setFile(selectedFile)
    setError(null)
    setSuccess(false)
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    if (!user) {
      setError('Please log in to import expressions')
      return
    }

    try {
      const text = await file.text()
      const archiveData = JSON.parse(text)

      const endpoint = source === 'github' 
        ? '/api/expressions/import/github'
        : source === 'twitter'
        ? '/api/expressions/import/twitter'
        : '/api/expressions/import/bluesky'

      const result = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.user_id,
          archive_data: archiveData,
        }),
      })

      setImportedCount(result.imported_count || 0)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Import Expressions</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Select Source</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Platform</label>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as 'github' | 'twitter' | 'bluesky')
              setFile(null)
            }}
            className="border rounded px-3 py-2"
          >
            <option value="twitter">Twitter</option>
            <option value="bluesky">Bluesky</option>
            <option value="github">GitHub</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Archive File</label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="border rounded px-3 py-2 w-full"
          />
        </div>

        {source === 'twitter' && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>Upload your Twitter archive JSON file. You can download it from Twitter settings.</p>
          </div>
        )}

        {source === 'bluesky' && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>Upload your Bluesky archive JSON file.</p>
          </div>
        )}

        {source === 'github' && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>For GitHub, connect via OAuth to automatically sync markdown files from your repositories.</p>
            <button className="mt-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
              Connect GitHub
            </button>
          </div>
        )}

        {file && (
          <div className="mt-4">
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importing...' : 'Import Expressions'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 dark:bg-green-900 border border-green-400 text-green-700 dark:text-green-200 px-4 py-3 rounded mb-4">
          Successfully imported {importedCount} expressions!
        </div>
      )}
    </div>
  )
}

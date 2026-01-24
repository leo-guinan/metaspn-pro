'use client'

import { useState } from 'react'
import { eventsApi } from '@/lib/api'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv')
  const [preview, setPreview] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError(null)
    setSuccess(false)

    // Preview file
    const text = await selectedFile.text()
    if (format === 'csv') {
      const lines = text.split('\n').filter((line) => line.trim())
      const headers = lines[0].split(',')
      const previewData = lines.slice(1, 6).map((line) => {
        const values = line.split(',')
        return headers.reduce((obj, header, i) => {
          obj[header.trim()] = values[i]?.trim() || ''
          return obj
        }, {} as any)
      })
      setPreview(previewData)
    } else {
      const lines = text.split('\n').filter((line) => line.trim())
      const previewData = lines.slice(0, 5).map((line) => JSON.parse(line))
      setPreview(previewData)
    }
  }

  const validateEvent = (event: any): boolean => {
    // Basic validation
    if (!event.user_id || !event.episode_id || !event.podcast_id) {
      return false
    }
    if (!event.event_type || !event.timestamp_utc || !event.client) {
      return false
    }
    return true
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const text = await file.text()
      let events: any[] = []

      if (format === 'csv') {
        const lines = text.split('\n').filter((line) => line.trim())
        const headers = lines[0].split(',')
        events = lines.slice(1).map((line) => {
          const values = line.split(',')
          return headers.reduce((obj, header, i) => {
            obj[header.trim()] = values[i]?.trim() || ''
            return obj
          }, {} as any)
        })
      } else {
        const lines = text.split('\n').filter((line) => line.trim())
        events = lines.map((line) => JSON.parse(line))
      }

      // Validate all events
      const invalidEvents = events.filter((e) => !validateEvent(e))
      if (invalidEvents.length > 0) {
        throw new Error(`${invalidEvents.length} events failed validation`)
      }

      // Import events
      let imported = 0
      let failed = 0

      for (const event of events) {
        try {
          await eventsApi.create(event)
          imported++
        } catch (err) {
          console.error('Failed to import event:', err)
          failed++
        }
      }

      if (failed > 0) {
        setError(`${imported} imported, ${failed} failed`)
      } else {
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Import Listening Data</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Upload File</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Format</label>
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as 'csv' | 'jsonl')
              setFile(null)
              setPreview([])
            }}
            className="border rounded px-3 py-2"
          >
            <option value="csv">CSV</option>
            <option value="jsonl">JSONL</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">File</label>
          <input
            type="file"
            accept={format === 'csv' ? '.csv' : '.jsonl,.json'}
            onChange={handleFileChange}
            className="border rounded px-3 py-2 w-full"
          />
        </div>

        {format === 'csv' && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>CSV format should have columns:</p>
            <code className="block mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
              user_id,episode_id,podcast_id,event_type,timestamp_utc,playhead_sec,episode_duration_sec,client,metadata
            </code>
          </div>
        )}

        {format === 'jsonl' && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>JSONL format - one JSON object per line:</p>
            <code className="block mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
              {`{"user_id":"...","episode_id":"...","event_type":"play",...}`}
            </code>
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Preview (first 5 rows)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  {Object.keys(preview[0]).map((key) => (
                    <th key={key} className="text-left p-2 text-sm font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="p-2 text-sm">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val).slice(0, 50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {file && (
        <div className="mb-6">
          <button
            onClick={handleImport}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Importing...' : 'Import Events'}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 dark:bg-green-900 border border-green-400 text-green-700 dark:text-green-200 px-4 py-3 rounded mb-4">
          Import completed successfully!
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { networkApi } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'

export default function NetworkPage() {
  const { user } = useAuth()
  const [hubStatus, setHubStatus] = useState<any>(null)
  const [watches, setWatches] = useState<any[]>([])
  const [watchers, setWatchers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadNetworkData()
    }
  }, [user])

  const loadNetworkData = async () => {
    try {
      setLoading(true)
      const [hub, watching, watchersList] = await Promise.all([
        networkApi.getHubStatus().catch(() => ({ exists: false })),
        networkApi.listWatches().catch(() => []),
        networkApi.listWatchers().catch(() => []),
      ])
      setHubStatus(hub)
      setWatches(watching)
      setWatchers(watchersList)
    } catch (error) {
      console.error('Failed to load network data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateHub = async () => {
    try {
      await networkApi.createHub({ repo_name: 'metaspn-hub', is_private: true })
      await loadNetworkData()
    } catch (error: any) {
      alert(`Failed to create hub: ${error.message}`)
    }
  }

  const handleSyncHub = async () => {
    try {
      await networkApi.syncHub()
      await loadNetworkData()
    } catch (error: any) {
      alert(`Failed to sync hub: ${error.message}`)
    }
  }

  if (loading) {
    return <div className="p-8">Loading network data...</div>
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Network Dashboard</h1>

      {/* Hub Status */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Hub Repository</h2>
        {hubStatus?.exists ? (
          <div>
            <p className="text-gray-600 mb-2">
              <strong>Repo:</strong> {hubStatus.repo_owner}/{hubStatus.repo_name}
            </p>
            {hubStatus.last_sync_at && (
              <p className="text-gray-600 mb-4">
                <strong>Last sync:</strong> {new Date(hubStatus.last_sync_at).toLocaleString()}
              </p>
            )}
            <button
              onClick={handleSyncHub}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Sync Hub
            </button>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 mb-4">No hub repository found. Create one to get started.</p>
            <button
              onClick={handleCreateHub}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Hub Repository
            </button>
          </div>
        )}
      </div>

      {/* Watches */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Watching ({watches.length})</h2>
        {watches.length > 0 ? (
          <div className="space-y-2">
            {watches.map((watch) => (
              <div key={watch.watch_id} className="border rounded p-3">
                <p className="font-medium">{watch.watched_repo_owner}/{watch.watched_repo_name}</p>
                <p className="text-sm text-gray-600">Type: {watch.watch_type}</p>
                {watch.last_sync_at && (
                  <p className="text-sm text-gray-500">
                    Last sync: {new Date(watch.last_sync_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">You're not watching anyone yet.</p>
        )}
      </div>

      {/* Watchers */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Watchers ({watchers.length})</h2>
        {watchers.length > 0 ? (
          <div className="space-y-2">
            {watchers.map((watcher) => (
              <div key={watcher.watch_id} className="border rounded p-3">
                <p className="font-medium">User: {watcher.watcher_user_id.substring(0, 8)}...</p>
                <p className="text-sm text-gray-600">Type: {watcher.watch_type}</p>
                <p className="text-sm text-gray-500">
                  Since: {new Date(watcher.started_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No one is watching you yet.</p>
        )}
      </div>
    </div>
  )
}

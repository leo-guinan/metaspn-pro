'use client'

import { useState } from 'react'
import * as api from '@/lib/api'

interface AddGuestFormProps {
  episode_id: string
  onSuccess: () => void
  onCancel?: () => void
}

export default function AddGuestForm({ episode_id, onSuccess, onCancel }: AddGuestFormProps) {
  const [guestName, setGuestName] = useState('')
  const [guestRole, setGuestRole] = useState<'guest' | 'co-host' | 'host'>('guest')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!api.hostApi) {
        throw new Error('API not available')
      }
      await api.hostApi.addEpisodeGuest(episode_id, {
        guest_name: guestName,
        guest_role: guestRole,
      })
      setGuestName('')
      setGuestRole('guest')
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to add guest')
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      background: 'var(--bg-elevated)', 
      border: '1px solid var(--border)', 
      padding: '1rem',
      borderRadius: '4px',
      marginTop: '1rem'
    }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Add Guest</h4>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label htmlFor="guest-name">
            Guest Name <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
            placeholder="Enter guest name"
          />
        </div>

        <div>
          <label htmlFor="guest-role">
            Role
          </label>
          <select
            id="guest-role"
            value={guestRole}
            onChange={(e) => setGuestRole(e.target.value as 'guest' | 'co-host' | 'host')}
          >
            <option value="guest">Guest</option>
            <option value="co-host">Co-Host</option>
            <option value="host">Host</option>
          </select>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="button-group" style={{ marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={loading || !guestName.trim()}
            className="button"
            style={{ fontSize: '0.9rem', padding: '0.75rem 1.5rem' }}
          >
            {loading ? 'Adding...' : 'Add Guest'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="button secondary"
              style={{ fontSize: '0.9rem', padding: '0.75rem 1.5rem' }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

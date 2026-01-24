'use client'

import { useRouter } from 'next/navigation'
import { useGame } from '@/lib/contexts/GameContext'

export default function GameNav() {
  const router = useRouter()
  const { selection, clearSelection } = useGame()

  if (!selection) return null

  const getGameLabel = () => {
    if (selection.game === 'podcast') {
      return 'Podcast Game'
    }
    if (selection.subGame === 'short-form') {
      return 'Short Form Writer'
    }
    return 'Long Form Writer'
  }

  const handleChangeSelection = () => {
    clearSelection()
    router.push('/')
  }

  return (
    <nav style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">{getGameLabel()}</h2>
            <span style={{ color: 'var(--fg-subtle)' }}>/</span>
            <span className="capitalize" style={{ color: 'var(--fg-dim)' }}>{selection.role}</span>
          </div>
          <button
            onClick={handleChangeSelection}
            className="button secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            Change Selection
          </button>
        </div>
      </div>
    </nav>
  )
}

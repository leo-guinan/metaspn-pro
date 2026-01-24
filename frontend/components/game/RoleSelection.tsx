'use client'

import type { GameType, PodcastRole, WriterRole, WriterSubGame } from '@/lib/types/games'

interface RoleSelectionProps {
  game: GameType
  subGame?: WriterSubGame
  onSelect: (role: PodcastRole | WriterRole) => void
  onBack: () => void
}

export default function RoleSelection({ game, subGame, onSelect, onBack }: RoleSelectionProps) {
  const getRoleDescription = (role: string) => {
    if (game === 'podcast') {
      switch (role) {
        case 'host':
          return 'Create and manage podcast content'
        case 'guest':
          return 'Track your appearances and impact'
        case 'listener':
          return 'Track your listening habits and influence'
        default:
          return ''
      }
    } else {
      switch (role) {
        case 'author':
          return 'Measure your writing impact and engagement'
        case 'reader':
          return 'Track what you read and how it influences you'
        default:
          return ''
      }
    }
  }

  const roles = game === 'podcast' 
    ? (['host', 'guest', 'listener'] as PodcastRole[])
    : (['author', 'reader'] as WriterRole[])

  const gameTitle = game === 'podcast' 
    ? 'Podcast Game'
    : subGame === 'short-form'
    ? 'Short Form Writer'
    : 'Long Form Writer'

  const cardClass = game === 'podcast' ? 'platform' : 'creator'

  return (
    <div className="hero">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={onBack}
            className="button secondary mb-6"
          >
            ← Back
          </button>
          
          <h1 className="text-center mb-2">{gameTitle}</h1>
          <p className="text-center mb-12" style={{ color: 'var(--fg-dim)' }}>
            Choose your role
          </p>
          
          <div className="games-grid">
            {roles.map((role, index) => (
              <button
                key={role}
                onClick={() => onSelect(role)}
                className={`game-card ${cardClass}`}
                data-number={String(index + 1).padStart(2, '0')}
              >
                <h3 className="capitalize">{role}</h3>
                <p>{getRoleDescription(role)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

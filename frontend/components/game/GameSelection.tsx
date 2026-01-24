'use client'

import { useRouter } from 'next/navigation'
import type { GameType } from '@/lib/types/games'

interface GameSelectionProps {
  onSelect: (game: GameType) => void
}

export default function GameSelection({ onSelect }: GameSelectionProps) {
  return (
    <div className="hero">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="hero-label fade-in">OBSERVABLE GAMES NETWORK</div>
          <h1 className="fade-in">
            See the <span className="highlight">games</span> you play online
          </h1>
          <p className="hero-description fade-in">
            Most creators lose because they can't see which game they're in. The platforms see it. The AI companies see it. You should too.
          </p>
          
          <div className="games-grid">
            <button
              onClick={() => onSelect('podcast')}
              className="game-card platform"
              data-number="01"
            >
              <h3>Podcast Game</h3>
              <p>Track listening, influence, and engagement with podcasts</p>
              <ul>
                <li>Maximize listening insights</li>
                <li>Track influence patterns</li>
                <li>Build fan proof</li>
              </ul>
            </button>

            <button
              onClick={() => onSelect('writer')}
              className="game-card creator"
              data-number="02"
            >
              <h3>Writer Game</h3>
              <p>Measure impact and engagement with your writing</p>
              <ul>
                <li>Track reader engagement</li>
                <li>Measure writing influence</li>
                <li>Build your voice</li>
              </ul>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

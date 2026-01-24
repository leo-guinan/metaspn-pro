'use client'

import type { WriterSubGame } from '@/lib/types/games'

interface SubGameSelectionProps {
  onSelect: (subGame: WriterSubGame) => void
  onBack: () => void
}

export default function SubGameSelection({ onSelect, onBack }: SubGameSelectionProps) {
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
          
          <h1 className="text-center mb-2">Writer Game</h1>
          <p className="text-center mb-12" style={{ color: 'var(--fg-dim)' }}>
            Choose your format
          </p>
          
          <div className="games-grid">
            <button
              onClick={() => onSelect('short-form')}
              className="game-card creator"
              data-number="01"
            >
              <h3>Short Form</h3>
              <p>Tweets, threads, and quick posts</p>
              <ul>
                <li>Track engagement on social platforms</li>
                <li>Measure influence and reach</li>
                <li>Build your voice</li>
              </ul>
            </button>

            <button
              onClick={() => onSelect('long-form')}
              className="game-card creator"
              data-number="02"
            >
              <h3>Long Form</h3>
              <p>Blog posts, articles, and essays</p>
              <ul>
                <li>Measure deep engagement</li>
                <li>Track reader impact</li>
                <li>Build authority</li>
              </ul>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

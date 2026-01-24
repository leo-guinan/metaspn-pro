'use client'

import { useParams } from 'next/navigation'
import GameNav from '@/components/game/GameNav'
import GuestsList from '@/components/host/GuestsList'
import Link from 'next/link'

export default function HostPodcastGuestsPage() {
  const params = useParams()
  const podcast_id = params.podcast_id as string

  return (
    <div>
      <GameNav />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <Link
            href={`/game/podcast/host/podcast/${podcast_id}`}
            style={{ 
              color: 'var(--gold)', 
              textDecoration: 'none', 
              fontFamily: 'var(--mono)',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              display: 'inline-block'
            }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            ← Back to Podcast Dashboard
          </Link>
          <h1 className="mb-6">Guests</h1>
          <GuestsList podcast_id={podcast_id} />
        </div>
      </div>
    </div>
  )
}

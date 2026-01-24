'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import GameNav from '@/components/game/GameNav'
import { useGame } from '@/lib/contexts/GameContext'
import type { PodcastRole } from '@/lib/types/games'
import ClaimPodcastForm from '@/components/host/ClaimPodcastForm'
import VerifyOwnership from '@/components/host/VerifyOwnership'
import OwnedPodcastsList from '@/components/host/OwnedPodcastsList'
import * as api from '@/lib/api'

export default function PodcastRolePage() {
  const params = useParams()
  const router = useRouter()
  const { selection } = useGame()
  const role = params.role as PodcastRole
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [verificationData, setVerificationData] = useState<{
    podcast_id: string
    verification_token: string
    verification_instructions: string
  } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // Redirect if no selection or wrong game
    if (!selection || selection.game !== 'podcast' || selection.role !== role) {
      router.push('/')
    }
  }, [selection, role, router])

  if (!selection || selection.game !== 'podcast') {
    return null
  }

  const handleClaimSuccess = (data: {
    ownership_id: string
    verification_token: string
    verification_instructions: string
    podcast_id: string
  }) => {
    setVerificationData({
      podcast_id: data.podcast_id,
      verification_token: data.verification_token,
      verification_instructions: data.verification_instructions,
    })
    setShowClaimForm(false)
  }

  const handleVerified = () => {
    setVerificationData(null)
    setRefreshKey((k) => k + 1)
  }

  const getRoleContent = () => {
    switch (role) {
      case 'host':
        return {
          title: 'Host Dashboard',
          description: 'Manage your podcast, track listener engagement, and see who your most engaged audience members are.',
        }
      case 'guest':
        return {
          title: 'Guest Dashboard',
          description: 'Track your podcast appearances, see your impact on listeners, and measure your influence.',
        }
      case 'listener':
        return {
          title: 'Listener Dashboard',
          description: 'Track your listening habits, discover your influence patterns, and see how podcasts shape your thinking.',
        }
      default:
        return {
          title: 'Podcast Game',
          description: 'Welcome to the Podcast Game.',
        }
    }
  }

  const content = getRoleContent()

  return (
    <div>
      <GameNav />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="mb-4">{content.title}</h1>
          <p className="mb-8" style={{ fontSize: '1.1rem' }}>
            {content.description}
          </p>

          {role === 'host' && (
            <>
              {verificationData && (
                <VerifyOwnership
                  podcast_id={verificationData.podcast_id}
                  verification_token={verificationData.verification_token}
                  verification_instructions={verificationData.verification_instructions}
                  onVerified={handleVerified}
                />
              )}

              {showClaimForm ? (
                <ClaimPodcastForm
                  onSuccess={handleClaimSuccess}
                  onCancel={() => setShowClaimForm(false)}
                />
              ) : (
                <div className="mb-6">
                  <button
                    onClick={() => setShowClaimForm(true)}
                    className="button"
                  >
                    Add Your Podcast
                  </button>
                </div>
              )}

              <OwnedPodcastsList key={refreshKey} />
            </>
          )}

          {role !== 'host' && (
            <div className="question-card">
              <p>
                Role-specific content coming soon. This is the {role} view for the Podcast Game.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

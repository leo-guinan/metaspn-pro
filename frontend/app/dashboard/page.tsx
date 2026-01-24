'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import GameSelectionFlow from '@/components/game/GameSelectionFlow'
import AppNav from '@/components/navigation/AppNav'

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/auth/login')
      return
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading">
          <div style={{ color: 'var(--fg-dim)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8">Dashboard</h1>

        {/* Game Selection Section */}
        <section>
          <h2 className="mb-4">Select a Game</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--fg-dim)' }}>
            Choose a game and role to get started.
          </p>

          <GameSelectionFlow />
        </section>
      </div>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import GameSelectionFlow from '@/components/game/GameSelectionFlow'
import AppNav from '@/components/navigation/AppNav'

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading">
          <div style={{ color: 'var(--fg-dim)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  return <GameSelectionFlow showNav={true} NavComponent={AppNav} />
}

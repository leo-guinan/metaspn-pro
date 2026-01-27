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
    const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
    const fullUrl = typeof window !== 'undefined' ? window.location.href : ''
    // #region agent log
    console.log('[DEBUG] Root page useEffect triggered', { loading, hasUser: !!user, pathname, fullUrl })
    // #endregion
    
    // Only run redirect logic if we're actually on the root path
    if (pathname !== '/') {
      return
    }
    
    // Check for stored redirect path after OAuth
    if (typeof window !== 'undefined' && user) {
      const storedRedirect = localStorage.getItem('metaspn_redirect_after_oauth')
      if (storedRedirect) {
        console.log('[DEBUG] Found stored redirect path, redirecting', { storedRedirect })
        localStorage.removeItem('metaspn_redirect_after_oauth')
        router.push(storedRedirect)
        return
      }
    }
    
    if (!loading && !user) {
      // #region agent log
      console.log('[DEBUG] Root page redirecting to login', { pathname })
      // #endregion
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

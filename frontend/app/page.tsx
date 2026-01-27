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
    fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:14',message:'Root page useEffect triggered',data:{loading,hasUser:!!user,pathname,fullUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!loading && !user) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:17',message:'Root page redirecting to login',data:{pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
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

'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/callback']

  // Check if current path is a public route
  const isPublicRoute = publicRoutes.some((route) => pathname?.startsWith(route))

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthGuard.tsx:22',message:'AuthGuard useEffect triggered',data:{loading,isPublicRoute,hasUser:!!user,pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Don't redirect if we're still loading or on a public route
    if (loading || isPublicRoute) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthGuard.tsx:26',message:'AuthGuard skipping redirect',data:{reason:loading?'loading':'publicRoute'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return
    }

    // Redirect to login if not authenticated
    if (!user) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/38fffe99-bfdc-4cb7-a41c-77b25a3a0ee5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthGuard.tsx:31',message:'AuthGuard redirecting to login',data:{pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      router.push('/auth/login')
    }
  }, [user, loading, router, pathname, isPublicRoute])

  // Show loading state while checking auth (only for protected routes)
  if (loading && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading">
          <div style={{ color: 'var(--fg-dim)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Show nothing if redirecting (protected route without user)
  if (!user && !isPublicRoute) {
    return null
  }

  // Allow all routes to render (public routes always, protected routes only if authenticated)
  return <>{children}</>
}

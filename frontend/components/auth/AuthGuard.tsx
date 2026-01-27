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
    console.log('[DEBUG] AuthGuard useEffect triggered', { loading, isPublicRoute, hasUser: !!user, pathname })
    // #endregion
    
    // Don't redirect if we're still loading or on a public route
    if (loading || isPublicRoute) {
      // #region agent log
      console.log('[DEBUG] AuthGuard skipping redirect', { reason: loading ? 'loading' : 'publicRoute' })
      // #endregion
      return
    }

    // Don't redirect if we're on settings/integrations with OAuth callback params
    // This prevents interrupting the OAuth flow
    if (typeof window !== 'undefined' && pathname === '/settings/integrations') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('github') || urlParams.has('code')) {
        console.log('[DEBUG] AuthGuard skipping redirect - OAuth callback in progress', { 
          github: urlParams.get('github'), 
          hasCode: urlParams.has('code') 
        })
        return
      }
    }

    // Redirect to login if not authenticated
    if (!user) {
      // #region agent log
      console.log('[DEBUG] AuthGuard redirecting to login', { pathname })
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

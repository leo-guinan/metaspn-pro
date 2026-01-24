'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setAuthToken } from '@/lib/contexts/AuthContext'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = searchParams.get('token')
    const errorParam = searchParams.get('error')
    const isNew = searchParams.get('is_new') === 'true'
    const linked = searchParams.get('linked') === 'true'

    if (errorParam) {
      setError(decodeURIComponent(errorParam))
      setLoading(false)
      return
    }

    if (token) {
      // Store token
      setAuthToken(token)
      
      // Redirect based on context
      if (linked) {
        // Account was linked, go to settings
        router.push('/settings/integrations')
      } else if (isNew) {
        // New user, maybe show onboarding or dashboard
        router.push('/dashboard')
      } else {
        // Existing user, go to dashboard
        router.push('/dashboard')
      }
    } else {
      setError('No token received from authentication provider')
      setLoading(false)
    }
  }, [searchParams, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Completing authentication...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="max-w-md w-full p-6 bg-red-50 border border-red-200 rounded-lg">
          <h1 className="text-xl font-bold text-red-800 mb-2">Authentication Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return null
}

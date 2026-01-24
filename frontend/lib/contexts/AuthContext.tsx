'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from '@/lib/api'

const TOKEN_KEY = 'metaspn_token'

interface User {
  user_id: string
  email: string
  name: string | null
  display_name: string | null
  avatar_url: string | null
  primary_provider: 'twitter' | 'github' | null
  created_at: string
}

interface OAuthAccount {
  account_id: string
  provider: 'twitter' | 'github'
  provider_username: string | null
  verified: boolean
  created_at: string
}

interface AuthContextType {
  user: User | null
  accounts: OAuthAccount[]
  token: string | null
  loading: boolean
  login: (provider: 'twitter' | 'github') => void
  logout: () => void
  linkAccount: (provider: 'twitter' | 'github') => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<OAuthAccount[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load token from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (storedToken) {
        setToken(storedToken)
      } else {
        setLoading(false)
      }
    }
  }, [])

  // Verify token and load user when token is available
  useEffect(() => {
    if (token && !user && !loading) {
      refreshUser()
    } else if (!token) {
      setUser(null)
      setAccounts([])
      if (loading) {
        setLoading(false)
      }
    }
  }, [token])

  const refreshUser = async () => {
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const data = await authApi.me()
      setUser(data.user)
      setAccounts(data.accounts)
    } catch (error) {
      // Token is invalid, clear it
      console.error('Failed to verify token:', error)
      setToken(null)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY)
      }
      setUser(null)
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  const login = (provider: 'twitter' | 'github') => {
    // Redirect to backend OAuth flow
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    window.location.href = `${apiUrl}/api/auth/${provider}/login`
  }

  // Update token state when it changes in localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (storedToken !== token) {
        setToken(storedToken)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [token])

  const logout = () => {
    setToken(null)
    setUser(null)
    setAccounts([])
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
    }
    // Optionally call backend logout endpoint
    authApi.logout().catch(console.error)
  }

  const linkAccount = (provider: 'twitter' | 'github') => {
    // Redirect to backend OAuth link flow with token in query parameter
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null)
    if (!authToken) {
      console.error('No token available for account linking')
      alert('Please log in first to link accounts')
      return
    }
    window.location.href = `${apiUrl}/api/auth/${provider}/link?token=${encodeURIComponent(authToken)}`
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accounts,
        token,
        loading,
        login,
        logout,
        linkAccount,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper to set token (used by callback page)
export function setAuthToken(newToken: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, newToken)
  }
}

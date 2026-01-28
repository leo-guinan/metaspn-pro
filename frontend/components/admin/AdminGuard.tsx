'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/lib/api'

interface AdminGuardProps {
  children: ReactNode
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const result = await adminApi.checkAdmin()
        setIsAdmin(result.is_admin)
        
        if (!result.is_admin) {
          router.push('/dashboard')
        }
      } catch (error) {
        console.error('Failed to check admin status:', error)
        setIsAdmin(false)
        router.push('/dashboard')
      } finally {
        setLoading(false)
      }
    }

    checkAdminStatus()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading">
          <div style={{ color: 'var(--fg-dim)' }}>Checking admin access...</div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div 
          className="p-8 rounded-lg text-center"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <h2 className="mb-4" style={{ color: '#f87171' }}>Access Denied</h2>
          <p style={{ color: 'var(--fg-dim)' }}>You do not have admin privileges.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

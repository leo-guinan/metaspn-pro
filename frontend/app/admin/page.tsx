'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { adminApi, type AdminStats } from '@/lib/api'
import AppNav from '@/components/navigation/AppNav'
import AdminGuard from '@/components/admin/AdminGuard'
import StatsCards from '@/components/admin/StatsCards'
import Link from 'next/link'

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth/login')
      return
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    
    const fetchStats = async () => {
      try {
        setLoading(true)
        const data = await adminApi.getStats(days)
        setStats(data)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [user, days])

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
    return null
  }

  return (
    <AdminGuard>
      <div className="min-h-screen">
        <AppNav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="mb-2">Admin Dashboard</h1>
              <p style={{ color: 'var(--fg-dim)' }}>Worker observability and workflow monitoring</p>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="px-3 py-2 rounded"
                style={{ 
                  background: 'var(--bg-elevated)', 
                  border: '1px solid var(--border)',
                  color: 'var(--fg)'
                }}
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
              </select>
              <Link
                href="/admin/runs"
                className="button"
                style={{ 
                  background: 'var(--gold)',
                  color: 'var(--bg)',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  textDecoration: 'none',
                  fontWeight: 500
                }}
              >
                View All Runs
              </Link>
            </div>
          </div>

          {error && (
            <div 
              className="mb-6 p-4 rounded"
              style={{ 
                background: 'rgba(220, 38, 38, 0.1)', 
                border: '1px solid rgba(220, 38, 38, 0.3)',
                color: '#f87171'
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div style={{ color: 'var(--fg-dim)' }}>Loading stats...</div>
            </div>
          ) : stats ? (
            <StatsCards stats={stats} />
          ) : null}
        </div>
      </div>
    </AdminGuard>
  )
}

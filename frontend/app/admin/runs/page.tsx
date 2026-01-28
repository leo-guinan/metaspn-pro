'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { adminApi, type WorkflowRun } from '@/lib/api'
import AppNav from '@/components/navigation/AppNav'
import AdminGuard from '@/components/admin/AdminGuard'
import WorkflowRunCard from '@/components/admin/WorkflowRunCard'
import Link from 'next/link'

export default function AdminRunsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<string[]>([])
  const [triggering, setTriggering] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [workflowFilter, setWorkflowFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const limit = 20

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth/login')
      return
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    
    const fetchWorkflows = async () => {
      try {
        const data = await adminApi.getWorkflows()
        setWorkflows(data.workflows)
      } catch (err) {
        console.error('Failed to load workflows:', err)
      }
    }

    fetchWorkflows()
  }, [user])

  useEffect(() => {
    if (!user) return
    
    const fetchRuns = async () => {
      try {
        setLoading(true)
        const data = await adminApi.getRuns({
          status: statusFilter as any || undefined,
          workflow_name: workflowFilter || undefined,
          limit,
          offset: page * limit,
        })
        setRuns(data.runs)
        setTotal(data.total)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load runs')
      } finally {
        setLoading(false)
      }
    }

    fetchRuns()
  }, [user, statusFilter, workflowFilter, page])

  const handleTriggerWorkflow = async (workflowName: string) => {
    try {
      setTriggering(workflowName)
      const result = await adminApi.triggerWorkflow(workflowName)
      // Refresh the runs list
      const data = await adminApi.getRuns({
        status: statusFilter as any || undefined,
        workflow_name: workflowFilter || undefined,
        limit,
        offset: page * limit,
      })
      setRuns(data.runs)
      setTotal(data.total)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to trigger workflow')
    } finally {
      setTriggering(null)
    }
  }

  const totalPages = Math.ceil(total / limit)

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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
              >
                Admin
              </Link>
              <span style={{ color: 'var(--fg-dim)' }}>/</span>
              <h1 className="m-0">Workflow Runs</h1>
            </div>
            <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>
              {total} total runs
            </div>
          </div>

          {/* Filters and Actions */}
          <div 
            className="mb-6 p-4 rounded-lg flex flex-wrap items-center gap-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
              className="px-3 py-2 rounded"
              style={{ 
                background: 'var(--bg)', 
                border: '1px solid var(--border)',
                color: 'var(--fg)'
              }}
            >
              <option value="">All Statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>

            <select
              value={workflowFilter}
              onChange={(e) => { setWorkflowFilter(e.target.value); setPage(0) }}
              className="px-3 py-2 rounded"
              style={{ 
                background: 'var(--bg)', 
                border: '1px solid var(--border)',
                color: 'var(--fg)'
              }}
            >
              <option value="">All Workflows</option>
              {workflows.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <div className="flex-1" />

            {/* Trigger Workflow Dropdown */}
            <div className="relative">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleTriggerWorkflow(e.target.value)
                    e.target.value = ''
                  }
                }}
                disabled={triggering !== null}
                className="px-3 py-2 rounded cursor-pointer"
                style={{ 
                  background: 'var(--gold)',
                  color: 'var(--bg)',
                  border: 'none',
                  fontWeight: 500
                }}
              >
                <option value="">{triggering ? `Triggering ${triggering}...` : 'Trigger Workflow'}</option>
                {workflows.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
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
              <div style={{ color: 'var(--fg-dim)' }}>Loading runs...</div>
            </div>
          ) : runs.length === 0 ? (
            <div 
              className="p-8 rounded-lg text-center"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <p style={{ color: 'var(--fg-dim)' }}>No workflow runs found</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {runs.map((run) => (
                  <WorkflowRunCard key={run.run_id} run={run} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 rounded"
                    style={{ 
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: page === 0 ? 'var(--fg-dim)' : 'var(--fg)',
                      cursor: page === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ color: 'var(--fg-dim)' }}>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-4 py-2 rounded"
                    style={{ 
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: page >= totalPages - 1 ? 'var(--fg-dim)' : 'var(--fg)',
                      cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}

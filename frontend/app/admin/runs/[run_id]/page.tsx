'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { adminApi, type WorkflowRun, type WorkflowStep, type AgentInvocation, type ToolCall } from '@/lib/api'
import AppNav from '@/components/navigation/AppNav'
import AdminGuard from '@/components/admin/AdminGuard'
import StepTimeline from '@/components/admin/StepTimeline'
import Link from 'next/link'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80' },
    failed: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
    running: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },
    pending: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af' },
  }
  
  const color = colors[status] || colors.pending
  
  return (
    <span
      className="px-2 py-1 rounded text-sm font-medium"
      style={{ background: color.bg, color: color.text }}
    >
      {status}
    </span>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

export default function AdminRunDetailPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const run_id = params.run_id as string

  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [agentInvocations, setAgentInvocations] = useState<AgentInvocation[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth/login')
      return
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || !run_id) return
    
    const fetchRunDetail = async () => {
      try {
        setLoading(true)
        const data = await adminApi.getRunDetail(run_id)
        setRun(data.run)
        setSteps(data.steps)
        setAgentInvocations(data.agent_invocations)
        setToolCalls(data.tool_calls)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load run details')
      } finally {
        setLoading(false)
      }
    }

    fetchRunDetail()
  }, [user, run_id])

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
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <Link href="/admin" style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>
              Admin
            </Link>
            <span style={{ color: 'var(--fg-dim)' }}>/</span>
            <Link href="/admin/runs" style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>
              Runs
            </Link>
            <span style={{ color: 'var(--fg-dim)' }}>/</span>
            <span style={{ color: 'var(--fg)' }}>{run_id.slice(0, 8)}...</span>
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
              <div style={{ color: 'var(--fg-dim)' }}>Loading run details...</div>
            </div>
          ) : run ? (
            <>
              {/* Run Header */}
              <div 
                className="p-6 rounded-lg mb-6"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="mb-2">{run.workflow_name}</h1>
                    <p className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                      Run ID: {run.run_id}
                    </p>
                  </div>
                  <StatusBadge status={run.status} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Trigger</div>
                    <div className="font-medium">{run.trigger}</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Started</div>
                    <div className="font-medium">{formatDate(run.started_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Ended</div>
                    <div className="font-medium">{formatDate(run.ended_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Duration</div>
                    <div className="font-medium">{formatDuration(run.duration_ms)}</div>
                  </div>
                </div>

                {run.error_message && (
                  <div 
                    className="mt-4 p-3 rounded"
                    style={{ 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    <div className="text-xs mb-1" style={{ color: '#f87171' }}>Error</div>
                    <div className="text-sm font-mono" style={{ color: '#fca5a5' }}>
                      {run.error_message}
                    </div>
                  </div>
                )}
              </div>

              {/* Steps Timeline */}
              <div className="mb-6">
                <h2 className="mb-4">Workflow Steps ({steps.length})</h2>
                {steps.length > 0 ? (
                  <StepTimeline steps={steps} />
                ) : (
                  <div 
                    className="p-4 rounded text-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <p style={{ color: 'var(--fg-dim)' }}>No steps recorded for this run</p>
                  </div>
                )}
              </div>

              {/* Agent Invocations */}
              <div className="mb-6">
                <h2 className="mb-4">Agent Invocations ({agentInvocations.length})</h2>
                {agentInvocations.length > 0 ? (
                  <div className="space-y-3">
                    {agentInvocations.map((invocation) => (
                      <div
                        key={invocation.invocation_id}
                        className="p-4 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{invocation.agent_name}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                              {invocation.model || 'unknown model'}
                            </span>
                            <StatusBadge status={invocation.status} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span style={{ color: 'var(--fg-dim)' }}>Duration: </span>
                            {formatDuration(invocation.duration_ms)}
                          </div>
                          <div>
                            <span style={{ color: 'var(--fg-dim)' }}>Prompt tokens: </span>
                            {invocation.prompt_tokens ?? '-'}
                          </div>
                          <div>
                            <span style={{ color: 'var(--fg-dim)' }}>Completion tokens: </span>
                            {invocation.completion_tokens ?? '-'}
                          </div>
                        </div>
                        {invocation.prompt_preview && (
                          <div className="mt-3 p-2 rounded text-sm font-mono" style={{ background: 'var(--bg)' }}>
                            <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Prompt Preview</div>
                            <div style={{ color: 'var(--fg-dim)' }}>{invocation.prompt_preview}</div>
                          </div>
                        )}
                        {invocation.response_preview && (
                          <div className="mt-2 p-2 rounded text-sm font-mono" style={{ background: 'var(--bg)' }}>
                            <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Response Preview</div>
                            <div style={{ color: 'var(--fg-dim)' }}>{invocation.response_preview}</div>
                          </div>
                        )}
                        {invocation.error_message && (
                          <div className="mt-2 text-sm" style={{ color: '#f87171' }}>
                            Error: {invocation.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    className="p-4 rounded text-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <p style={{ color: 'var(--fg-dim)' }}>No agent invocations recorded</p>
                  </div>
                )}
              </div>

              {/* Tool Calls */}
              <div className="mb-6">
                <h2 className="mb-4">Tool Calls ({toolCalls.length})</h2>
                {toolCalls.length > 0 ? (
                  <div className="space-y-3">
                    {toolCalls.map((call) => (
                      <div
                        key={call.call_id}
                        className="p-4 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium font-mono">{call.tool_name}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                              {formatDuration(call.duration_ms)}
                            </span>
                            <StatusBadge status={call.status} />
                          </div>
                        </div>
                        {call.input_data && (
                          <div className="mt-2 p-2 rounded text-sm font-mono" style={{ background: 'var(--bg)' }}>
                            <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Input</div>
                            <div style={{ color: 'var(--fg-dim)' }}>
                              {JSON.stringify(call.input_data, null, 2).slice(0, 500)}
                            </div>
                          </div>
                        )}
                        {call.output_preview && (
                          <div className="mt-2 p-2 rounded text-sm font-mono" style={{ background: 'var(--bg)' }}>
                            <div className="text-xs mb-1" style={{ color: 'var(--fg-dim)' }}>Output Preview</div>
                            <div style={{ color: 'var(--fg-dim)' }}>{call.output_preview}</div>
                          </div>
                        )}
                        {call.error_message && (
                          <div className="mt-2 text-sm" style={{ color: '#f87171' }}>
                            Error: {call.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    className="p-4 rounded text-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <p style={{ color: 'var(--fg-dim)' }}>No tool calls recorded</p>
                  </div>
                )}
              </div>

              {/* Input/Output Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h2 className="mb-4">Input Data</h2>
                  <div 
                    className="p-4 rounded-lg font-mono text-sm overflow-auto max-h-96"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    {run.input_data ? (
                      <pre style={{ color: 'var(--fg-dim)' }}>
                        {JSON.stringify(run.input_data, null, 2)}
                      </pre>
                    ) : (
                      <span style={{ color: 'var(--fg-dim)' }}>No input data</span>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="mb-4">Output Data</h2>
                  <div 
                    className="p-4 rounded-lg font-mono text-sm overflow-auto max-h-96"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    {run.output_data ? (
                      <pre style={{ color: 'var(--fg-dim)' }}>
                        {JSON.stringify(run.output_data, null, 2)}
                      </pre>
                    ) : (
                      <span style={{ color: 'var(--fg-dim)' }}>No output data</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div 
              className="p-8 rounded-lg text-center"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <p style={{ color: 'var(--fg-dim)' }}>Run not found</p>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}

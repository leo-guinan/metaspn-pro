'use client'

import Link from 'next/link'
import { type WorkflowRun } from '@/lib/api'

interface WorkflowRunCardProps {
  run: WorkflowRun
}

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
      className="px-2 py-1 rounded text-xs font-medium"
      style={{ background: color.bg, color: color.text }}
    >
      {status}
    </span>
  )
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    cron: { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa' },
    manual: { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c' },
    api: { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee' },
    webhook: { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6' },
  }
  
  const color = colors[trigger] || colors.cron
  
  return (
    <span
      className="px-2 py-1 rounded text-xs font-medium"
      style={{ background: color.bg, color: color.text }}
    >
      {trigger}
    </span>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTimeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMinutes > 0) return `${diffMinutes}m ago`
  return 'just now'
}

export default function WorkflowRunCard({ run }: WorkflowRunCardProps) {
  return (
    <Link
      href={`/admin/runs/${run.run_id}`}
      className="block p-4 rounded-lg transition-all hover:scale-[1.01]"
      style={{ 
        background: 'var(--bg-elevated)', 
        border: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'inherit'
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-medium font-mono">{run.workflow_name}</span>
            <StatusBadge status={run.status} />
            <TriggerBadge trigger={run.trigger} />
          </div>
          
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--fg-dim)' }}>
            <span>{formatTimeAgo(run.started_at)}</span>
            <span>Duration: {formatDuration(run.duration_ms)}</span>
            <span className="font-mono text-xs">{run.run_id.slice(0, 8)}...</span>
          </div>
          
          {run.error_message && (
            <div 
              className="mt-2 text-sm truncate"
              style={{ color: '#f87171', maxWidth: '600px' }}
            >
              {run.error_message}
            </div>
          )}
        </div>
        
        <div 
          className="text-sm"
          style={{ color: 'var(--fg-dim)' }}
        >
          →
        </div>
      </div>
    </Link>
  )
}

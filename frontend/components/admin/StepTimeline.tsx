'use client'

import { type WorkflowStep } from '@/lib/api'

interface StepTimelineProps {
  steps: WorkflowStep[]
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(34, 197, 94, 0.2)' }}
        >
          <span style={{ color: '#4ade80' }}>✓</span>
        </div>
      )
    case 'failed':
      return (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(239, 68, 68, 0.2)' }}
        >
          <span style={{ color: '#f87171' }}>✕</span>
        </div>
      )
    case 'running':
      return (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center animate-pulse"
          style={{ background: 'rgba(59, 130, 246, 0.2)' }}
        >
          <span style={{ color: '#60a5fa' }}>●</span>
        </div>
      )
    default:
      return (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(156, 163, 175, 0.2)' }}
        >
          <span style={{ color: '#9ca3af' }}>○</span>
        </div>
      )
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTime(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleTimeString()
}

export default function StepTimeline({ steps }: StepTimelineProps) {
  // Sort steps by index then by start time
  const sortedSteps = [...steps].sort((a, b) => {
    if (a.step_index !== b.step_index) return a.step_index - b.step_index
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  })

  return (
    <div className="space-y-0">
      {sortedSteps.map((step, index) => (
        <div key={step.step_id} className="relative">
          {/* Connector line */}
          {index < sortedSteps.length - 1 && (
            <div 
              className="absolute left-3 top-10 w-0.5 h-full -translate-x-1/2"
              style={{ background: 'var(--border)' }}
            />
          )}
          
          <div 
            className="flex items-start gap-4 p-4 rounded-lg mb-2"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <StatusIcon status={step.status} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium font-mono">{step.step_name}</div>
                <div 
                  className="text-sm"
                  style={{ color: 'var(--fg-dim)' }}
                >
                  {formatDuration(step.duration_ms)}
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--fg-dim)' }}>
                <span>Step {step.step_index + 1}</span>
                <span>Started: {formatTime(step.started_at)}</span>
                {step.ended_at && <span>Ended: {formatTime(step.ended_at)}</span>}
              </div>
              
              {step.error_message && (
                <div 
                  className="mt-2 p-2 rounded text-sm"
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5'
                  }}
                >
                  {step.error_message}
                </div>
              )}
              
              {/* Expandable input/output preview */}
              {(step.input_data || step.output_data) && (
                <details className="mt-2">
                  <summary 
                    className="cursor-pointer text-xs"
                    style={{ color: 'var(--fg-dim)' }}
                  >
                    View data
                  </summary>
                  <div className="mt-2 space-y-2">
                    {step.input_data && (
                      <div 
                        className="p-2 rounded text-xs font-mono overflow-auto max-h-32"
                        style={{ background: 'var(--bg)' }}
                      >
                        <div className="mb-1" style={{ color: 'var(--fg-dim)' }}>Input:</div>
                        <pre style={{ color: 'var(--fg-dim)' }}>
                          {JSON.stringify(step.input_data, null, 2).slice(0, 500)}
                        </pre>
                      </div>
                    )}
                    {step.output_data && (
                      <div 
                        className="p-2 rounded text-xs font-mono overflow-auto max-h-32"
                        style={{ background: 'var(--bg)' }}
                      >
                        <div className="mb-1" style={{ color: 'var(--fg-dim)' }}>Output:</div>
                        <pre style={{ color: 'var(--fg-dim)' }}>
                          {JSON.stringify(step.output_data, null, 2).slice(0, 500)}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

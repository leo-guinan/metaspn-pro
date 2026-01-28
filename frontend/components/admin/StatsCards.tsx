'use client'

import { type AdminStats } from '@/lib/api'

interface StatsCardsProps {
  stats: AdminStats
}

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Runs"
          value={stats.total_runs}
          color="var(--gold)"
        />
        <StatCard
          label="Successful"
          value={stats.successful_runs}
          color="#4ade80"
        />
        <StatCard
          label="Failed"
          value={stats.failed_runs}
          color="#f87171"
        />
        <StatCard
          label="Running"
          value={stats.running_runs}
          color="#60a5fa"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Success Rate"
          value={`${stats.success_rate.toFixed(1)}%`}
          color={stats.success_rate >= 90 ? '#4ade80' : stats.success_rate >= 70 ? 'var(--gold)' : '#f87171'}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(stats.avg_duration_ms)}
          color="var(--fg)"
        />
        <StatCard
          label="Agent Calls"
          value={stats.total_agent_invocations}
          color="var(--fg)"
        />
        <StatCard
          label="Tool Calls"
          value={stats.total_tool_calls}
          color="var(--fg)"
        />
      </div>

      {/* Runs by Workflow */}
      <div 
        className="p-6 rounded-lg"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <h3 className="mb-4">Runs by Workflow</h3>
        {Object.keys(stats.runs_by_workflow).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(stats.runs_by_workflow)
              .sort(([, a], [, b]) => b - a)
              .map(([workflow, count]) => (
                <div key={workflow} className="flex items-center justify-between">
                  <span className="font-mono text-sm">{workflow}</span>
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-2 rounded-full"
                      style={{ 
                        width: `${Math.max(20, (count / stats.total_runs) * 200)}px`,
                        background: 'var(--gold)',
                        opacity: 0.7
                      }}
                    />
                    <span className="text-sm font-medium" style={{ minWidth: '2rem', textAlign: 'right' }}>
                      {count}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p style={{ color: 'var(--fg-dim)' }}>No workflow runs yet</p>
        )}
      </div>

      {/* Runs by Day Chart */}
      <div 
        className="p-6 rounded-lg"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <h3 className="mb-4">Runs by Day</h3>
        {stats.runs_by_day.length > 0 ? (
          <div className="space-y-2">
            {stats.runs_by_day.slice(0, 7).map((day) => (
              <div key={day.date} className="flex items-center gap-4">
                <span 
                  className="text-sm font-mono"
                  style={{ color: 'var(--fg-dim)', minWidth: '5rem' }}
                >
                  {day.date}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  <div 
                    className="h-4 rounded"
                    style={{ 
                      width: `${Math.max(4, (day.count - day.failed) * 8)}px`,
                      background: '#4ade80',
                      opacity: 0.8
                    }}
                    title={`${day.count - day.failed} successful`}
                  />
                  {day.failed > 0 && (
                    <div 
                      className="h-4 rounded"
                      style={{ 
                        width: `${day.failed * 8}px`,
                        background: '#f87171',
                        opacity: 0.8
                      }}
                      title={`${day.failed} failed`}
                    />
                  )}
                </div>
                <span className="text-sm" style={{ minWidth: '3rem', textAlign: 'right' }}>
                  {day.count} runs
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--fg-dim)' }}>No data for this period</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ 
  label, 
  value, 
  color 
}: { 
  label: string
  value: string | number
  color: string 
}) {
  return (
    <div 
      className="p-4 rounded-lg"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs mb-2" style={{ color: 'var(--fg-dim)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (!ms || ms === 0) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

'use client'

interface StatsOverviewProps {
  data?: {
    total_episodes?: number
    total_hours?: number
    completion_rate?: number
  }
}

export default function StatsOverview({ data }: StatsOverviewProps) {
  const stats = data || {
    total_episodes: 0,
    total_hours: 0,
    completion_rate: 0,
  }

  return (
    <div className="question-card">
      <h2 className="mb-4">Overview</h2>
      <div className="space-y-4">
        <div>
          <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Total Episodes</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>{stats.total_episodes || 0}</div>
        </div>
        <div>
          <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Total Hours</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>{stats.total_hours?.toFixed(1) || '0.0'}</div>
        </div>
        <div>
          <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>Avg Completion Rate</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
            {((stats.completion_rate || 0) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  )
}

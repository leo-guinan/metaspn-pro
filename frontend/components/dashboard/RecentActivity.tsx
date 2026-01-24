'use client'

interface RecentActivityProps {
  data?: Array<{
    event_id: string
    episode_title: string
    event_type: string
    timestamp_utc: string
  }>
}

export default function RecentActivity({ data }: RecentActivityProps) {
  const activities = data || []

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      play: '▶️ Played',
      pause: '⏸️ Paused',
      finish: '✅ Finished',
      bounce: '⏭️ Bounced',
      highlight: '⭐ Highlighted',
      note: '📝 Noted',
      share: '🔗 Shared',
    }
    return labels[type] || type
  }

  return (
    <div className="question-card">
      <h2 className="mb-4">Recent Activity</h2>
      {activities.length > 0 ? (
        <div className="space-y-2">
          {activities.slice(0, 10).map((activity) => (
            <div
              key={activity.event_id}
              className="flex items-center justify-between p-3"
              style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)' }}
            >
              <div>
                <div className="font-semibold">{activity.episode_title}</div>
                <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                  {getEventTypeLabel(activity.event_type)} •{' '}
                  {new Date(activity.timestamp_utc).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8" style={{ color: 'var(--fg-subtle)' }}>No recent activity</div>
      )}
    </div>
  )
}

'use client'

interface FanScoreListProps {
  data?: Array<{
    podcast_id: string
    title: string
    fan_score?: number
    episode_count?: number
  }>
}

export default function FanScoreList({ data }: FanScoreListProps) {
  const podcasts = data || []

  return (
    <div className="question-card">
      <h2 className="mb-4">Top Podcasts by Fan Score</h2>
      {podcasts.length > 0 ? (
        <div className="space-y-3">
          {podcasts.map((podcast, index) => (
            <div key={podcast.podcast_id} className="flex items-center justify-between p-3" style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)' }}>
              <div className="flex items-center space-x-3">
                <div className="text-2xl font-bold" style={{ color: 'var(--fg-subtle)' }}>#{index + 1}</div>
                <div>
                  <div className="font-semibold">{podcast.title}</div>
                  <div className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                    {podcast.episode_count || 0} episodes
                  </div>
                </div>
              </div>
              <div className="text-lg font-bold" style={{ color: 'var(--gold)' }}>
                {podcast.fan_score?.toFixed(1) || '0.0'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8" style={{ color: 'var(--fg-subtle)' }}>No podcasts yet</div>
      )}
    </div>
  )
}

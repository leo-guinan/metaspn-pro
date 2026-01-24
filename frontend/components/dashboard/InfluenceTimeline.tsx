'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface InfluenceTimelineProps {
  data?: Array<{
    date: string
    influence_score: number
    completion_ratio: number
    episode_title: string
  }>
}

export default function InfluenceTimeline({ data }: InfluenceTimelineProps) {
  const timelineData = data || []

  return (
    <div className="question-card">
      <h2 className="mb-4">Influence Over Time</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
        X-axis: Time | Y-axis: Influence Score | Points: Episodes | Color: Completion ratio
      </p>
      {timelineData.length > 0 ? (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
              stroke="var(--fg-dim)"
            />
            <YAxis stroke="var(--fg-dim)" />
            <Tooltip
              formatter={(value: any, name: string) => {
                if (name === 'influence_score') return [value.toFixed(2), 'Influence Score']
                if (name === 'completion_ratio') return [(value * 100).toFixed(1) + '%', 'Completion']
                return [value, name]
              }}
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="influence_score"
              stroke="#d4af37"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Influence Score"
            />
            <Line
              type="monotone"
              dataKey="completion_ratio"
              stroke="#f4cf57"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Completion Ratio"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-8" style={{ color: 'var(--fg-subtle)' }}>No influence data available</div>
      )}
    </div>
  )
}

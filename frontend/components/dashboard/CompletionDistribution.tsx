'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface CompletionDistributionProps {
  data?: {
    finished?: number
    mostly?: number
    sampled?: number
    bounced?: number
  }
}

const COLORS = {
  finished: '#d4af37', // gold
  mostly: '#f4cf57', // gold-light
  sampled: '#b4941f', // gold-dark
  bounced: '#c41e3a', // red
}

export default function CompletionDistribution({ data }: CompletionDistributionProps) {
  const distribution = data || {
    finished: 0,
    mostly: 0,
    sampled: 0,
    bounced: 0,
  }

  const chartData = [
    { name: 'Finished (≥90%)', value: distribution.finished || 0, color: COLORS.finished },
    { name: 'Mostly (70-90%)', value: distribution.mostly || 0, color: COLORS.mostly },
    { name: 'Sampled (20-70%)', value: distribution.sampled || 0, color: COLORS.sampled },
    { name: 'Bounced (≤20%)', value: distribution.bounced || 0, color: COLORS.bounced },
  ].filter((item) => item.value > 0)

  return (
    <div className="question-card">
      <h2 className="mb-4">Completion Distribution</h2>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-8" style={{ color: 'var(--fg-subtle)' }}>No data available</div>
      )}
    </div>
  )
}

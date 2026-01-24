import { Agent } from '@mastra/core/agent'
import {
  calculateCompletionRatio,
  getCompletionBucket,
} from '../tools/metrics-tools'
import { calculateFanScore } from '../tools/fan-score-tools'
import { calculateInfluenceScore } from '../tools/influence-score-tools'

export const dailyReportAgent = new Agent({
  id: 'daily_report_agent',
  name: 'daily_report_agent',
  instructions: `You are an agent responsible for generating daily analytics reports.

  Your responsibilities:
  - Pull metrics from the database using available tools
  - Analyze listener behavior patterns
  - Identify anomalies or interesting trends
  - Generate actionable recommendations
  
  Use the available tools to gather:
  - Completion metrics
  - Fan scores
  - Influence scores
  - User activity patterns
  
  Then analyze the data and provide:
  - Top insights about listener behavior
  - Anomalies or patterns worth investigating
  - One actionable recommendation for product improvement`,
  model: 'anthropic/claude-3-5-sonnet-20241022',
  tools: {
    calculateCompletionRatio,
    getCompletionBucket,
    calculateFanScore,
    calculateInfluenceScore,
  },
})

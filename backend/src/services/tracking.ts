/**
 * Tracking Service for Admin Dashboard Observability
 * Tracks workflow runs, steps, agent invocations, and tool calls
 */

import { pool } from '../db/index.js'

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed'
export type TriggerType = 'cron' | 'manual' | 'api' | 'webhook'

export interface RunInfo {
  run_id: string
  workflow_name: string
  status: RunStatus
  trigger: TriggerType
  started_at: Date
}

export interface StepInfo {
  step_id: string
  run_id: string
  step_name: string
  step_index: number
  status: RunStatus
  started_at: Date
}

export interface AgentInvocationInfo {
  invocation_id: string
  run_id: string | null
  step_id: string | null
  agent_name: string
  model: string | null
  started_at: Date
}

export interface ToolCallInfo {
  call_id: string
  run_id: string | null
  step_id: string | null
  invocation_id: string | null
  tool_name: string
  started_at: Date
}

// ============================================================================
// Workflow Run Tracking
// ============================================================================

/**
 * Start tracking a new workflow run
 */
export async function startRun(
  workflowName: string,
  trigger: TriggerType = 'cron',
  inputData?: Record<string, unknown>
): Promise<RunInfo> {
  const result = await pool.query(
    `INSERT INTO workflow_runs (workflow_name, status, trigger, input_data, started_at)
     VALUES ($1, 'running', $2, $3, NOW())
     RETURNING run_id, workflow_name, status, trigger, started_at`,
    [workflowName, trigger, inputData ? JSON.stringify(inputData) : null]
  )
  
  return result.rows[0]
}

/**
 * End a workflow run with final status
 */
export async function endRun(
  runId: string,
  status: 'completed' | 'failed',
  outputData?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE workflow_runs
     SET status = $1,
         output_data = $2,
         error_message = $3,
         ended_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE run_id = $4`,
    [
      status,
      outputData ? JSON.stringify(outputData) : null,
      errorMessage || null,
      runId,
    ]
  )
}

// ============================================================================
// Workflow Step Tracking
// ============================================================================

/**
 * Start tracking a workflow step
 */
export async function startStep(
  runId: string,
  stepName: string,
  stepIndex: number = 0,
  inputData?: Record<string, unknown>
): Promise<StepInfo> {
  const result = await pool.query(
    `INSERT INTO workflow_steps (run_id, step_name, step_index, status, input_data, started_at)
     VALUES ($1, $2, $3, 'running', $4, NOW())
     RETURNING step_id, run_id, step_name, step_index, status, started_at`,
    [runId, stepName, stepIndex, inputData ? JSON.stringify(inputData) : null]
  )
  
  return result.rows[0]
}

/**
 * End a workflow step with final status
 */
export async function endStep(
  stepId: string,
  status: 'completed' | 'failed',
  outputData?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE workflow_steps
     SET status = $1,
         output_data = $2,
         error_message = $3,
         ended_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE step_id = $4`,
    [
      status,
      outputData ? JSON.stringify(outputData) : null,
      errorMessage || null,
      stepId,
    ]
  )
}

// ============================================================================
// Agent Invocation Tracking
// ============================================================================

/**
 * Start tracking an agent invocation
 */
export async function startAgentInvocation(
  agentName: string,
  model?: string,
  runId?: string,
  stepId?: string,
  promptPreview?: string
): Promise<AgentInvocationInfo> {
  const result = await pool.query(
    `INSERT INTO agent_invocations (run_id, step_id, agent_name, model, prompt_preview, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', NOW())
     RETURNING invocation_id, run_id, step_id, agent_name, model, started_at`,
    [
      runId || null,
      stepId || null,
      agentName,
      model || null,
      promptPreview ? promptPreview.substring(0, 1000) : null, // Limit preview size
    ]
  )
  
  return result.rows[0]
}

/**
 * End an agent invocation with results
 */
export async function endAgentInvocation(
  invocationId: string,
  status: 'completed' | 'failed',
  responsePreview?: string,
  tokens?: { prompt?: number; completion?: number; total?: number },
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE agent_invocations
     SET status = $1,
         response_preview = $2,
         prompt_tokens = $3,
         completion_tokens = $4,
         total_tokens = $5,
         error_message = $6,
         ended_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE invocation_id = $7`,
    [
      status,
      responsePreview ? responsePreview.substring(0, 1000) : null,
      tokens?.prompt || null,
      tokens?.completion || null,
      tokens?.total || null,
      errorMessage || null,
      invocationId,
    ]
  )
}

// ============================================================================
// Tool Call Tracking
// ============================================================================

/**
 * Start tracking a tool call
 */
export async function startToolCall(
  toolName: string,
  inputData?: Record<string, unknown>,
  runId?: string,
  stepId?: string,
  invocationId?: string
): Promise<ToolCallInfo> {
  const result = await pool.query(
    `INSERT INTO tool_calls (run_id, step_id, invocation_id, tool_name, input_data, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', NOW())
     RETURNING call_id, run_id, step_id, invocation_id, tool_name, started_at`,
    [
      runId || null,
      stepId || null,
      invocationId || null,
      toolName,
      inputData ? JSON.stringify(inputData) : null,
    ]
  )
  
  return result.rows[0]
}

/**
 * End a tool call with results
 */
export async function endToolCall(
  callId: string,
  status: 'completed' | 'failed',
  outputPreview?: string,
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE tool_calls
     SET status = $1,
         output_preview = $2,
         error_message = $3,
         ended_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE call_id = $4`,
    [
      status,
      outputPreview ? outputPreview.substring(0, 1000) : null,
      errorMessage || null,
      callId,
    ]
  )
}

// ============================================================================
// Query Functions for Admin Dashboard
// ============================================================================

export interface RunsFilter {
  status?: RunStatus
  workflow_name?: string
  trigger?: TriggerType
  limit?: number
  offset?: number
  since?: Date
}

/**
 * Get workflow runs with optional filtering
 */
export async function getRuns(filter: RunsFilter = {}): Promise<{
  runs: any[]
  total: number
}> {
  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (filter.status) {
    conditions.push(`status = $${paramIndex++}`)
    params.push(filter.status)
  }
  if (filter.workflow_name) {
    conditions.push(`workflow_name = $${paramIndex++}`)
    params.push(filter.workflow_name)
  }
  if (filter.trigger) {
    conditions.push(`trigger = $${paramIndex++}`)
    params.push(filter.trigger)
  }
  if (filter.since) {
    conditions.push(`started_at >= $${paramIndex++}`)
    params.push(filter.since)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  
  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM workflow_runs ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].total, 10)

  // Get paginated runs
  const limit = filter.limit || 50
  const offset = filter.offset || 0
  
  const runsResult = await pool.query(
    `SELECT 
      run_id,
      workflow_name,
      status,
      trigger,
      input_data,
      output_data,
      error_message,
      started_at,
      ended_at,
      duration_ms,
      created_at
     FROM workflow_runs
     ${whereClause}
     ORDER BY started_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  )

  return { runs: runsResult.rows, total }
}

/**
 * Get a single run with all nested details (steps, agent invocations, tool calls)
 */
export async function getRunDetail(runId: string): Promise<{
  run: any
  steps: any[]
  agent_invocations: any[]
  tool_calls: any[]
} | null> {
  // Get run
  const runResult = await pool.query(
    `SELECT * FROM workflow_runs WHERE run_id = $1`,
    [runId]
  )
  
  if (runResult.rows.length === 0) {
    return null
  }

  const run = runResult.rows[0]

  // Get steps
  const stepsResult = await pool.query(
    `SELECT * FROM workflow_steps WHERE run_id = $1 ORDER BY step_index, started_at`,
    [runId]
  )

  // Get agent invocations
  const agentResult = await pool.query(
    `SELECT * FROM agent_invocations WHERE run_id = $1 ORDER BY started_at`,
    [runId]
  )

  // Get tool calls
  const toolsResult = await pool.query(
    `SELECT * FROM tool_calls WHERE run_id = $1 ORDER BY started_at`,
    [runId]
  )

  return {
    run,
    steps: stepsResult.rows,
    agent_invocations: agentResult.rows,
    tool_calls: toolsResult.rows,
  }
}

/**
 * Get aggregate statistics for admin dashboard
 */
export async function getStats(sinceDays: number = 7): Promise<{
  total_runs: number
  successful_runs: number
  failed_runs: number
  running_runs: number
  success_rate: number
  avg_duration_ms: number
  runs_by_workflow: Record<string, number>
  runs_by_day: Array<{ date: string; count: number; failed: number }>
  total_agent_invocations: number
  total_tool_calls: number
}> {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)

  // Basic run stats
  const statsResult = await pool.query(
    `SELECT 
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
      COUNT(*) FILTER (WHERE status = 'running') as running_runs,
      AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration_ms
     FROM workflow_runs
     WHERE started_at >= $1`,
    [since]
  )

  const stats = statsResult.rows[0]
  const totalRuns = parseInt(stats.total_runs, 10)
  const successfulRuns = parseInt(stats.successful_runs, 10)

  // Runs by workflow
  const byWorkflowResult = await pool.query(
    `SELECT workflow_name, COUNT(*) as count
     FROM workflow_runs
     WHERE started_at >= $1
     GROUP BY workflow_name
     ORDER BY count DESC`,
    [since]
  )

  const runsByWorkflow: Record<string, number> = {}
  for (const row of byWorkflowResult.rows) {
    runsByWorkflow[row.workflow_name] = parseInt(row.count, 10)
  }

  // Runs by day
  const byDayResult = await pool.query(
    `SELECT 
      DATE(started_at) as date,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
     FROM workflow_runs
     WHERE started_at >= $1
     GROUP BY DATE(started_at)
     ORDER BY date DESC`,
    [since]
  )

  const runsByDay = byDayResult.rows.map((row) => ({
    date: row.date.toISOString().split('T')[0],
    count: parseInt(row.count, 10),
    failed: parseInt(row.failed, 10),
  }))

  // Agent invocations count
  const agentCountResult = await pool.query(
    `SELECT COUNT(*) as count FROM agent_invocations WHERE started_at >= $1`,
    [since]
  )

  // Tool calls count
  const toolCountResult = await pool.query(
    `SELECT COUNT(*) as count FROM tool_calls WHERE started_at >= $1`,
    [since]
  )

  return {
    total_runs: totalRuns,
    successful_runs: successfulRuns,
    failed_runs: parseInt(stats.failed_runs, 10),
    running_runs: parseInt(stats.running_runs, 10),
    success_rate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
    avg_duration_ms: parseFloat(stats.avg_duration_ms) || 0,
    runs_by_workflow: runsByWorkflow,
    runs_by_day: runsByDay,
    total_agent_invocations: parseInt(agentCountResult.rows[0].count, 10),
    total_tool_calls: parseInt(toolCountResult.rows[0].count, 10),
  }
}

/**
 * Get list of unique workflow names for filtering
 */
export async function getWorkflowNames(): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT workflow_name FROM workflow_runs ORDER BY workflow_name`
  )
  return result.rows.map((row) => row.workflow_name)
}

/**
 * Check if a user is an admin
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT is_admin FROM users WHERE user_id = $1`,
    [userId]
  )
  return result.rows.length > 0 && result.rows[0].is_admin === true
}

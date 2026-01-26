import { pool } from '../../db/index.js'
import { NetworkChanges, GateConfig, GateResult, createGate } from './gate-types.js'

export interface GateEvaluationResult {
  passed: boolean
  gate_results: Array<{
    gate_type: string
    result: GateResult
  }>
  failed_gates: string[]
}

/**
 * Evaluate changes through all gates for a watch relationship
 */
export async function evaluateGates(
  watchId: string,
  changes: NetworkChanges
): Promise<GateEvaluationResult> {
  // Fetch all enabled gates for this watch, ordered by priority
  const gatesResult = await pool.query(
    `SELECT gate_id, gate_type, config, priority
     FROM network_gates
     WHERE watch_id = $1
     AND is_enabled = true
     ORDER BY priority ASC`,
    [watchId]
  )
  
  const gates = gatesResult.rows as Array<{
    gate_id: string
    gate_type: string
    config: Record<string, unknown>
    priority: number
  }>
  
  if (gates.length === 0) {
    // No gates = pass everything
    return {
      passed: true,
      gate_results: [],
      failed_gates: [],
    }
  }
  
  const gateResults: GateEvaluationResult['gate_results'] = []
  const failedGates: string[] = []
  
  // Evaluate each gate in order
  for (const gate of gates) {
    const gateInstance = createGate(gate.gate_type)
    const gateConfig: GateConfig = {
      gate_type: gate.gate_type,
      config: gate.config,
      is_enabled: true,
      priority: gate.priority,
    }
    
    try {
      const result = await gateInstance.evaluate(changes, gateConfig)
      
      gateResults.push({
        gate_type: gate.gate_type,
        result,
      })
      
      if (!result.passed) {
        failedGates.push(gate.gate_type)
      }
    } catch (error) {
      console.error(`Error evaluating gate ${gate.gate_type}:`, error)
      // On error, fail the gate
      gateResults.push({
        gate_type: gate.gate_type,
        result: {
          passed: false,
          reason: `Gate evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
      failedGates.push(gate.gate_type)
    }
  }
  
  // All gates must pass
  const passed = failedGates.length === 0
  
  return {
    passed,
    gate_results: gateResults,
    failed_gates: failedGates,
  }
}

/**
 * Evaluate changes for all watchers of a user
 */
export async function evaluateForAllWatchers(
  watchedUserId: string,
  repoOwner: string,
  repoName: string,
  changes: NetworkChanges
): Promise<Array<{
  watch_id: string
  watcher_user_id: string
  evaluation: GateEvaluationResult
}>> {
  // Find all active watches for this user/repo
  const watchesResult = await pool.query(
    `SELECT watch_id, watcher_user_id
     FROM network_watches
     WHERE watched_user_id = $1
     AND watched_repo_owner = $2
     AND watched_repo_name = $3
     AND is_active = true`,
    [watchedUserId, repoOwner, repoName]
  )
  
  const results = await Promise.all(
    watchesResult.rows.map(async (watch) => {
      const evaluation = await evaluateGates(watch.watch_id, changes)
      return {
        watch_id: watch.watch_id,
        watcher_user_id: watch.watcher_user_id,
        evaluation,
      }
    })
  )
  
  return results
}

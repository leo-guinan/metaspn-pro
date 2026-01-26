import { pool } from '../db/index.js'
import { GateConfig } from './gates/gate-types.js'

export interface WatchConfig {
  watched_user_id: string
  watched_repo_owner: string
  watched_repo_name: string
  watch_type: 'full' | 'selective' | 'minimal'
  gates?: Array<{
    gate_type: string
    config: Record<string, unknown>
    is_enabled?: boolean
    priority?: number
  }>
}

export interface Watch {
  watch_id: string
  watcher_user_id: string
  watched_user_id: string
  watched_repo_owner: string
  watched_repo_name: string
  watch_type: 'full' | 'selective' | 'minimal'
  is_active: boolean
  started_at: Date
  last_sync_at: Date | null
  gates: GateConfig[]
}

/**
 * Add a watch relationship
 */
export async function addWatch(
  watcherUserId: string,
  config: WatchConfig
): Promise<Watch> {
  // Check if watch already exists
  const existing = await pool.query(
    `SELECT watch_id
     FROM network_watches
     WHERE watcher_user_id = $1
     AND watched_user_id = $2`,
    [watcherUserId, config.watched_user_id]
  )
  
  let watchId: string
  
  if (existing.rows.length > 0) {
    // Update existing watch
    watchId = existing.rows[0].watch_id
    await pool.query(
      `UPDATE network_watches
       SET watched_repo_owner = $1,
           watched_repo_name = $2,
           watch_type = $3,
           is_active = true,
           updated_at = NOW()
       WHERE watch_id = $4`,
      [config.watched_repo_owner, config.watched_repo_name, config.watch_type, watchId]
    )
  } else {
    // Create new watch
    const result = await pool.query(
      `INSERT INTO network_watches (
        watcher_user_id, watched_user_id, watched_repo_owner,
        watched_repo_name, watch_type, is_active
      ) VALUES ($1, $2, $3, $4, $5, true)
      RETURNING watch_id`,
      [
        watcherUserId,
        config.watched_user_id,
        config.watched_repo_owner,
        config.watched_repo_name,
        config.watch_type,
      ]
    )
    watchId = result.rows[0].watch_id
  }
  
  // Add/update gates
  if (config.gates && config.gates.length > 0) {
    // Delete existing gates
    await pool.query(
      `DELETE FROM network_gates WHERE watch_id = $1`,
      [watchId]
    )
    
    // Insert new gates
    for (let i = 0; i < config.gates.length; i++) {
      const gate = config.gates[i]
      await pool.query(
        `INSERT INTO network_gates (
          watch_id, gate_type, config, is_enabled, priority
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (watch_id, gate_type) DO UPDATE SET
          config = EXCLUDED.config,
          is_enabled = EXCLUDED.is_enabled,
          priority = EXCLUDED.priority,
          updated_at = NOW()`,
        [
          watchId,
          gate.gate_type,
          JSON.stringify(gate.config),
          gate.is_enabled ?? true,
          gate.priority ?? i,
        ]
      )
    }
  }
  
  return getWatch(watchId)
}

/**
 * Get a watch by ID
 */
export async function getWatch(watchId: string): Promise<Watch> {
  const watchResult = await pool.query(
    `SELECT watch_id, watcher_user_id, watched_user_id,
            watched_repo_owner, watched_repo_name, watch_type,
            is_active, started_at, last_sync_at
     FROM network_watches
     WHERE watch_id = $1`,
    [watchId]
  )
  
  if (watchResult.rows.length === 0) {
    throw new Error(`Watch ${watchId} not found`)
  }
  
  const watch = watchResult.rows[0]
  
  // Get gates
  const gatesResult = await pool.query(
    `SELECT gate_type, config, is_enabled, priority
     FROM network_gates
     WHERE watch_id = $1
     ORDER BY priority ASC`,
    [watchId]
  )
  
  const gates: GateConfig[] = gatesResult.rows.map((row) => ({
    gate_type: row.gate_type,
    config: row.config,
    is_enabled: row.is_enabled,
    priority: row.priority,
  }))
  
  return {
    watch_id: watch.watch_id,
    watcher_user_id: watch.watcher_user_id,
    watched_user_id: watch.watched_user_id,
    watched_repo_owner: watch.watched_repo_owner,
    watched_repo_name: watch.watched_repo_name,
    watch_type: watch.watch_type,
    is_active: watch.is_active,
    started_at: watch.started_at,
    last_sync_at: watch.last_sync_at,
    gates,
  }
}

/**
 * Remove a watch relationship
 */
export async function removeWatch(watchId: string, watcherUserId: string): Promise<void> {
  // Verify ownership
  const watch = await getWatch(watchId)
  if (watch.watcher_user_id !== watcherUserId) {
    throw new Error('Unauthorized: watch does not belong to user')
  }
  
  // Delete gates first (cascade should handle this, but explicit is better)
  await pool.query(`DELETE FROM network_gates WHERE watch_id = $1`, [watchId])
  
  // Delete watch
  await pool.query(`DELETE FROM network_watches WHERE watch_id = $1`, [watchId])
}

/**
 * List watches for a user (who they're watching)
 */
export async function listWatches(watcherUserId: string): Promise<Watch[]> {
  const result = await pool.query(
    `SELECT watch_id
     FROM network_watches
     WHERE watcher_user_id = $1
     AND is_active = true
     ORDER BY started_at DESC`,
    [watcherUserId]
  )
  
  return Promise.all(result.rows.map((row) => getWatch(row.watch_id)))
}

/**
 * List watchers of a user (who's watching them)
 */
export async function listWatchers(watchedUserId: string): Promise<Array<{
  watch_id: string
  watcher_user_id: string
  watch_type: string
  started_at: Date
  last_sync_at: Date | null
}>> {
  const result = await pool.query(
    `SELECT watch_id, watcher_user_id, watch_type, started_at, last_sync_at
     FROM network_watches
     WHERE watched_user_id = $1
     AND is_active = true
     ORDER BY started_at DESC`,
    [watchedUserId]
  )
  
  return result.rows.map((row) => ({
    watch_id: row.watch_id,
    watcher_user_id: row.watcher_user_id,
    watch_type: row.watch_type,
    started_at: row.started_at,
    last_sync_at: row.last_sync_at,
  }))
}

/**
 * Update watch gates
 */
export async function updateWatchGates(
  watchId: string,
  watcherUserId: string,
  gates: Array<{
    gate_type: string
    config: Record<string, unknown>
    is_enabled?: boolean
    priority?: number
  }>
): Promise<Watch> {
  // Verify ownership
  const watch = await getWatch(watchId)
  if (watch.watcher_user_id !== watcherUserId) {
    throw new Error('Unauthorized: watch does not belong to user')
  }
  
  // Delete existing gates
  await pool.query(`DELETE FROM network_gates WHERE watch_id = $1`, [watchId])
  
  // Insert new gates
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i]
    await pool.query(
      `INSERT INTO network_gates (
        watch_id, gate_type, config, is_enabled, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        watchId,
        gate.gate_type,
        JSON.stringify(gate.config),
        gate.is_enabled ?? true,
        gate.priority ?? i,
      ]
    )
  }
  
  return getWatch(watchId)
}

/**
 * Update last sync time for a watch
 */
export async function updateWatchSyncTime(watchId: string): Promise<void> {
  await pool.query(
    `UPDATE network_watches
     SET last_sync_at = NOW()
     WHERE watch_id = $1`,
    [watchId]
  )
}

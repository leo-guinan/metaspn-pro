import { Octokit } from 'octokit'
import { pool } from '../db/index.js'
import { getFileContent, createOctokit, decryptToken } from './github.js'
import { analyzeContent, extractGameSignature, detectTrajectoryShift } from './content-analysis.js'
import { NetworkChanges } from './gates/gate-types.js'

export interface GitHubPushEvent {
  repository: {
    owner: { login: string }
    name: string
    html_url: string
  }
  commits: Array<{
    id: string
    message: string
    added: string[]
    modified: string[]
    removed: string[]
    timestamp: string
  }>
  pusher: {
    name: string
    email: string
  }
}

export interface ProcessedChanges {
  user_id: string
  repo_owner: string
  repo_name: string
  changes: NetworkChanges
  analysis_results: {
    game_signature: ReturnType<typeof extractGameSignature> extends Promise<infer T> ? T : never
    themes: string[]
    trajectory_shift: Awaited<ReturnType<typeof detectTrajectoryShift>>
    content_analyses: Array<Awaited<ReturnType<typeof analyzeContent>>>
  }
}

/**
 * Parse GitHub push event and extract changes
 */
export async function analyzePushEvent(
  event: GitHubPushEvent,
  octokit: Octokit
): Promise<ProcessedChanges> {
  const repoOwner = event.repository.owner.login
  const repoName = event.repository.name
  
  // Find user by repo
  const userResult = await pool.query(
    `SELECT user_id, branch
     FROM user_github_repos
     WHERE repo_owner = $1
     AND repo_name = $2`,
    [repoOwner, repoName]
  )
  
  if (userResult.rows.length === 0) {
    throw new Error(`No user found for repo ${repoOwner}/${repoName}`)
  }
  
  const userId = userResult.rows[0].user_id
  const branch = userResult.rows[0].branch || 'main'
  
  const changes: NetworkChanges = {
    new_artifacts: [],
    new_sources: [],
    updated_reports: [],
  }
  
  // Process each commit
  for (const commit of event.commits) {
    // Check for new artifacts
    for (const file of commit.added) {
      if (file.startsWith('artifacts/')) {
        try {
          const content = await getFileContent(octokit, repoOwner, repoName, file, branch)
          if (content) {
            // Parse JSONL if it's a JSONL file
            if (file.endsWith('.jsonl')) {
              const lines = content.content.trim().split('\n').filter((l) => l.trim())
              for (const line of lines) {
                try {
                  const artifact = JSON.parse(line)
                  changes.new_artifacts?.push({
                    id: artifact.id || commit.id,
                    type: file.split('/')[1] || 'unknown', // e.g., 'twitter', 'blog'
                    text: artifact.tweet?.text || artifact.text || artifact.content || '',
                    timestamp: artifact.timestamp || commit.timestamp,
                    url: artifact.tweet?.url || artifact.url,
                  })
                } catch {
                  // Skip invalid JSON lines
                }
              }
            } else {
              // Single JSON file
              try {
                const artifact = JSON.parse(content.content)
                changes.new_artifacts?.push({
                  id: artifact.id || commit.id,
                  type: file.split('/')[1] || 'unknown',
                  text: artifact.tweet?.text || artifact.text || artifact.content || '',
                  timestamp: artifact.timestamp || commit.timestamp,
                  url: artifact.tweet?.url || artifact.url,
                })
              } catch {
                // Not JSON, treat as text
                changes.new_artifacts?.push({
                  id: commit.id,
                  type: file.split('/')[1] || 'unknown',
                  text: content.content.substring(0, 1000), // Limit text length
                  timestamp: commit.timestamp,
                })
              }
            }
          }
        } catch (error) {
          console.error(`Error reading artifact file ${file}:`, error)
        }
      }
      
      // Check for new sources
      if (file.startsWith('sources/')) {
        try {
          const content = await getFileContent(octokit, repoOwner, repoName, file, branch)
          if (content && file.endsWith('.jsonl')) {
            const lines = content.content.trim().split('\n').filter((l) => l.trim())
            for (const line of lines) {
              try {
                const source = JSON.parse(line)
                changes.new_sources?.push({
                  id: source.id || commit.id,
                  type: file.split('/')[1] || 'unknown',
                  text: source.text || source.content || '',
                  timestamp: source.timestamp || commit.timestamp,
                })
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        } catch (error) {
          console.error(`Error reading source file ${file}:`, error)
        }
      }
      
      // Check for updated reports
      if (file.startsWith('reports/')) {
        try {
          const content = await getFileContent(octokit, repoOwner, repoName, file, branch)
          if (content) {
            changes.updated_reports?.push({
              type: file.split('/')[1]?.replace('.md', '').replace('.json', '') || 'unknown',
              content: content.content.substring(0, 5000), // Limit content
              timestamp: commit.timestamp,
            })
          }
        } catch (error) {
          console.error(`Error reading report file ${file}:`, error)
        }
      }
    }
    
    // Check modified files (treat as updates)
    for (const file of commit.modified) {
      if (file.startsWith('reports/')) {
        try {
          const content = await getFileContent(octokit, repoOwner, repoName, file, branch)
          if (content) {
            changes.updated_reports?.push({
              type: file.split('/')[1]?.replace('.md', '').replace('.json', '') || 'unknown',
              content: content.content.substring(0, 5000),
              timestamp: commit.timestamp,
            })
          }
        } catch (error) {
          console.error(`Error reading modified report file ${file}:`, error)
        }
      }
    }
  }
  
  // Analyze all content
  const allTexts: string[] = [
    ...(changes.new_artifacts?.map((a) => a.text) || []),
    ...(changes.new_sources?.map((s) => s.text) || []),
    ...(changes.updated_reports?.map((r) => r.content) || []),
  ].filter((t) => t.length > 0)
  
  // Extract game signature from all content
  const gameSignature = allTexts.length > 0
    ? await extractGameSignature(allTexts)
    : { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 }
  
  changes.game_signature = gameSignature
  
  // Extract themes
  const allContent = allTexts.join(' ')
  const themes = allContent.length > 0
    ? await (await import('./content-analysis.js')).extractThemes(allContent)
    : []
  
  changes.themes = themes
  
  // Analyze individual artifacts
  const contentAnalyses = await Promise.all(
    (changes.new_artifacts || []).map((artifact) =>
      analyzeContent({
        text: artifact.text,
        userId,
        timestamp: artifact.timestamp,
        source: artifact.type,
      })
    )
  )
  
  // Detect trajectory shift
  const trajectoryShift = await detectTrajectoryShift(userId, {
    new_artifacts: changes.new_artifacts?.length || 0,
    new_sources: changes.new_sources?.length || 0,
    game_signature: gameSignature,
    themes,
  })
  
  changes.trajectory_shift = trajectoryShift
  
  // Add analysis to changes
  if (contentAnalyses.length > 0) {
    // Use first analysis as representative (or aggregate)
    changes.analysis = contentAnalyses[0]
  }
  
  // Store event in database
  await pool.query(
    `INSERT INTO network_events (
      user_id, repo_owner, repo_name, github_event_type, commit_sha,
      changes_detected, analysis_results
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      repoOwner,
      repoName,
      'push',
      event.commits[0]?.id || null,
      JSON.stringify(changes),
      JSON.stringify({
        game_signature: gameSignature,
        themes,
        trajectory_shift: trajectoryShift,
        content_analyses: contentAnalyses,
      }),
    ]
  )
  
  return {
    user_id: userId,
    repo_owner: repoOwner,
    repo_name: repoName,
    changes,
    analysis_results: {
      game_signature: gameSignature,
      themes,
      trajectory_shift: trajectoryShift,
      content_analyses: contentAnalyses,
    },
  }
}

/**
 * Process webhook event and route to watchers
 */
export async function processWebhookEvent(
  event: GitHubPushEvent
): Promise<void> {
  // Get user's GitHub token
  const userResult = await pool.query(
    `SELECT user_id, access_token_encrypted, branch
     FROM user_github_repos
     WHERE repo_owner = $1
     AND repo_name = $2`,
    [event.repository.owner.login, event.repository.name]
  )
  
  if (userResult.rows.length === 0) {
    throw new Error(`No user found for repo ${event.repository.owner.login}/${event.repository.name}`)
  }
  
  const token = decryptToken(userResult.rows[0].access_token_encrypted)
  const octokit = createOctokit(token)
  
  // Analyze the push event
  const processed = await analyzePushEvent(event, octokit)
  
  // Route to watchers via feed generator
  const { processChangesForWatchers } = await import('./feed-generator.js')
  await processChangesForWatchers(
    processed.user_id,
    processed.repo_owner,
    processed.repo_name,
    processed.changes
  )
  
  return
}

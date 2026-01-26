import cron from 'node-cron'
import {
  transcriptDiscoveryWorkflow,
  influenceLinkingWorkflow,
  generateDailyReportWorkflow,
  monthlyDigestWorkflow,
} from './mastra/workflows/index.js'
import { pool } from './db/index.js'
import { pushToGitHubForUser } from './services/github-push.js'

// Initialize database connection
async function initializeDatabase() {
  try {
    await pool.query('SELECT 1')
    console.log('✅ Database connected successfully')
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    throw error
  }
}

// Execute a workflow with error handling
async function executeWorkflow(
  workflowName: string,
  workflow: any,
  inputData: any = {}
) {
  try {
    console.log(`🚀 Starting workflow: ${workflowName}`)
    const run = await workflow.createRun()
    const result = await run.start({ inputData })
    console.log(`✅ Workflow completed: ${workflowName}`, result)
    return result
  } catch (error: any) {
    console.error(`❌ Workflow failed: ${workflowName}`, error.message)
    // Don't throw - we want the worker to continue running
    return null
  }
}

// Watch for new episodes/podcasts that need enhancement
async function watchForEnhancementTasks() {
  try {
    // Check for podcasts without RSS feed or episodes
    const podcastsNeedingEnhancement = await pool.query(
      `SELECT podcast_id, title 
       FROM podcasts 
       WHERE rss_feed_url IS NULL 
       OR podcast_id NOT IN (SELECT DISTINCT podcast_id FROM episodes)
       LIMIT 10`
    )

    if (podcastsNeedingEnhancement.rows.length > 0) {
      console.log(
        `📋 Found ${podcastsNeedingEnhancement.rows.length} podcasts needing enhancement`
      )
      // Could trigger enhancement workflows here
    }

    // Check for episodes without transcripts
    const episodesNeedingTranscripts = await pool.query(
      `SELECT episode_id, title 
       FROM episodes 
       WHERE transcript_url IS NULL 
       AND release_time > NOW() - INTERVAL '30 days'
       LIMIT 10`
    )

    if (episodesNeedingTranscripts.rows.length > 0) {
      console.log(
        `📋 Found ${episodesNeedingTranscripts.rows.length} episodes needing transcripts`
      )
    }
  } catch (error: any) {
    console.error('❌ Error watching for enhancement tasks:', error.message)
  }
}

// Main worker function
async function startWorker() {
  console.log('🔧 Starting MetaSPN Worker...')

  // Initialize database
  await initializeDatabase()

  // Schedule workflows
  console.log('⏰ Registering scheduled workflows...')

  // Transcript discovery: Daily at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    console.log('📅 Running scheduled: Transcript Discovery (2 AM UTC)')
    await executeWorkflow('transcript_discovery', transcriptDiscoveryWorkflow, {})
  })

  // Influence linking: Hourly
  cron.schedule('0 * * * *', async () => {
    console.log('📅 Running scheduled: Influence Linking (hourly)')
    await executeWorkflow('influence_linking', influenceLinkingWorkflow, {})
  })

  // Daily report: Midnight UTC
  cron.schedule('0 0 * * *', async () => {
    console.log('📅 Running scheduled: Daily Report (midnight UTC)')
    await executeWorkflow('daily_report', generateDailyReportWorkflow, {})
  })

  // Monthly digest: 1st of month at 1 AM UTC
  cron.schedule('0 1 1 * *', async () => {
    console.log('📅 Running scheduled: Monthly Digest (1st of month, 1 AM UTC)')
    await executeWorkflow('monthly_digest', monthlyDigestWorkflow, {})
  })

  // Watch for enhancement tasks: Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('👀 Checking for enhancement tasks...')
    await watchForEnhancementTasks()
  })

  // GitHub push: configurable via GITHUB_PUSH_CRON (default every 6 hours)
  const githubCron = process.env.GITHUB_PUSH_CRON?.trim() || '0 */6 * * *'
  if (githubCron) {
    cron.schedule(githubCron, async () => {
    console.log('📅 Running scheduled: GitHub push')
    try {
      const users = await pool.query('SELECT DISTINCT user_id FROM user_github_repos')
      for (const row of users.rows) {
        try {
          await pushToGitHubForUser(row.user_id)
        } catch (e: any) {
          console.error(`❌ GitHub push failed for user ${row.user_id}:`, e.message)
        }
      }
    } catch (e: any) {
      console.error('❌ GitHub push job error:', e.message)
    }
    })
  }

  // Network: Hub sync - Daily at 3 AM UTC
  cron.schedule('0 3 * * *', async () => {
    console.log('📅 Running scheduled: Hub Sync (3 AM UTC)')
    try {
      const { syncHubRepo } = await import('./services/hub-manager.js')
      const hubs = await pool.query('SELECT user_id FROM network_hubs')
      for (const row of hubs.rows) {
        try {
          await syncHubRepo(row.user_id)
        } catch (e: any) {
          console.error(`❌ Hub sync failed for user ${row.user_id}:`, e.message)
        }
      }
    } catch (e: any) {
      console.error('❌ Hub sync job error:', e.message)
    }
  })

  // Network: Feed digest generation - Daily at 9 AM UTC
  cron.schedule('0 9 * * *', async () => {
    console.log('📅 Running scheduled: Feed Digest Generation (9 AM UTC)')
    // TODO: Implement digest generation
  })

  // Network: Weekly digest - Monday at 10 AM UTC
  cron.schedule('0 10 * * 1', async () => {
    console.log('📅 Running scheduled: Weekly Feed Digest (Monday 10 AM UTC)')
    // TODO: Implement weekly digest generation
  })

  console.log('✅ Worker started successfully')
  console.log('📋 Scheduled jobs:')
  console.log('   - Transcript Discovery: Daily at 2 AM UTC')
  console.log('   - Influence Linking: Hourly')
  console.log('   - Daily Report: Midnight UTC')
  console.log('   - Monthly Digest: 1st of month at 1 AM UTC')
  console.log('   - Enhancement Watcher: Every 15 minutes')
  console.log(`   - GitHub push: ${githubCron}`)
  console.log('   - Hub Sync: Daily at 3 AM UTC')
  console.log('   - Feed Digest (Daily): Daily at 9 AM UTC')
  console.log('   - Feed Digest (Weekly): Monday at 10 AM UTC')

  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...')
    pool.end()
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...')
    pool.end()
    process.exit(0)
  })
}

// Start the worker
startWorker().catch((error) => {
  console.error('❌ Failed to start worker:', error)
  process.exit(1)
})

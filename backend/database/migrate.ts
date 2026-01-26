#!/usr/bin/env tsx
/**
 * Database migration runner
 * Runs all SQL migration files in database/migrations/ directory
 * Tracks applied migrations in schema_migrations table
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { pool } from '../src/db/index.js'
import { config } from 'dotenv'

// Load environment variables
config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get migrations directory (relative to repo root)
// This file is at backend/database/migrate.ts
// Migrations are at database/migrations/
const MIGRATIONS_DIR = join(__dirname, '../../database/migrations')

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('✅ Migrations tracking table ready')
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT version FROM schema_migrations')
  return new Set(result.rows.map((row: any) => row.version))
}

async function applyMigration(filename: string, sql: string) {
  const version = filename.replace('.sql', '')
  
  console.log(`📝 Applying migration: ${version}...`)
  
  // Run migration in a transaction
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [version]
    )
    await client.query('COMMIT')
    console.log(`✅ Migration applied: ${version}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function runMigrations() {
  try {
    console.log('🔄 Starting database migrations...')
    console.log(`📁 Migrations directory: ${MIGRATIONS_DIR}`)
    
    // Ensure migrations table exists
    await ensureMigrationsTable()
    
    // Get list of migration files
    const files = await readdir(MIGRATIONS_DIR)
    const migrationFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort() // Apply in alphabetical order
    
    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found')
      return
    }
    
    console.log(`📋 Found ${migrationFiles.length} migration file(s)`)
    
    // Get already applied migrations
    const applied = await getAppliedMigrations()
    
    let appliedCount = 0
    let skippedCount = 0
    
    // Apply each migration
    for (const filename of migrationFiles) {
      const version = filename.replace('.sql', '')
      
      if (applied.has(version)) {
        console.log(`⏭️  Skipping already applied migration: ${version}`)
        skippedCount++
        continue
      }
      
      const filePath = join(MIGRATIONS_DIR, filename)
      const sql = await readFile(filePath, 'utf-8')
      
      try {
        await applyMigration(filename, sql)
        appliedCount++
      } catch (error: any) {
        console.error(`❌ Migration failed: ${version}`)
        console.error(`   Error: ${error.message}`)
        throw error
      }
    }
    
    console.log('')
    console.log(`✅ Migrations complete: ${appliedCount} applied, ${skippedCount} skipped`)
  } catch (error: any) {
    console.error('❌ Migration runner failed:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run migrations
runMigrations()

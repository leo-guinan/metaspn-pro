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

// Get directories (relative to repo root)
// This file is at backend/database/migrate.ts
// Schema is at database/schema.sql
// Migrations are at database/migrations/
const SCHEMA_FILE = join(__dirname, '../../database/schema.sql')
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

async function checkIfSchemaApplied(): Promise<boolean> {
  // Check if base tables exist (users table is a good indicator)
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `)
    return result.rows[0]?.exists === true
  } catch {
    return false
  }
}

async function applySchema() {
  console.log('📋 Applying base schema (schema.sql)...')
  
  const sql = await readFile(SCHEMA_FILE, 'utf-8')
  
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      ['schema']
    )
    await client.query('COMMIT')
    console.log('✅ Base schema applied')
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('❌ Schema application failed:', error.message)
    throw error
  } finally {
    client.release()
  }
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
    console.log(`📁 Schema file: ${SCHEMA_FILE}`)
    console.log(`📁 Migrations directory: ${MIGRATIONS_DIR}`)
    
    // Test database connection
    try {
      await pool.query('SELECT 1')
      console.log('✅ Database connection successful')
    } catch (error: any) {
      console.error('❌ Database connection failed:', error.message)
      throw error
    }
    
    // Ensure migrations table exists
    await ensureMigrationsTable()
    
    // Check if base schema needs to be applied
    const schemaApplied = await checkIfSchemaApplied()
    const applied = await getAppliedMigrations()
    
    if (!schemaApplied && !applied.has('schema')) {
      console.log('📋 Base schema not found, applying schema.sql first...')
      try {
        await applySchema()
      } catch (error: any) {
        console.error('❌ Failed to apply base schema:', error.message)
        console.error('   This is required before migrations can run')
        throw error
      }
    } else if (schemaApplied) {
      console.log('✅ Base schema already applied')
    } else {
      console.log('⏭️  Base schema already recorded in migrations')
    }
    
    // Get list of migration files
    let migrationFiles: string[] = []
    try {
      const files = await readdir(MIGRATIONS_DIR)
      migrationFiles = files
        .filter((f) => f.endsWith('.sql'))
        .sort() // Apply in alphabetical order
    } catch (error: any) {
      console.error(`❌ Failed to read migrations directory: ${MIGRATIONS_DIR}`)
      console.error(`   Error: ${error.message}`)
      throw error
    }
    
    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found')
      console.log(`   Checked directory: ${MIGRATIONS_DIR}`)
      return
    }
    
    console.log(`📋 Found ${migrationFiles.length} migration file(s):`)
    migrationFiles.forEach(f => console.log(`   - ${f}`))
    
    // Refresh applied migrations list (schema might have been just applied)
    const appliedAfterSchema = await getAppliedMigrations()
    
    let appliedCount = 0
    let skippedCount = 0
    
    // Apply each migration
    for (const filename of migrationFiles) {
      const version = filename.replace('.sql', '')
      
      if (appliedAfterSchema.has(version)) {
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

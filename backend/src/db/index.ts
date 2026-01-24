import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/metaspn',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err)
  } else {
    console.log('✅ Database connected successfully')
  }
})

import { Context, Next } from 'hono'
import { pool } from '../db/index.js'

/**
 * Middleware to require admin access
 * Must be used after requireAuth middleware
 */
export async function requireAdmin(c: Context, next: Next) {
  const userId = c.get('user_id')
  
  if (!userId) {
    return c.json({ error: 'Unauthorized: Authentication required' }, 401)
  }

  try {
    const result = await pool.query(
      `SELECT is_admin FROM users WHERE user_id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Unauthorized: User not found' }, 401)
    }

    if (result.rows[0].is_admin !== true) {
      return c.json({ error: 'Forbidden: Admin access required' }, 403)
    }

    await next()
  } catch (error) {
    console.error('Admin middleware error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

/**
 * Optional admin check - sets is_admin flag in context but doesn't block
 * Useful for conditionally showing admin features
 */
export async function checkAdmin(c: Context, next: Next) {
  const userId = c.get('user_id')
  
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT is_admin FROM users WHERE user_id = $1`,
        [userId]
      )

      if (result.rows.length > 0 && result.rows[0].is_admin === true) {
        c.set('is_admin', true)
      } else {
        c.set('is_admin', false)
      }
    } catch (error) {
      console.error('Check admin error:', error)
      c.set('is_admin', false)
    }
  } else {
    c.set('is_admin', false)
  }

  await next()
}

// Extend Hono Variables to include is_admin
declare module 'hono' {
  interface ContextVariableMap {
    is_admin: boolean
  }
}

import { Context, Next } from 'hono'
import { verifyToken } from '../services/jwt.js'

// Extend Hono Variables to include user_id
declare module 'hono' {
  interface ContextVariableMap {
    user_id: string
  }
}

// Middleware to require authentication
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix
  const payload = verifyToken(token)

  if (!payload || !payload.user_id) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401)
  }

  // Set user_id in context for downstream handlers
  c.set('user_id', payload.user_id)

  await next()
}

// Optional auth middleware - sets user_id if token is valid, but doesn't fail if missing
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const payload = verifyToken(token)
    
    if (payload && payload.user_id) {
      c.set('user_id', payload.user_id)
    }
  }

  await next()
}

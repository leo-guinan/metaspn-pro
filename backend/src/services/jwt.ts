import jwt, { SignOptions } from 'jsonwebtoken'

const JWT_SECRET: string = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d'

export interface JWTPayload {
  user_id: string
  provider?: 'twitter' | 'github'
  iat?: number
  exp?: number
}

// Generate JWT token
export function generateToken(user_id: string, provider?: 'twitter' | 'github'): string {
  const payload: JWTPayload = {
    user_id,
    provider,
  }

  // expiresIn accepts string (like "7d") or number (seconds)
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions)
}

// Verify and decode JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    return null
  }
}

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { randomInt } from 'crypto'

function requireJwtSecret(): string {
  const v = process.env.JWT_SECRET
  if (!v || v.length < 32) {
    // Hard fail at module load. Better to crash on boot than to silently sign tokens
    // with a guessable secret in production.
    throw new Error(
      'JWT_SECRET environment variable is missing or too short (need 32+ chars). ' +
      'Generate one with: openssl rand -base64 48'
    )
  }
  return v
}
const JWT_SECRET: string = requireJwtSecret()
const COOKIE_NAME = 'switch_token'

export interface JwtPayload {
  userId: string
  role: 'EMPLOYER' | 'WORKER' | 'ADMIN' | 'CAPTAIN' | 'OPS'
  phone: string
  v?:    number   // tokenVersion — checked against User.tokenVersion to support logout-all
}

// 7 days. A stolen cookie is valid this long; logout-all bumps tokenVersion
// to instantly invalidate every token if the user reports compromise.
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function getTokenFromCookies(): JwtPayload | null {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export function generateOtp(): string {
  // Cryptographically secure 6-digit OTP. Math.random() is predictable.
  return randomInt(100000, 1000000).toString()
}

export const COOKIE_CONFIG = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60,  // matches JWT expiry; cookie + token expire together
    path: '/',
  },
}

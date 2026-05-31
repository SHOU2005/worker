/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Use for OTP / login / verify endpoints. Keys: phone, ip, or composite.
 *
 * NOTE: lives in process memory — won't share across multiple Node instances.
 * For multi-instance prod, swap the implementation for Upstash Redis but keep
 * the `hit()` signature.
 */

type Bucket = { count: number; resetAt: number }
const store = new Map<string, Bucket>()

// Periodic cleanup so the map doesn't grow forever
let lastSweep = 0
function maybeSweep() {
  const now = Date.now()
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of store) if (b.resetAt < now) store.delete(k)
}

export interface RateLimitResult {
  ok:        boolean
  remaining: number
  resetIn:   number // ms until reset
}

/**
 * @param key         Unique identifier (e.g. `otp:9876543210` or `login:1.2.3.4`)
 * @param limit       Max calls allowed within the window
 * @param windowMs    Window length in milliseconds
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  maybeSweep()
  const now = Date.now()
  const b = store.get(key)
  if (!b || b.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, resetIn: windowMs }
  }
  b.count += 1
  return {
    ok:        b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    resetIn:   b.resetAt - now,
  }
}

// Common preset: from a NextRequest, derive a best-effort client IP key
export function ipKey(req: Request, prefix: string): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  const ip  = fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return `${prefix}:${ip}`
}

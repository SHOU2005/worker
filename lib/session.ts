import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { getTokenFromCookies, JwtPayload } from './auth'

export type Role = 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN'

export interface ActiveSession {
  payload: JwtPayload
  user: {
    id:           string
    role:         Role
    isActive:     boolean
    tokenVersion: number
    captainProfile?: { status: 'PENDING' | 'ACTIVE' | 'INACTIVE' } | null
  }
}

/**
 * Decode the cookie + verify the user still exists, is active, is not soft-deleted,
 * has a fresh tokenVersion, and (if captain) is not INACTIVE. Use this in route handlers
 * that mutate state or touch money / PII.
 */
/** Reasons getSessionWithReason() can fail with — surfaced to the
 *  client so the UI shows the right message + recovery path. */
export type SessionFailureReason =
  | 'NOT_LOGGED_IN'        // no cookie at all
  | 'USER_NOT_FOUND'       // cookie userId no longer exists (hard-deleted)
  | 'ACCOUNT_SUSPENDED'    // isActive=false
  | 'ACCOUNT_DELETED'      // deletedAt set (soft delete)
  | 'TOKEN_INVALIDATED'    // tokenVersion mismatch (forced sign-out)
  | 'CAPTAIN_INACTIVE'     // captain profile.status=INACTIVE

export async function getSessionWithReason(): Promise<{ ok: ActiveSession } | { error: SessionFailureReason }> {
  const payload = getTokenFromCookies()
  if (!payload) return { error: 'NOT_LOGGED_IN' }

  // Tolerate the deletedAt column being absent — happens briefly on a fresh deploy
  // before `prisma migrate deploy` has run. Falls back to the pre-migration query.
  let user: { id: string; role: string; isActive: boolean; tokenVersion: number; deletedAt: Date | null; captainProfile: { status: 'PENDING'|'ACTIVE'|'INACTIVE' } | null } | null = null
  try {
    user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: {
        id: true, role: true, isActive: true, tokenVersion: true, deletedAt: true,
        captainProfile: { select: { status: true } },
      },
    }) as typeof user
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/deletedAt|column .* does not exist/i.test(msg)) {
      const fallback = await prisma.user.findUnique({
        where:  { id: payload.userId },
        select: {
          id: true, role: true, isActive: true, tokenVersion: true,
          captainProfile: { select: { status: true } },
        },
      })
      user = fallback ? { ...fallback, deletedAt: null } : null
    } else {
      throw err
    }
  }

  if (!user)         return { error: 'USER_NOT_FOUND' }
  if (user.deletedAt)return { error: 'ACCOUNT_DELETED' }
  if (!user.isActive)return { error: 'ACCOUNT_SUSPENDED' }
  if (typeof payload.v === 'number' && payload.v < (user.tokenVersion ?? 0)) return { error: 'TOKEN_INVALIDATED' }
  if (user.role === 'CAPTAIN' && user.captainProfile?.status === 'INACTIVE') return { error: 'CAPTAIN_INACTIVE' }

  return { ok: { payload, user: { id: user.id, role: user.role as Role, isActive: user.isActive, tokenVersion: user.tokenVersion, captainProfile: user.captainProfile } } }
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const r = await getSessionWithReason()
  return 'ok' in r ? r.ok : null
}

/**
 * Convenience: like getActiveSession() but returns a Response on failure so route
 * handlers can early-return:
 *
 *   const sess = await requireSession(['EMPLOYER'])
 *   if (sess instanceof NextResponse) return sess
 *   // sess.user, sess.payload available
 */
export async function requireSession(roles?: Role[]): Promise<ActiveSession | NextResponse> {
  const sess = await getActiveSession()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Check the JWT-claimed role (sess.payload.role) — this is the role the user
  // authenticated as for this app. The DB role (sess.user.role) is only their
  // primary role; multi-role users (e.g. WORKER who also has EmployerProfile)
  // carry the active role in the token.
  // ADMIN bypasses all role gates (founder/superuser).
  if (roles && sess.user.role !== 'ADMIN' && !roles.includes(sess.payload.role as Role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return sess
}

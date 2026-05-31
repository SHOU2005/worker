import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionWithReason } from '@/lib/session'
import { decryptPII } from '@/lib/crypto'

const MESSAGES_BY_REASON: Record<string, string> = {
  NOT_LOGGED_IN:     'Please log in to continue.',
  USER_NOT_FOUND:    'Your account no longer exists. Please sign up again.',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Contact support if this is unexpected.',
  ACCOUNT_DELETED:   'Your account was deleted. Sign up to create a new one.',
  TOKEN_INVALIDATED: 'Signed out elsewhere — please log in again.',
  CAPTAIN_INACTIVE:  'Captain account is inactive. Contact ops to reactivate.',
}

function isLikelyEncrypted(v: string): boolean {
  return v.length >= 40 && !v.includes('@') && /^[A-Za-z0-9+/=]+$/.test(v)
}
function readUpi(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!isLikelyEncrypted(stored)) return stored
  try { return decryptPII(stored) } catch { return null }
}

export async function GET() {
  try {
  // Discriminated session result so the client can show the right
  // message (suspended vs token-revoked vs not-logged-in) instead of a
  // generic 401 that always reads "Please log in".
  const sess = await getSessionWithReason()
  if ('error' in sess) {
    return NextResponse.json({
      error: MESSAGES_BY_REASON[sess.error] || 'Unauthorized',
      code:  sess.error,
    }, { status: 401 })
  }

  // Explicit select on every relation. Avoids reading columns that the schema
  // expects but the DB doesn't have yet (mid-migration / pre-migration deploys).
  // Add new columns here once their migration is confirmed live.
  const rawUser = await prisma.user.findUnique({
    where:  { id: sess.ok.payload.userId },
    select: {
      // We DO select the *Bytes columns just to know if they're populated,
      // but we never serialize the raw bytes to the client. They're
      // replaced with /api endpoint URLs below.
      id: true, name: true, phone: true, email: true, role: true,
      avatar: true, avatarBytes: true,
      isActive: true, tokenVersion: true, createdAt: true, updatedAt: true,
      captainReferralId: true,
      workerProfile: { select: {
        id: true, profilePhoto: true, profilePhotoBytes: true,
        aadhaarLast4: true, aadhaarVerified: true,
        videoVerified: true, skills: true, city: true, lat: true, lng: true,
        lastSeenAt: true, hourlyRate: true, rating: true, totalShifts: true,
        totalEarnings: true, isAvailable: true, bio: true, upiId: true,
        captainReferralId: true, kycStatus: true, milestoneLevel: true, contacts: true,
      }},
      employerProfile: { select: {
        id: true, ownerName: true, companyName: true, businessType: true, address: true,
        city: true, logo: true, logoBytes: true,
        lat: true, lng: true, gstNumber: true, totalShifts: true,
        rating: true, captainReferralId: true, verifiedByOpsAt: true,
      }},
      captainProfile: true,  // CaptainProfile has no new columns — safe with default include
      opsProfile:     true,  // same
    },
  })
  if (!rawUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Mask aadhaar; decrypt UPI for the worker themselves.
  const user = { ...rawUser } as typeof rawUser & { workerProfile: (typeof rawUser.workerProfile & { aadhaarNumber?: string | null }) | null }
  if (user.workerProfile) {
    const last4 = user.workerProfile.aadhaarLast4
    user.workerProfile.aadhaarNumber = last4 ? `XXXX-XXXX-${last4}` : null
    user.workerProfile.upiId = readUpi(user.workerProfile.upiId)
    // Worker selfie: prefer bytea endpoint URL when populated, else legacy
    // String column (data: URL or https URL from older deploys).
    if (user.workerProfile.profilePhotoBytes) {
      user.workerProfile.profilePhoto = `/api/worker/photo?v=${user.workerProfile.id.slice(-6)}`
    }
    delete (user.workerProfile as { profilePhotoBytes?: unknown }).profilePhotoBytes
  }
  // User.avatar (captain / employer / ops): same bytea-prefer pattern
  if (user.avatarBytes) {
    user.avatar = `/api/users/${user.id}/avatar?v=${user.id.slice(-6)}`
  }
  delete (user as { avatarBytes?: unknown }).avatarBytes
  // Employer logo
  if (user.employerProfile?.logoBytes) {
    user.employerProfile.logo = `/api/employers/${user.employerProfile.id}/logo?v=${user.employerProfile.id.slice(-6)}`
  }
  delete (user.employerProfile as { logoBytes?: unknown } | null)?.logoBytes

  return NextResponse.json({ user })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/auth/me] failed:', msg, err instanceof Error ? err.stack : '')
    const isDbDown = /reach|connect|ECONNREFUSED|ENOTFOUND|server.*not.*running|pgbouncer/i.test(msg)
    return NextResponse.json({
      error: isDbDown
        ? 'Database is unreachable. Check DATABASE_URL in Vercel env.'
        : `Server error: ${msg}`,
      code: isDbDown ? 'DB_UNREACHABLE' : 'AUTH_ME_FATAL',
    }, { status: 500 })
  }
}

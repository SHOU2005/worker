import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { COOKIE_CONFIG } from '@/lib/auth'

/**
 * User-initiated data deletion request (DPDP Act §12).
 *
 * What happens immediately:
 *  - User.isActive = false  (can't log in, doesn't appear in any feed)
 *  - User.tokenVersion is bumped (every existing JWT instantly invalidated)
 *  - All FCM tokens cleared (no more push notifications)
 *  - A DataDeletionRequest row is created — Ops handles hard-deletion within 30 days,
 *    preserving only booking/payment records that the GST + IT Acts require us to keep
 *    (8 years from creation per Privacy Policy §7).
 *
 * The cookie on this client is also cleared so the user is signed out immediately.
 */
export async function POST(req: NextRequest) {
  const sess = await requireSession()
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null

  const now = new Date()
  await prisma.$transaction([
    prisma.dataDeletionRequest.create({
      data: { userId: payload.userId, reason, status: 'PENDING' },
    }),
    prisma.user.update({
      where: { id: payload.userId },
      data:  {
        isActive:     false,
        deletedAt:    now,  // soft delete; 30-day grace, then cron purges
        tokenVersion: { increment: 1 },
        fcmTokens:    { set: [] },
        fcmToken:     null,
      },
    }),
    prisma.workerProfile.updateMany({
      where: { userId: payload.userId },
      data:  { deletedAt: now, locationSharingConsent: false, lat: null, lng: null },
    }),
    prisma.employerProfile.updateMany({
      where: { userId: payload.userId },
      data:  { deletedAt: now },
    }),
  ])

  const res = NextResponse.json({
    success: true,
    message: 'Your account has been suspended and is queued for deletion. We will complete the process within 30 days.',
  })
  res.cookies.set(COOKIE_CONFIG.name, '', { ...COOKIE_CONFIG.options, maxAge: 0 })
  return res
}

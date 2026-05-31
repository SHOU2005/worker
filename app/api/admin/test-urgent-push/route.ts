import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { broadcastUrgentJob } from '@/lib/fcm-server'

/**
 * Admin-only endpoint to fire a fake URGENT_JOB push so the urgent-ring
 * pipeline can be tested end-to-end without going through the full
 * employer-pay flow.
 *
 * Behaviour: builds the same payload broadcastUrgentJob() uses for a
 * real shift but with a fake shiftId. Workers' devices will ring +
 * land on /worker/dashboard?urgent=<fake-id> — the dashboard's urgent
 * card finds no matching shift and silently no-ops, which is fine for
 * a connectivity smoke test.
 *
 * Auth: ADMIN only. Posting from any logged-in admin browser hits it.
 *
 *   curl -X POST -b 'sw_auth=<jwt>' https://app.switchlocally.com/api/admin/test-urgent-push
 */
export async function POST() {
  const sess = await requireSession(['ADMIN'])
  if (sess instanceof NextResponse) return sess

  const fakeShiftId = `TEST-${Date.now().toString(36).toUpperCase()}`

  // Sanity-check at least one worker has an FCM token so the user
  // doesn't think the push silently failed when no device is registered.
  const targets = await prisma.user.count({
    where: { fcmTokens: { isEmpty: false } },
  })

  await broadcastUrgentJob(fakeShiftId, 'TEST Maid', 'Sector 14, Gurgaon', '₹400')

  return NextResponse.json({
    success: true,
    fakeShiftId,
    workersWithToken: targets,
    note: 'Workers with a registered FCM token should hear the urgent ring + land on /worker/dashboard?urgent=' + fakeShiftId,
  })
}

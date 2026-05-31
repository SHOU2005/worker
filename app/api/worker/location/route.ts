import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// Worker live-location ping. We always update lastSeenAt heartbeat.
// Location is stored if EITHER:
//   - Worker has opted in to general location sharing (locationSharingConsent), OR
//   - Worker has an active shift (CONFIRMED or IN_PROGRESS booking) — implicit
//     consent for the duration of that shift since employer needs to track them.
export async function POST(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { lat, lng } = await req.json().catch(() => ({}))
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const wp = await prisma.workerProfile.findUnique({
    where:  { userId: payload.userId },
    select: {
      id: true,
      locationSharingConsent: true,
      bookings: {
        where:  { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
        select: { id: true },
        take:   1,
      },
    },
  })
  if (!wp) return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })

  // Implicit consent for active shifts; explicit consent flag otherwise.
  const hasActiveShift = wp.bookings.length > 0
  const allowed = wp.locationSharingConsent || hasActiveShift

  await prisma.workerProfile.update({
    where: { userId: payload.userId },
    data:  allowed
      ? { lat, lng, lastSeenAt: new Date() }
      : { lastSeenAt: new Date() },
  })

  return NextResponse.json({
    success: true,
    locationStored: allowed,
    reason: allowed
      ? (hasActiveShift ? 'active-shift' : 'consent')
      : 'consent-off-no-active-shift',
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// Live-location feed for OPS dashboard.
// Workers appear if either:
//   - they have an active shift (CONFIRMED or IN_PROGRESS booking), OR
//   - they explicitly opted in to location sharing (locationSharingConsent=true).
// Captains always appear (tracking is part of the captain role contract).
// Soft-deleted users are excluded.
export async function GET() {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  const cutoff = new Date(Date.now() - 30 * 60 * 1000)

  try {
    const [workers, captains] = await Promise.all([
      prisma.workerProfile.findMany({
        where:  {
          deletedAt: null,
          lat:       { not: null },
          lng:       { not: null },
          OR: [
            { locationSharingConsent: true },
            { bookings: { some: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } } },
          ],
        },
        select: {
          id: true, lat: true, lng: true, lastSeenAt: true, city: true,
          user:     { select: { name: true, phone: true } },
          bookings: {
            where:   { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
            select:  { id: true, status: true, shift: { select: { id: true, title: true, address: true } } },
            take:    1,
          },
        },
      }),
      prisma.captainProfile.findMany({
        where:  { lat: { not: null }, lng: { not: null } },
        select: {
          id: true, lat: true, lng: true, lastSeenAt: true, territory: true, status: true,
          user: { select: { name: true, phone: true } },
        },
      }),
    ])

    const isOnline = (d: Date | null | undefined) => !!d && d >= cutoff

    return NextResponse.json({
      workers: workers.map(w => ({
        id: w.id, name: w.user.name, phone: w.user.phone, city: w.city,
        lat: w.lat, lng: w.lng, lastSeenAt: w.lastSeenAt,
        online: isOnline(w.lastSeenAt),
        activeShift: w.bookings[0] ? {
          bookingId: w.bookings[0].id,
          status:    w.bookings[0].status,
          title:     w.bookings[0].shift.title,
          address:   w.bookings[0].shift.address,
        } : null,
      })),
      captains: captains.map(c => ({
        id: c.id, name: c.user.name, phone: c.user.phone, territory: c.territory, status: c.status,
        lat: c.lat, lng: c.lng, lastSeenAt: c.lastSeenAt,
        online: isOnline(c.lastSeenAt),
      })),
    })
  } catch (err) {
    console.error('[ops/live-locations] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ workers: [], captains: [], error: err instanceof Error ? err.message : 'unknown' }, { status: 200 })
  }
}

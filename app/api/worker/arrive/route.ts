import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { pushToUser } from '@/lib/fcm-server'

// Generous radius — most OPS-posted shifts use a placeholder lat/lng (Gurgaon
// 19.076,72.877) until the worker arrives, so the geofence is informational
// only. We log distance but never block on it.
const GEOFENCE_RADIUS_METERS = 5_000

// Haversine distance — meters between two lat/lng points
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function POST(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const body = await req.json()
  const { bookingId, lat: clientLat, lng: clientLng } = body as {
    bookingId?: string; lat?: number; lng?: number
  }
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

  const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: payload.userId } })
  if (!workerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // findFirst (not findUnique) so we can match on both id + ownership in one query
  const booking = await prisma.booking.findFirst({
    where:   { id: bookingId, workerProfileId: workerProfile.id },
    include: { shift: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json({ error: `Booking not in valid state (${booking.status})` }, { status: 400 })
  }

  // Distance is logged for ops audit but does NOT block arrival. Most shifts
  // are posted with placeholder coordinates, so a strict gate would lock
  // workers out of legitimate jobs.
  const wLat = typeof clientLat === 'number' ? clientLat : workerProfile.lat
  const wLng = typeof clientLng === 'number' ? clientLng : workerProfile.lng
  const sLat = booking.shift.lat
  const sLng = booking.shift.lng
  if (wLat != null && wLng != null && sLat != null && sLng != null) {
    const d = distanceMeters(wLat, wLng, sLat, sLng)
    if (d > GEOFENCE_RADIUS_METERS) {
      console.warn(`[arrive] ${payload.userId} is ${Math.round(d)}m from shift ${booking.shiftId} — allowing anyway`)
    }
  }

  // Worker has an active shift (we just verified the booking exists and is
  // CONFIRMED/IN_PROGRESS). Implicit consent for tracking — store coords.
  if (typeof clientLat === 'number' && typeof clientLng === 'number') {
    await prisma.workerProfile.update({
      where: { id: workerProfile.id },
      data:  { lat: clientLat, lng: clientLng, lastSeenAt: new Date() },
    }).catch(() => {})
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data:  { checkInTime: new Date() },
    include: { shift: true },
  })

  pushToUser(booking.employerId, {
    title: `Worker has arrived — ${booking.shift.title}`,
    body:  'Generate an OTP from the job screen to start the shift',
    url:   `/employer/job/${booking.shiftId}`,
    data:  { type: 'WORKER_ARRIVED', shiftId: booking.shiftId },
  }).catch(console.error)

  return NextResponse.json({ booking: updated })
}

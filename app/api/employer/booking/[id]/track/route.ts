import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

// Haversine — meters between two lat/lng points
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ownership scope stays on employerId for EMPLOYER; staff bypass.
  const isStaff = payload.role === 'OPS' || payload.role === 'ADMIN'
  const booking = await prisma.booking.findUnique({
    where: isStaff
      ? { id: params.id }
      : { id: params.id, employerId: payload.userId },
    include: {
      shift:  { select: { id: true, title: true, address: true, lat: true, lng: true, startTime: true } },
      worker: {
        include: {
          user: { select: { name: true, phone: true, avatar: true } },
        },
      },
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const w = booking.worker
  const s = booking.shift
  if (!w || !s) return NextResponse.json({ error: 'Incomplete booking' }, { status: 400 })

  const workerLat = w.lat
  const workerLng = w.lng
  const dest      = (s.lat != null && s.lng != null) ? { lat: s.lat, lng: s.lng } : null

  let distanceM:    number | null = null
  let etaMinutes:   number | null = null
  if (workerLat != null && workerLng != null && dest) {
    distanceM = distanceMeters(workerLat, workerLng, dest.lat, dest.lng)
    // Average urban transit speed ~20 km/h = 333 m/min
    etaMinutes = Math.max(1, Math.round(distanceM / 333))
  }

  return NextResponse.json({
    bookingId:  booking.id,
    status:     booking.status,
    checkInTime: booking.checkInTime,
    worker: {
      name:    w.user.name,
      phone:   w.user.phone,
      avatar:  w.user.avatar ?? w.profilePhoto ?? null,
      lat:     workerLat,
      lng:     workerLng,
      lastSeenAt: w.lastSeenAt,
    },
    destination: dest ? { ...dest, address: s.address, title: s.title, startTime: s.startTime } : null,
    distanceM,
    etaMinutes,
  })
}

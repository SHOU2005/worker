import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hit, ipKey } from '@/lib/rate-limit'

// GET /api/worker/jyoti/jobs?category=<text>&limit=<n>
//
// Powers Jyoti's "aas paas koi accha kaam hai?" capability — she's no longer
// only an arrival concierge for the CURRENT shift, she can surface nearby OPEN
// jobs (optionally filtered by category) so the worker can find their next gig
// by voice. Kept deliberately compact: returns a SHORT ranked list because the
// result is read out loud by the agent.
//
// Ranking: urgent first, then nearest (if we know the worker's location and the
// shift has coords), else most recently posted. Mirrors the worker dashboard's
// own "shifts near you" ordering so voice + screen agree.

const DEFAULT_LIMIT = 5
const MAX_LIMIT     = 8

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371 // km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'WORKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRl = hit(`jyoti-jobs:${payload.userId}`, 60, 60 * 60 * 1000)
  if (!userRl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  const ipRl = hit(ipKey(req, 'jyoti-jobs-ip'), 200, 60 * 60 * 1000)
  if (!ipRl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const category = (searchParams.get('category') || '').trim()
  const limit    = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT))

  // Worker's home base — used to rank by distance and to bias toward their city.
  const profile = await prisma.workerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { city: true, lat: true, lng: true },
  })
  const here = profile?.lat != null && profile?.lng != null
    ? { lat: profile.lat, lng: profile.lng }
    : null

  // Pull a generous candidate set (open + paid only), then rank/trim in JS so we
  // can sort by computed distance without a PostGIS dependency. Category, when
  // given, matches either the role (e.g. "Cleaner") or the title text.
  const candidates = await prisma.shift.findMany({
    where: {
      status:        'OPEN',
      paymentStatus: 'PAID',
      ...(category
        ? {
            OR: [
              { role:  { contains: category, mode: 'insensitive' } },
              { title: { contains: category, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, title: true, role: true, city: true,
      lat: true, lng: true, hourlyRate: true, duration: true,
      paymentAmount: true, startTime: true, date: true, isUrgent: true,
      employer: { select: { companyName: true, user: { select: { name: true } } } },
    },
    orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
    take:    60,
  })

  const ranked = candidates
    .map((s) => {
      const distanceKm = here && s.lat != null && s.lng != null
        ? Math.round(haversineKm(here, { lat: s.lat, lng: s.lng }) * 10) / 10
        : null
      const pay = s.paymentAmount ?? Math.round((s.hourlyRate || 0) * (s.duration || 0))
      return {
        id:         s.id,
        title:      s.title,
        category:   s.role,
        place:      s.employer?.companyName || s.city,
        city:       s.city,
        pay,
        durationHr: s.duration,
        startTime:  s.startTime,
        date:       s.date,
        isUrgent:   s.isUrgent,
        distanceKm,
      }
    })
    .sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
      return 0
    })
    .slice(0, limit)

  return NextResponse.json({
    jobs:        ranked,
    count:       ranked.length,
    workerCity:  profile?.city || null,
    hasLocation: Boolean(here),
  })
}

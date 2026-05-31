import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { haversineDistance } from '@/lib/matching'


export async function GET(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'EMPLOYER' && payload.role !== 'ADMIN' && payload.role !== 'OPS')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const lat    = parseFloat(searchParams.get('lat')    || '0')
    const lng    = parseFloat(searchParams.get('lng')    || '0')
    const radius = parseFloat(searchParams.get('radius') || '10')
    // ?all=1 returns every worker with a known location, ignoring the
    // distance filter. Used by the employer-home map so it shows the
    // full Switch partner network, not just the 10km radius.
    const showAll = searchParams.get('all') === '1'

    // Show workers who EITHER opted in to live location OR have an active shift.
    // Active-shift workers can be seen by employers because they consented to
    // being tracked when they accepted the job.
    const workers = await prisma.workerProfile.findMany({
      where: {
        deletedAt:   null,
        isAvailable: true,
        lat: { not: null },
        lng: { not: null },
        OR: [
          { locationSharingConsent: true },
          { bookings: { some: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } } },
        ],
      },
      select: {
        id:          true,
        lat:         true,
        lng:         true,
        rating:      true,
        skills:      true,
        totalShifts: true,
        user: { select: { name: true } },
      },
      // 50 is plenty for the radius-filtered list; raise the cap when
      // the caller asked for the full network so we don't truncate.
      take: showAll ? 2000 : 50,
    })

    const filtered = showAll
      ? workers.filter(w => w.lat != null && w.lng != null)
      : workers.filter(w => {
          if (!w.lat || !w.lng) return false
          if (!lat || !lng) return true
          return haversineDistance(lat, lng, w.lat, w.lng) <= radius
        })

    return NextResponse.json({
      workers: filtered.slice(0, showAll ? 2000 : 20).map(w => ({
        id:          w.id,
        name:        w.user.name,
        lat:         w.lat,
        lng:         w.lng,
        rating:      w.rating,
        skills:      w.skills,
        totalShifts: w.totalShifts,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[nearby-workers] failed:', message, err instanceof Error ? err.stack : '')
    // Don't fail the map UI — return empty list and log so we can see what broke.
    return NextResponse.json({ workers: [], error: message }, { status: 200 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (payload.role === 'WORKER') {
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: payload.userId } })
    if (!workerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const rows = await prisma.booking.findMany({
      where:   { workerProfileId: workerProfile.id },
      include: {
        shift:   { include: { employer: { include: { user: { select: { name: true, phone: true, avatar: true } } } } } },
        ratings: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    const bookings = rows.map(b => ({
      ...b,
      // rating that THIS user (worker) gave — for UI "already rated" state
      rating: b.ratings.find(r => r.ratedById === payload.userId) ?? null,
    }))
    return NextResponse.json({ bookings })
  }

  if (payload.role === 'EMPLOYER') {
    const rows = await prisma.booking.findMany({
      where:   { employerId: payload.userId },
      include: {
        shift:   true,
        worker:  { include: { user: { select: { name: true, phone: true, avatar: true } } } },
        ratings: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    const bookings = rows.map(b => ({
      ...b,
      rating: b.ratings.find(r => r.ratedById === payload.userId) ?? null,
    }))
    return NextResponse.json({ bookings })
  }

  // Anything else (CAPTAIN, future roles) is treated as forbidden. The
  // default branch previously returned 100 bookings joined with worker
  // and employer PII, which would have leaked worker phones/names and
  // employer names to logged-in captains.
  if (payload.role !== 'OPS' && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookings = await prisma.booking.findMany({
    include: {
      shift:   true,
      worker:  { include: { user: { select: { name: true } } } },
      employer: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    100,
  })
  return NextResponse.json({ bookings })
}

// Direct booking creation is disabled. Production flow requires payment first:
//   employer  → POST /api/employer/cart/pay      (Razorpay order)
//             → POST /api/employer/cart/verify   (creates Shift + booking)
//   worker    → POST /api/shifts/[id]/accept     (atomic first-to-accept)
//   ops       → POST /api/ops/shifts/[id]/assign (manual)
// All three paths flow through lib/pricing.ts so worker take-home stays
// consistent at ₹100/hr. The POST handler that used to live here bypassed
// payment entirely (paymentStatus: 'PENDING') and was unreachable from the
// UI — leaving it in the API surface was a real attack vector.
export async function POST(_req: NextRequest) {
  return NextResponse.json({
    error:    'Direct booking creation is disabled. Use the cart → pay → verify flow.',
    code:     'PAYMENT_REQUIRED',
    payEndpoint:    '/api/employer/cart/pay',
    verifyEndpoint: '/api/employer/cart/verify',
  }, { status: 410 })
}

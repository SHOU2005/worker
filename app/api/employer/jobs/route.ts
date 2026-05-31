import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

async function getOrCreateEmployerProfile(userId: string) {
  return prisma.employerProfile.upsert({
    where:  { userId },
    create: { userId },
    update: {},
  })
}

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const employerProfile = await getOrCreateEmployerProfile(payload.userId)

  const jobs = await prisma.shift.findMany({
    where: { employerProfileId: employerProfile.id },
    include: {
      bookings: {
        include: {
          worker:  { include: { user: { select: { name: true, phone: true, avatar: true } } } },
          ratings: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  // For each booking, expose a singular `myRating` (the rating THIS employer gave) so the UI can show "Rate Worker" CTA
  const enriched = jobs.map(j => ({
    ...j,
    bookings: j.bookings.map(b => ({
      ...b,
      myRating: b.ratings.find(r => r.ratedById === payload.userId) ?? null,
    })),
  }))
  return NextResponse.json({ jobs: enriched })
}

// Direct shift creation is disabled — production flow requires payment first.
// Employers must POST to /api/employer/cart/pay -> Razorpay -> /api/employer/cart/verify.
export async function POST() {
  return NextResponse.json({
    error:          'Direct job creation is disabled. Complete payment first.',
    code:           'PAYMENT_REQUIRED',
    payEndpoint:    '/api/employer/cart/pay',
    verifyEndpoint: '/api/employer/cart/verify',
  }, { status: 402 })
}

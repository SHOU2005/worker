import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

// Bayesian-bias the displayed rating so a worker with one 1-star doesn't drop
// from 5.0 → 1.0. We seed the average with PRIOR_VOTES virtual ratings at
// PRIOR_MEAN; as real ratings accumulate they progressively dominate the
// prior. After ~20 real ratings the prior contributes <10% of the result.
//   posterior = (priorVotes * priorMean + sum(scores)) / (priorVotes + count)
const PRIOR_VOTES = 5     // seed weight
const PRIOR_MEAN  = 4.5   // marketplace-wide expected average

function bayesianAvg(sum: number, count: number): number {
  return (PRIOR_VOTES * PRIOR_MEAN + sum) / (PRIOR_VOTES + count)
}

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bookingId, score, comment } = await req.json()
  if (score < 1 || score > 5) {
    return NextResponse.json({ error: 'Score must be between 1 and 5' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: { worker: { include: { user: true } }, employer: true, shift: true },
  })
  if (!booking || booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Can only rate completed bookings' }, { status: 400 })
  }

  // Determine direction based on the rater's role
  let targetRole: 'WORKER' | 'EMPLOYER'
  let workerProfileId: string | null = null
  let targetUserId: string | null = null

  if (payload.role === 'EMPLOYER' && booking.employerId === payload.userId) {
    // Employer rates the worker
    targetRole      = 'WORKER'
    workerProfileId = booking.workerProfileId
    targetUserId    = booking.worker?.userId ?? null
  } else if (payload.role === 'WORKER' && booking.worker?.userId === payload.userId) {
    // Worker rates the employer
    targetRole   = 'EMPLOYER'
    targetUserId = booking.employerId
  } else {
    return NextResponse.json({ error: 'Not allowed to rate this booking' }, { status: 403 })
  }

  // Atomic: insert rating + recompute target's avg in one transaction.
  // The unique (bookingId, ratedById) catches double-submits.
  try {
    const rating = await prisma.$transaction(async tx => {
      const r = await tx.rating.create({
        data: {
          bookingId,
          ratedById:   payload.userId,
          targetRole,
          workerProfileId,
          targetUserId,
          score,
          comment,
        },
      })

      if (targetRole === 'WORKER' && workerProfileId) {
        const agg = await tx.rating.aggregate({
          where: { workerProfileId, targetRole: 'WORKER' },
          _sum:  { score: true },
          _count: { score: true },
        })
        const sum   = agg._sum.score   ?? 0
        const count = agg._count.score ?? 0
        await tx.workerProfile.update({
          where: { id: workerProfileId },
          data:  { rating: bayesianAvg(sum, count) },
        })
      } else if (targetRole === 'EMPLOYER' && targetUserId) {
        const agg = await tx.rating.aggregate({
          where: { targetUserId, targetRole: 'EMPLOYER' },
          _sum:  { score: true },
          _count: { score: true },
        })
        const sum   = agg._sum.score   ?? 0
        const count = agg._count.score ?? 0
        await tx.employerProfile.updateMany({
          where: { userId: targetUserId },
          data:  { rating: bayesianAvg(sum, count) },
        })
      }

      return r
    })

    return NextResponse.json({ rating }, { status: 201 })
  } catch (err: unknown) {
    // Prisma P2002 = unique constraint failure on (bookingId, ratedById)
    if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Already rated' }, { status: 409 })
    }
    console.error('[ratings] failed:', err)
    return NextResponse.json({ error: 'Could not save rating' }, { status: 500 })
  }
}

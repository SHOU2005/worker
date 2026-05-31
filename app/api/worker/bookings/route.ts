import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { notifyWorkerAccepted } from '@/lib/fcm-server'
import { workerEarning as calcWorkerEarning, platformFee as calcPlatformFee } from '@/lib/pricing'

// Worker's "Book this shift" button. This is the same as /api/shifts/:id/accept —
// first-to-accept atomic grab, payment must already be complete on the shift.
// Booking is created with status PENDING (worker still must confirm show-up).
export async function POST(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { shiftId } = await req.json()
  if (!shiftId) return NextResponse.json({ error: 'shiftId required' }, { status: 400 })

  const [shift, workerProfile] = await Promise.all([
    prisma.shift.findUnique({
      where:   { id: shiftId },
      include: { employer: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.workerProfile.findUnique({ where: { userId: payload.userId } }),
  ])

  if (!shift)         return NextResponse.json({ error: 'Shift not found' },          { status: 404 })
  if (!workerProfile) return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })
  if (shift.paymentStatus !== 'PAID') {
    return NextResponse.json({ error: 'This shift has not been paid by the employer yet' }, { status: 402 })
  }
  if (shift.status !== 'OPEN') {
    return NextResponse.json({ error: 'Shift already taken' }, { status: 409 })
  }

  const dup = await prisma.booking.findFirst({
    where: {
      shiftId,
      workerProfileId: workerProfile.id,
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
    },
  })
  if (dup) return NextResponse.json({ error: 'You have already accepted this shift' }, { status: 409 })

  const totalAmount   = Math.round(shift.hourlyRate * shift.duration)
  const workerEarning = calcWorkerEarning(shift.duration)
  const platformFee   = calcPlatformFee(shift.hourlyRate, shift.duration)

  // Multi-worker: stay OPEN until every slot is filled. Only the LAST accept
  // flips to ASSIGNED. Single-worker shifts behave as before.
  try {
    await prisma.$transaction(async tx => {
      const fresh = await tx.shift.findUnique({
        where: { id: shiftId },
        select: { status: true, workersNeeded: true, bookings: { where: { status: { in: ['PENDING','CONFIRMED','IN_PROGRESS'] } }, select: { id: true } } },
      })
      if (!fresh || fresh.status !== 'OPEN') throw new Error('SHIFT_NOT_OPEN')
      const willFill = fresh.bookings.length + 1 >= fresh.workersNeeded
      if (willFill) {
        const r = await tx.shift.updateMany({ where: { id: shiftId, status: 'OPEN' }, data: { status: 'ASSIGNED' } })
        if (r.count === 0) throw new Error('SHIFT_NOT_OPEN')
      }
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'SHIFT_NOT_OPEN') {
      return NextResponse.json({ error: 'Shift just taken by another worker' }, { status: 409 })
    }
    throw err
  }

  const booking = await prisma.booking.create({
    data: {
      shiftId,
      workerProfileId: workerProfile.id,
      employerId:      shift.employer.user.id,
      status:          'CONFIRMED',
      totalAmount,
      platformFee,
      workerEarning,
      paymentStatus:   'PAID',
      appliedAt:       new Date(),
    },
    include: {
      shift: {
        include: { employer: { include: { user: { select: { name: true, phone: true, avatar: true } } } } },
      },
      worker: { include: { user: { select: { name: true, phone: true, avatar: true } } } },
    },
  })

  notifyWorkerAccepted(
    shift.employer.user.id,
    booking.worker.user.name,
    shift.title,
    shift.id,
  ).catch(console.error)

  return NextResponse.json({ booking }, { status: 201 })
}

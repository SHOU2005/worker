import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { notifyWorkerAccepted } from '@/lib/fcm-server'
import { workerEarning as calcWorkerEarning, platformFee as calcPlatformFee } from '@/lib/pricing'

// Worker slides to accept a shift. First-to-accept wins (atomic via shift.status check).
// Booking is created with status=PENDING (worker still has to confirm show-up).
// Shift transitions OPEN -> ASSIGNED so no other worker can grab it.
// Once worker calls /confirm, booking becomes CONFIRMED.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  // Every worker can accept jobs — KYC status is NOT a gate. Workers can
  // submit Aadhaar voluntarily via /worker/kyc, but it does not affect their
  // ability to swipe-accept shifts.
  const workerProfile = await prisma.workerProfile.findUnique({
    where: { userId: payload.userId },
  })
  if (!workerProfile) {
    return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })
  }

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: { employer: { select: { userId: true } } },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Shift cancelled' }, { status: 410 })
  }
  if (shift.paymentStatus !== 'PAID') {
    return NextResponse.json({ error: 'This shift is not yet paid by the employer' }, { status: 402 })
  }
  if (shift.status !== 'OPEN') {
    return NextResponse.json({ error: 'Shift already taken' }, { status: 409 })
  }

  // Don't double-book the same worker
  const dup = await prisma.booking.findFirst({
    where: {
      shiftId:         params.id,
      workerProfileId: workerProfile.id,
      status:          { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
    },
  })
  if (dup) {
    return NextResponse.json({ error: 'You have already accepted this shift' }, { status: 409 })
  }

  // Worker take-home is a flat ₹100/hr (see lib/pricing.ts). Platform takes
  // whatever the employer pays beyond that.
  const totalAmount   = Math.round(shift.hourlyRate * shift.duration)
  const workerEarning = calcWorkerEarning(shift.duration)
  const platformFee   = calcPlatformFee(shift.hourlyRate, shift.duration)

  // Multi-worker shifts stay OPEN until every slot is filled — only the LAST
  // accepting worker flips status to ASSIGNED. Single-worker shifts behave as
  // before. We re-check inside a transaction so the count is consistent with
  // the slot decision.
  try {
    await prisma.$transaction(async tx => {
      const fresh = await tx.shift.findUnique({
        where: { id: params.id },
        select: { status: true, workersNeeded: true, bookings: { where: { status: { in: ['PENDING','CONFIRMED','IN_PROGRESS'] } }, select: { id: true } } },
      })
      if (!fresh || fresh.status !== 'OPEN') {
        throw new Error('SHIFT_NOT_OPEN')
      }
      // After this booking, total active = current + 1
      const willFill = fresh.bookings.length + 1 >= fresh.workersNeeded
      if (willFill) {
        const r = await tx.shift.updateMany({ where: { id: params.id, status: 'OPEN' }, data: { status: 'ASSIGNED' } })
        if (r.count === 0) throw new Error('SHIFT_NOT_OPEN')
      }
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'SHIFT_NOT_OPEN') {
      return NextResponse.json({ error: 'Shift just taken by another worker' }, { status: 409 })
    }
    throw err
  }

  // Status CONFIRMED — worker is locked in. The slide-to-arrive + OTP flow
  // later transitions to IN_PROGRESS when the worker actually starts work.
  const booking = await prisma.booking.create({
    data: {
      shiftId:         params.id,
      workerProfileId: workerProfile.id,
      employerId:      shift.employer.userId,
      status:          'CONFIRMED',
      totalAmount,
      platformFee,
      workerEarning,
      paymentStatus:   'PAID',  // employer already paid up-front; this is just bookkeeping
      appliedAt:       new Date(),
    },
    include: {
      shift: {
        include: { employer: { include: { user: { select: { name: true, phone: true, avatar: true } } } } },
      },
      worker: { include: { user: { select: { name: true, phone: true, avatar: true } } } },
    },
  })

  // Notify employer that a worker accepted
  notifyWorkerAccepted(
    shift.employer.userId,
    booking.worker.user.name,
    shift.title,
    shift.id,
  ).catch(console.error)

  return NextResponse.json({ booking, shift: booking.shift }, { status: 201 })
}

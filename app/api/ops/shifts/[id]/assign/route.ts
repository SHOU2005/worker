import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { workerEarning as calcWorkerEarning, platformFee as calcPlatformFee } from '@/lib/pricing'
import { notifyWorkerAccepted } from '@/lib/fcm-server'

export const dynamic = 'force-dynamic'

// OPS-driven manual assignment. Lets the ops console attach a specific worker
// to a shift without going through the worker swipe-accept flow — used when
// ops are coordinating offline (phone calls, walk-ins). Mirrors the booking
// shape produced by /api/shifts/[id]/accept so downstream code (invoicing,
// OTP, completion) treats it identically.
//
// Body: { phone: string, startTime?: "HH:MM" }
//   - phone:     10-digit worker mobile (the worker must already exist as a
//                User with role=WORKER and a WorkerProfile row).
//   - startTime: optional override of shift.startTime (e.g. "13:00").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  let body: { phone?: string; startTime?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const phone = String(body.phone || '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) {
    return NextResponse.json({ error: 'phone must be a 10-digit Indian mobile number' }, { status: 400 })
  }

  // startTime override is optional — must look like HH:MM if provided.
  let startTimeOverride: string | undefined
  if (body.startTime != null) {
    const s = String(body.startTime).trim()
    if (!/^\d{1,2}:\d{2}$/.test(s)) {
      return NextResponse.json({ error: 'startTime must be HH:MM (e.g. "13:00")' }, { status: 400 })
    }
    const [hh, mm] = s.split(':').map(n => parseInt(n, 10))
    if (hh > 23 || mm > 59) {
      return NextResponse.json({ error: 'startTime out of range' }, { status: 400 })
    }
    startTimeOverride = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  const worker = await prisma.user.findFirst({
    where:   { phone },
    include: { workerProfile: true },
  })
  if (!worker || worker.role !== 'WORKER' || !worker.workerProfile) {
    return NextResponse.json({ error: `No worker with phone +91 ${phone}` }, { status: 404 })
  }

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: { employer: { select: { userId: true } } },
  })
  if (!shift)                            return NextResponse.json({ error: 'Shift not found' },               { status: 404 })
  if (shift.status === 'CANCELLED')      return NextResponse.json({ error: 'Shift cancelled' },                { status: 410 })
  if (shift.status === 'COMPLETED')      return NextResponse.json({ error: 'Shift already completed' },        { status: 409 })

  // Don't double-book the same worker on the same shift
  const dup = await prisma.booking.findFirst({
    where: {
      shiftId:         params.id,
      workerProfileId: worker.workerProfile.id,
      status:          { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
    },
  })
  if (dup) return NextResponse.json({ error: 'This worker is already booked on this shift' }, { status: 409 })

  const totalAmount   = Math.round(shift.hourlyRate * shift.duration)
  const workerEarning = calcWorkerEarning(shift.duration)
  const platformFee   = calcPlatformFee(shift.hourlyRate, shift.duration)

  // Atomic: optionally update shift.startTime, then count active bookings to
  // decide whether this assignment fills the last slot (flip OPEN -> ASSIGNED).
  const booking = await prisma.$transaction(async tx => {
    if (startTimeOverride) {
      await tx.shift.update({ where: { id: params.id }, data: { startTime: startTimeOverride } })
    }

    const fresh = await tx.shift.findUnique({
      where:  { id: params.id },
      select: {
        status: true, workersNeeded: true,
        bookings: { where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } }, select: { id: true } },
      },
    })
    if (!fresh) throw new Error('SHIFT_VANISHED')
    if (fresh.bookings.length >= fresh.workersNeeded) throw new Error('SHIFT_FULL')

    const willFill = fresh.bookings.length + 1 >= fresh.workersNeeded
    if (willFill && fresh.status === 'OPEN') {
      await tx.shift.update({ where: { id: params.id }, data: { status: 'ASSIGNED' } })
    }

    return tx.booking.create({
      data: {
        shiftId:         params.id,
        workerProfileId: worker.workerProfile!.id,
        employerId:      shift.employer.userId,
        status:          'CONFIRMED',
        totalAmount,
        platformFee,
        workerEarning,
        paymentStatus:   'PAID',
        appliedAt:       new Date(),
      },
      include: {
        shift:  true,
        worker: { include: { user: { select: { name: true, phone: true } } } },
      },
    })
  }).catch(err => {
    if (err instanceof Error && (err.message === 'SHIFT_FULL' || err.message === 'SHIFT_VANISHED')) {
      return { __error: err.message } as const
    }
    throw err
  })

  if ('__error' in booking) {
    const code = booking.__error
    return NextResponse.json(
      { error: code === 'SHIFT_FULL' ? 'Shift already filled to capacity' : 'Shift not found' },
      { status: code === 'SHIFT_FULL' ? 409 : 404 },
    )
  }

  notifyWorkerAccepted(
    shift.employer.userId,
    booking.worker.user.name,
    shift.title,
    shift.id,
  ).catch(console.error)

  return NextResponse.json({ booking, startTime: startTimeOverride ?? shift.startTime }, { status: 201 })
}

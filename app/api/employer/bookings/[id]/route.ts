import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { notifyJobStarted } from '@/lib/fcm-server'

// Employer confirms a worker application and triggers payment
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const booking = await prisma.booking.findUnique({
    where:   { id: params.id, employerId: payload.userId },
    include: { shift: true, worker: { include: { user: { select: { name: true } } } } },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'PENDING') {
    return NextResponse.json({ error: 'Booking already processed' }, { status: 400 })
  }

  // Payment must be completed before a booking can be confirmed
  if (booking.paymentStatus !== 'PAID') {
    return NextResponse.json({
      error: 'Payment required',
      code:  'PAYMENT_REQUIRED',
      payUrl: `/employer/job/${booking.shiftId}/payment`,
    }, { status: 402 })
  }

  // Only auto-reject the other PENDING applications once the shift is
  // fully staffed. Previous behaviour cancelled every other applicant on
  // the first confirmation regardless of workersNeeded, which made
  // multi-worker shifts impossible to fully staff: confirming applicant
  // #1 on a 5-worker shift killed the other four valid applications.
  const confirmedCount = await prisma.booking.count({
    where: { shiftId: booking.shiftId, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
  })
  const willFill = confirmedCount + 1 >= booking.shift.workersNeeded

  if (willFill) {
    await prisma.booking.updateMany({
      where: { shiftId: booking.shiftId, status: 'PENDING', id: { not: params.id } },
      data:  { status: 'CANCELLED' },
    })
  }

  // Confirm this booking and update shift
  const updated = await prisma.booking.update({
    where: { id: params.id },
    data:  { status: 'CONFIRMED' },
    include: { shift: true, worker: { include: { user: true } } },
  })

  // Only flip the shift to ASSIGNED when the last slot was just filled.
  // Otherwise leave it OPEN/SEARCHING so other workers can keep applying.
  if (willFill) {
    await prisma.shift.update({
      where: { id: booking.shiftId },
      data:  { status: 'ASSIGNED' },
    })
  }

  notifyJobStarted(booking.worker.userId, booking.shift.title, booking.shiftId).catch(console.error)

  return NextResponse.json({ booking: updated })
}

// Reject a pending application — used by the workers tab so the "Reject"
// button actually does something on the server (it was previously hiding
// the row only locally; refreshing the page made it reappear).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const booking = await prisma.booking.findUnique({
    where: { id: params.id, employerId: payload.userId },
    select: { id: true, status: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  // Only reject applications that haven't been accepted yet — once the shift
  // is paid/confirmed, the cancel/refund flow is handled elsewhere.
  if (booking.status !== 'PENDING') {
    return NextResponse.json({ error: 'Only pending applications can be rejected here' }, { status: 400 })
  }

  await prisma.booking.update({
    where: { id: params.id },
    data:  { status: 'CANCELLED' },
  })

  return NextResponse.json({ success: true })
}

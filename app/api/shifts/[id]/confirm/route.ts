import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { pushToUser } from '@/lib/fcm-server'

// After a worker accepts (booking PENDING + shift ASSIGNED), they tap "Confirm I will show up".
// Booking PENDING -> CONFIRMED. Employer is notified. Worker now sees the employer's full
// contact details, and the employer sees the worker's full contact details.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const workerProfile = await prisma.workerProfile.findUnique({
    where: { userId: payload.userId },
  })
  if (!workerProfile) {
    return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })
  }

  // Find this worker's active booking on the shift. /api/shifts/[id]/accept
  // now creates the booking as CONFIRMED directly (first-to-accept-wins flow,
  // no separate hold step), so /confirm has to be idempotent — if the
  // booking is already CONFIRMED we return success without re-writing.
  // Anything in PENDING also transitions to CONFIRMED for backward compat.
  const booking = await prisma.booking.findFirst({
    where: {
      shiftId:         params.id,
      workerProfileId: workerProfile.id,
      status:          { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      shift:  { include: { employer: { include: { user: { select: { name: true, phone: true } } } } } },
      worker: { include: { user: { select: { name: true, phone: true } } } },
    },
  })
  if (!booking) {
    return NextResponse.json({ error: 'No active booking found for this shift' }, { status: 404 })
  }

  // If already CONFIRMED there's nothing to update — just echo back the
  // booking (same shape downstream code expects). Skip the employer push too
  // so we don't re-notify on a button re-tap.
  if (booking.status === 'CONFIRMED') {
    return NextResponse.json({ booking })
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data:  { status: 'CONFIRMED' },
    include: {
      shift: { include: { employer: { include: { user: { select: { name: true, phone: true, avatar: true } } } } } },
      worker: { include: { user: { select: { name: true, phone: true, avatar: true } } } },
    },
  })

  // Notify employer that the worker has confirmed they will show up
  pushToUser(booking.shift.employer.userId, {
    title: `${booking.worker.user.name} confirmed your job`,
    body:  `${booking.shift.title} · The worker is on their way`,
    url:   `/employer/job/${booking.shiftId}`,
    data:  { type: 'WORKER_CONFIRMED', jobId: booking.shiftId, bookingId: booking.id },
  }).catch(console.error)

  return NextResponse.json({ booking: updated })
}

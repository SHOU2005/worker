import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { pushToUser } from '@/lib/fcm-server'

// Reschedule an existing PAID shift to a new date/time. Friendlier than
// cancel-refund — payment + bookings stay intact, only the schedule shifts.
//
// Allowed while the shift is OPEN (no worker accepted yet). For ASSIGNED+
// shifts the employer can't reschedule unilaterally because the worker has
// already committed to the original slot; route those through ops or a
// future reschedule-with-worker-consent flow.
//
// Body: { date: "YYYY-MM-DD", startTime: "HH:MM", endTime?: "HH:MM" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['EMPLOYER', 'OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { date, startTime, endTime } = await req.json() as {
    date?: string; startTime?: string; endTime?: string
  }
  if (!date || !startTime) {
    return NextResponse.json({ error: 'date and startTime are required' }, { status: 400 })
  }
  // Crude validation — the post-job form constrains these client-side, but
  // defend against direct API hits.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: 'Invalid date or time format' }, { status: 400 })
  }
  const newDate = new Date(`${date}T${startTime}:00`)
  if (isNaN(newDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date/time' }, { status: 400 })
  }
  if (newDate.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: 'New shift time must be in the future' }, { status: 400 })
  }

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: {
      employer: { select: { userId: true } },
      bookings: { include: { worker: { select: { userId: true } } } },
    },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  if (payload.role === 'EMPLOYER' && shift.employer.userId !== payload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Block reschedule once a worker has committed. Ops can override.
  const hasActiveBooking = shift.bookings.some(b => !['CANCELLED'].includes(b.status))
  if (hasActiveBooking && payload.role === 'EMPLOYER') {
    return NextResponse.json({
      error: 'A worker has already accepted — cannot reschedule unilaterally',
      code:  'WORKER_ALREADY_ACCEPTED',
    }, { status: 409 })
  }

  if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(shift.status)) {
    return NextResponse.json({
      error: `Shift cannot be rescheduled (status=${shift.status})`,
      code:  'SHIFT_NOT_RESCHEDULABLE',
    }, { status: 409 })
  }

  // Recompute duration when the start/end window changes. Previously we
  // updated only `endTime`, leaving `shift.duration` stuck at the old
  // value — so a 4h shift rescheduled to a 6h window kept duration=4 and
  // the worker was paid/billed for 4h while actually working 6h.
  const effectiveEnd = endTime || shift.endTime
  function parseHm(s: string): number | null {
    const m = /^(\d{2}):(\d{2})$/.exec(s)
    if (!m) return null
    const h = parseInt(m[1], 10), mm = parseInt(m[2], 10)
    if (h > 23 || mm > 59) return null
    return h * 60 + mm
  }
  let newDuration = shift.duration
  if (effectiveEnd) {
    const startMin = parseHm(startTime)
    const endMin   = parseHm(effectiveEnd)
    if (startMin != null && endMin != null) {
      // Same-day window only — if end <= start treat as next-day (e.g.
      // 22:00→06:00 = 8h). Matches the post-job form's behaviour.
      const diff = endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin
      const hrs  = Math.max(1, Math.round(diff / 60))
      newDuration = hrs
    }
  }

  const updated = await prisma.shift.update({
    where: { id: params.id },
    data:  {
      date:      newDate,
      startTime,
      endTime:   effectiveEnd,
      duration:  newDuration,
    },
  })

  // If any worker had accepted/confirmed before we blocked above (race), or
  // OPS is rescheduling on an ASSIGNED shift, notify them so they aren't
  // surprised. Safe no-op for the common OPEN-shift path.
  for (const b of shift.bookings) {
    if (b.worker?.userId) {
      pushToUser(b.worker.userId, {
        title: `Shift rescheduled — ${updated.title}`,
        body:  `New time: ${date} · ${startTime}`,
        data:  { type: 'SHIFT_RESCHEDULED', shiftId: params.id, bookingId: b.id },
      }).catch(console.error)
    }
  }

  return NextResponse.json({ ok: true, shift: updated })
}

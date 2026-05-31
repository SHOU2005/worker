import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { notifyJobStarted, notifyJobCompleted } from '@/lib/fcm-server'
import { applyBookingCompletedEffects, notifyCaptainAboutCommission } from '@/lib/booking-lifecycle'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  // Allow EMPLOYER (owner check below), plus OPS/ADMIN for back-office.
  // Founders promoted to ADMIN used to 401 on their own employer flows
  // because this route strict-checked role === 'EMPLOYER'.
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const job = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: {
      employer: { select: { userId: true } },
      bookings: {
        // ratings included so the page can determine "already rated"
        // without a follow-up query; the modal-relop bug came from this
        // field being missing.
        include: {
          worker:  { include: { user: { select: { name: true, phone: true, avatar: true } } } },
          ratings: true,
        },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ownership check for non-staff: only the employer who posted the job
  // can see its details. OPS/ADMIN bypass.
  if (payload.role === 'EMPLOYER' && job.employer.userId !== payload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Strip the inner relation we only loaded for the ownership check.
  const { employer: _, ...safe } = job
  // Surface the session user id so the client can match against
  // ratings[].ratedById without trying to derive it from job.employerId
  // (which doesn't exist on Shift — only employerProfileId).
  return NextResponse.json({ job: safe, sessionUserId: payload.userId })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { status } = await req.json()
  // Whitelist matches the ShiftStatus enum in prisma/schema.prisma. The prior
  // list included 'ON_THE_WAY' / 'ARRIVED' / 'STARTED' which are NOT valid
  // ShiftStatus values — Prisma would reject them at write time but only
  // after we'd already done the auth/ownership round-trip. Filter at the
  // edge so callers get a clean 400 instead of a 500 enum error.
  const validStatuses = ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
  if (!(validStatuses as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  // Ownership check via employer relation. OPS/ADMIN bypass — staff need
  // to be able to flip status during incident response.
  const owned = await prisma.shift.findUnique({
    where:  { id: params.id },
    select: { employer: { select: { userId: true } } },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (payload.role === 'EMPLOYER' && owned.employer.userId !== payload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // For COMPLETED transitions, atomically: flip shift status, flip every active
  // booking on the shift, and apply each booking's COMPLETED side effects (worker
  // stats + captain commissions). Single transaction so partial failures roll back.
  let job
  let captainNotifications: string[] = []

  if (status === 'COMPLETED') {
    // Collect captain ids inside the txn but only treat them as
    // "fireable" once the transaction commits. Previously the array was
    // mutated as iterations ran; if a later iteration threw and aborted
    // the whole txn, the push side-effects still fired for the earlier
    // (rolled-back) commissions — captains got notified about money that
    // didn't persist.
    const txResult = await prisma.$transaction(async tx => {
      const localFired: string[] = []
      const shift = await tx.shift.update({
        where: { id: params.id },
        data:  { status },
        include: { bookings: { include: { worker: { include: { user: true } } } } },
      })
      const activeBookings = shift.bookings.filter(b => ['CONFIRMED', 'IN_PROGRESS'].includes(b.status))
      for (const b of activeBookings) {
        await tx.booking.update({
          where: { id: b.id },
          data:  { status: 'COMPLETED', checkOutTime: new Date() },
        })
        const r = await applyBookingCompletedEffects(b.id, tx)
        if (r.commissionFiredFor) localFired.push(r.commissionFiredFor)
      }
      return { shift, fired: localFired }
    })
    job = txResult.shift
    captainNotifications = txResult.fired

    // Push notifications outside the transaction
    for (const b of (job.bookings ?? []).filter(b => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status))) {
      const wuid = b.worker?.userId
      if (wuid) notifyJobCompleted(wuid, b.workerEarning ?? 0, job.title).catch(console.error)
    }
    for (const cid of captainNotifications) {
      notifyCaptainAboutCommission(cid).catch(console.error)
    }
  } else {
    // Don't `take: 1` — we need every active booking to flip to IN_PROGRESS
    // and notify each worker. The previous version silently ignored extras
    // when a shift had multiple workers.
    job = await prisma.shift.update({
      where: { id: params.id },
      data:  { status },
      include: { bookings: { include: { worker: { include: { user: true } } } } },
    })

    if (status === 'IN_PROGRESS') {
      const updatable = job.bookings.filter(b => b.status === 'CONFIRMED')
      if (updatable.length > 0) {
        await prisma.booking.updateMany({
          where: { shiftId: params.id, status: 'CONFIRMED' },
          data:  { status: 'IN_PROGRESS', checkInTime: new Date() },
        })
        for (const b of updatable) {
          if (b.worker?.userId) {
            notifyJobStarted(b.worker.userId, job.title, params.id).catch(console.error)
          }
        }
      }
    }
  }

  return NextResponse.json({ job })
}

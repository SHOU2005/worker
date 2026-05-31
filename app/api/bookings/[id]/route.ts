import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { applyBookingCompletedEffects, notifyCaptainAboutCommission } from '@/lib/booking-lifecycle'
import { pushToUser } from '@/lib/fcm-server'

// Returns a single booking with shift + employer details so the new
// /worker/active/[bookingId] full-screen page can hydrate without going
// through the bulk worker bookings list. Authorized for the assigned
// worker, the booking's employer, and OPS/ADMIN. Selfie bytes are NOT
// included here — they're served separately so this payload stays small.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const booking = await prisma.booking.findUnique({
    where:   { id: params.id },
    include: {
      shift:  { include: { employer: { include: { user: { select: { name: true, phone: true, avatar: true } } } } } },
      worker: { include: { user: { select: { id: true, name: true, phone: true, avatar: true } } } },
      payment: true,
      ratings: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isEmployer = payload.role === 'EMPLOYER' && booking.employerId === payload.userId
  const isWorker   = payload.role === 'WORKER'   && booking.worker.userId === payload.userId
  const isStaff    = payload.role === 'OPS' || payload.role === 'ADMIN'
  if (!isEmployer && !isWorker && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Strip selfie bytes from the payload — too big to ship every request and
  // there's a dedicated bytes endpoint for that. Keep the timestamp/mime so
  // the UI can decide whether to render the selfie tile.
  const { arrivalSelfie: _ignore, ...rest } = booking as unknown as { arrivalSelfie?: Buffer }
  void _ignore
  return NextResponse.json({ booking: rest })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status, cancelReason } = await req.json() as { status: string; cancelReason?: string }

  const booking = await prisma.booking.findUnique({
    where:   { id: params.id },
    include: { worker: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Ownership check: only the booking's employer, the assigned worker, OPS, or ADMIN can mutate.
  const isOwnerEmployer = payload.role === 'EMPLOYER' && booking.employerId === payload.userId
  const isOwnerWorker   = payload.role === 'WORKER'   && booking.worker.userId === payload.userId
  const isStaff         = payload.role === 'OPS' || payload.role === 'ADMIN'
  if (!isOwnerEmployer && !isOwnerWorker && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Whitelist must match prisma BookingStatus exactly. NO_SHOW was listed
  // for years but isn't in the enum — any caller that passed it would be
  // accepted by this gate and then crash inside prisma.update with an
  // opaque enum-violation 500. Worker/ops "no-show" cases are recorded
  // by transitioning to CANCELLED with checkOutTime null.
  const allowedTransitions: Record<string, string[]> = {
    EMPLOYER: ['CONFIRMED', 'CANCELLED'],
    WORKER:   ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    ADMIN:    ['CONFIRMED', 'CANCELLED', 'COMPLETED'],
    OPS:      ['CONFIRMED', 'CANCELLED', 'COMPLETED'],
  }
  if (!allowedTransitions[payload.role]?.includes(status)) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = { status }
  if (status === 'IN_PROGRESS') updateData.checkInTime  = new Date()
  if (status === 'COMPLETED')   updateData.checkOutTime = new Date()
  if (status === 'CANCELLED') {
    updateData.cancelledAt = new Date()
    // Persist the worker's stated reason from the cancel-reason picker. Cap
    // at 500 chars defensively — the picker only sends a short label plus
    // optional freetext, but the column is unbounded TEXT.
    if (typeof cancelReason === 'string' && cancelReason.trim()) {
      updateData.cancelReason = cancelReason.trim().slice(0, 500)
    }
  }

  const wasAlreadyCompleted   = booking.status === 'COMPLETED'
  const wasAlreadyInProgress  = booking.status === 'IN_PROGRESS'
  const wasAlreadyCancelled   = booking.status === 'CANCELLED'

  const { updated, commissionFiredFor } = await prisma.$transaction(async tx => {
    const upd = await tx.booking.update({
      where:   { id: params.id },
      data:    updateData,
      include: {
        shift:  true,
        worker: { include: { user: { select: { name: true, phone: true } } } },
      },
    })

    let commissionFiredFor: string | undefined
    if (status === 'COMPLETED' && !wasAlreadyCompleted) {
      const r = await applyBookingCompletedEffects(params.id, tx)
      commissionFiredFor = r.commissionFiredFor
    }
    return { updated: upd, commissionFiredFor }
  })

  if (commissionFiredFor) {
    notifyCaptainAboutCommission(commissionFiredFor).catch(console.error)
  }

  // Employer notifications for every booking status change initiated by
  // the worker (or staff). The employer's app needs to know in real time
  // when the worker arrives, finishes, or cancels — without this they'd
  // have no way to track progress until they manually refresh.
  const workerName  = updated.worker?.user?.name || 'Your worker'
  const shiftTitle  = updated.shift?.title || 'your booking'
  const jobUrl      = `/employer/job/${updated.shiftId}`

  if (status === 'IN_PROGRESS' && !wasAlreadyInProgress) {
    pushToUser(updated.employerId, {
      title: `${workerName} checked in`,
      body:  `${shiftTitle} · The worker has arrived and started`,
      url:   jobUrl,
      data:  { type: 'WORKER_CHECKED_IN', jobId: updated.shiftId, bookingId: updated.id },
    }).catch(console.error)
  }
  if (status === 'COMPLETED' && !wasAlreadyCompleted) {
    pushToUser(updated.employerId, {
      title: `${workerName} finished the shift`,
      body:  `${shiftTitle} · Tap to rate the worker`,
      url:   jobUrl,
      data:  { type: 'WORKER_COMPLETED', jobId: updated.shiftId, bookingId: updated.id },
    }).catch(console.error)
  }
  if (status === 'CANCELLED' && !wasAlreadyCancelled && payload.role === 'WORKER') {
    pushToUser(updated.employerId, {
      title: `${workerName} cancelled`,
      body:  `${shiftTitle} · We're finding a replacement`,
      url:   jobUrl,
      data:  { type: 'WORKER_CANCELLED', jobId: updated.shiftId, bookingId: updated.id },
    }).catch(console.error)
  }

  return NextResponse.json({ booking: updated })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Razorpay from 'razorpay'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))
const razorpay = RZP_CONFIGURED ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! }) : null

// Employer-initiated cancel + full refund. Per product spec, only allowed
// while the shift is still OPEN and no worker has accepted (no active
// bookings). Once a worker is locked in, cancellation has to go through
// ops dashboard instead — keeps the worker's commitment in the system.
//
// Body: { reason?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['EMPLOYER', 'OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { reason } = await req.json().catch(() => ({})) as { reason?: string }

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: { employer: { select: { userId: true } }, bookings: true },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  if (payload.role === 'EMPLOYER' && shift.employer.userId !== payload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (shift.status !== 'OPEN') {
    return NextResponse.json({
      error: 'Shift can only be cancelled with refund before a worker is assigned',
      code:  'SHIFT_NOT_OPEN',
      status: shift.status,
    }, { status: 409 })
  }

  // Only block self-cancel/refund when a worker is *committed* to the
  // shift. PENDING applications are just open offers — the money is
  // still unallocated, so the employer should be able to cancel and
  // refund without bouncing through the ops queue. We'll auto-cancel
  // those PENDING applications below as part of the shift teardown.
  const committedBookings = shift.bookings.filter(b => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status))
  if (committedBookings.length > 0) {
    return NextResponse.json({
      error: 'A worker has already accepted — cancellation requires ops review',
      code:  'WORKER_ALREADY_ACCEPTED',
    }, { status: 409 })
  }
  // Sweep any open PENDING applications closed so they don't dangle.
  const pendingBookings = shift.bookings.filter(b => b.status === 'PENDING')
  if (pendingBookings.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: pendingBookings.map(b => b.id) } },
      data:  { status: 'CANCELLED' },
    })
  }

  if (shift.paymentStatus !== 'PAID' || !shift.razorpayPaymentId) {
    return NextResponse.json({
      error: 'No payment to refund',
      code:  'NO_PAYMENT',
    }, { status: 400 })
  }

  if (!razorpay) {
    // Soft-cancel the shift and flag for manual ops refund. Better than
    // leaving the employer's money trapped because RZP isn't configured.
    await prisma.shift.update({
      where: { id: params.id },
      data:  { status: 'CANCELLED' },
    })
    return NextResponse.json({
      ok:    true,
      manual: true,
      error: 'Payment gateway not configured — shift cancelled, ops will refund manually',
    })
  }

  try {
    const refundAmount = Math.round((shift.paymentAmount ?? 0) * 100)
    if (refundAmount <= 0) {
      return NextResponse.json({ error: 'No payment amount on file to refund', code: 'NO_PAYMENT' }, { status: 400 })
    }
    const refund = await razorpay.payments.refund(shift.razorpayPaymentId, {
      amount: refundAmount,
      notes:  {
        shiftId:        shift.id,
        employerUserId: payload.userId,
        reason:         reason || 'employer-cancelled before assignment',
      },
    })

    await prisma.shift.update({
      where: { id: params.id },
      data:  { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
    })

    return NextResponse.json({ ok: true, refund })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Refund failed'
    console.error('[employer cancel-refund]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

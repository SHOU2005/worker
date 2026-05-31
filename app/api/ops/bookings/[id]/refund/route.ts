import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Razorpay from 'razorpay'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

/**
 * Ops-only: refund a booking. Calls Razorpay refund API, marks Payment + Booking
 * accordingly. The webhook (`refund.processed`) will be the final confirmation.
 *
 * Body: { reason?: string, amount?: number }  // amount in paise; defaults to full refund
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  if (!razorpay) {
    return NextResponse.json(
      { error: 'Payment gateway not configured', code: 'RAZORPAY_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  const { reason, amount } = await req.json().catch(() => ({}))

  const booking = await prisma.booking.findUnique({
    where:   { id: params.id },
    include: { payment: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.payment?.razorpayPaymentId) {
    return NextResponse.json({ error: 'No payment to refund' }, { status: 400 })
  }
  if (booking.paymentStatus === 'REFUNDED') {
    return NextResponse.json({ error: 'Already refunded' }, { status: 400 })
  }

  try {
    const refundAmount = typeof amount === 'number'
      ? amount
      : Math.round(booking.totalAmount * 100)

    const refund = await razorpay.payments.refund(booking.payment.razorpayPaymentId, {
      amount: refundAmount,
      notes:  {
        bookingId:       booking.id,
        opsUserId:       payload.userId,
        reason:          reason || 'ops-initiated refund',
      },
    })

    // Mark optimistically — webhook will confirm
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: booking.payment.id },
        data:  { status: 'REFUNDED' },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data:  { paymentStatus: 'REFUNDED', status: 'CANCELLED' },
      }),
    ])

    return NextResponse.json({ refund })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Refund failed'
    console.error('[ops/refund] error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

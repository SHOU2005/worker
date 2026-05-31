import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Razorpay from 'razorpay'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

// Loud warning: live keys + non-production env = real ₹ moves on test transactions.
if (RZP_CONFIGURED && RZP_KEY_ID!.startsWith('rzp_live_') && process.env.NODE_ENV !== 'production') {
  console.warn(
    '\n⚠️  RAZORPAY LIVE KEY DETECTED in non-production environment.\n' +
    '    Every payment will be REAL MONEY on a real card.\n' +
    '    Use rzp_test_* keys for development. Generate at:\n' +
    '    https://dashboard.razorpay.com/app/keys\n'
  )
}

const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

export async function POST(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { bookingId } = await req.json()
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, employerId: payload.userId },
    include: { shift: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.paymentStatus === 'PAID') {
    return NextResponse.json({ error: 'Already paid' }, { status: 400 })
  }

  const amountInPaise = Math.round(booking.totalAmount * 100)

  if (!razorpay || !RZP_CONFIGURED) {
    return NextResponse.json({
      error:        'Payment gateway not configured',
      code:         'RAZORPAY_NOT_CONFIGURED',
      configErrors: [
        !RZP_KEY_ID     ? 'Missing RAZORPAY_KEY_ID' : null,
        !RZP_KEY_SECRET ? 'Missing RAZORPAY_KEY_SECRET' : null,
      ].filter(Boolean),
    }, { status: 503 })
  }

  try {
    const order = await razorpay.orders.create({
      amount:   amountInPaise,
      currency: 'INR',
      receipt:  `booking_${bookingId}`,
      notes:    { bookingId, shiftTitle: booking.shift.title },
    })

    await prisma.payment.upsert({
      where:  { bookingId },
      create: { bookingId, razorpayOrderId: order.id, amount: booking.totalAmount, status: 'PENDING' },
      update: { razorpayOrderId: order.id, status: 'PENDING' },
    })

    return NextResponse.json({
      orderId:  order.id,
      amount:   amountInPaise,
      currency: 'INR',
      keyId:    RZP_KEY_ID,
      bookingId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Razorpay order create failed:', message)
    // Mark payment record as FAILED so the client can retry
    await prisma.payment.upsert({
      where:  { bookingId },
      create: { bookingId, razorpayOrderId: `order_failed_${Date.now()}`, amount: booking.totalAmount, status: 'FAILED' },
      update: { status: 'FAILED' },
    })
    return NextResponse.json({
      error: 'Failed to create payment order. Please try again.',
      code:  'RAZORPAY_ORDER_FAILED',
      detail: message,
    }, { status: 502 })
  }
}

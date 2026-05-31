import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess

  const { razorpayPaymentId, razorpayOrderId, razorpaySignature, bookingId } = await req.json()
  if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !bookingId) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) {
    return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 })
  }
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  if (expectedSignature !== razorpaySignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // All three updates atomic — partial failure here would otherwise leave the
  // booking PAID-but-unconfirmed (or vice versa).
  try {
    await prisma.$transaction([
      prisma.payment.update({
        where: { bookingId },
        data:  { razorpayPaymentId, status: 'PAID' },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
      }),
      prisma.shift.updateMany({
        where: { bookings: { some: { id: bookingId } } },
        data:  { status: 'ASSIGNED' },
      }),
    ])
  } catch (err) {
    console.error('[razorpay/verify] DB transaction failed after signature OK:', err)
    return NextResponse.json({
      error: 'Payment was verified but DB update failed. Contact support with payment id ' + razorpayPaymentId,
      code:  'POST_VERIFY_DB_ERROR',
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

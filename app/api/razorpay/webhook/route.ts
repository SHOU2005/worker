import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * Razorpay webhook handler — the single source of truth for payment status.
 *
 * Configure in Razorpay dashboard:
 *   - URL: https://yourapp.com/api/razorpay/webhook
 *   - Secret: store as RAZORPAY_WEBHOOK_SECRET in env
 *   - Events: payment.captured, payment.failed, order.paid, refund.processed
 *
 * Handles two payment models:
 *  1. Legacy booking flow: Payment row keyed by razorpayOrderId
 *  2. Cart flow: Shift row keyed by razorpayOrderId (no Payment row)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set — rejecting')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const raw       = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  // Use timingSafeEqual to defeat string-comparison timing attacks
  let sigOk = false
  try {
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    sigOk = a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch { sigOk = false }
  if (!sigOk) {
    console.warn('[razorpay-webhook] signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let body: { event: string; payload: Record<string, unknown> }
  try { body = JSON.parse(raw) }
  catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const event = body.event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = body.payload

  try {
    switch (event) {
      case 'payment.captured':
      case 'order.paid': {
        const orderId      = data.payment?.entity?.order_id ?? data.order?.entity?.id
        const paymentId    = data.payment?.entity?.id
        const amountPaid   = Number(data.payment?.entity?.amount ?? data.order?.entity?.amount_paid ?? 0) // paise
        if (!orderId) break

        // Try the legacy Payment row first
        const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: orderId } })
        if (payment) {
          // Idempotency — the same payment.captured event can be redelivered
          if (payment.status === 'PAID') {
            console.log('[razorpay-webhook] payment already PAID, ignoring duplicate', payment.id)
            break
          }
          // Amount tampering guard
          const expectedPaise = Math.round(payment.amount * 100)
          if (amountPaid > 0 && amountPaid < expectedPaise) {
            console.error(`[razorpay-webhook] amount mismatch: paid=${amountPaid}, expected=${expectedPaise}, payment=${payment.id}`)
            return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 })
          }
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data:  { status: 'PAID', razorpayPaymentId: paymentId ?? payment.razorpayPaymentId },
            }),
            prisma.booking.update({
              where: { id: payment.bookingId },
              data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
            }),
            prisma.shift.updateMany({
              where: { bookings: { some: { id: payment.bookingId } } },
              data:  { status: 'ASSIGNED' },
            }),
          ])
          console.log('[razorpay-webhook] booking confirmed:', payment.bookingId)
          break
        }

        // Cart-flow Shift row
        const shift = await prisma.shift.findFirst({ where: { razorpayOrderId: orderId } })
        if (shift) {
          if (shift.paymentStatus === 'PAID') {
            console.log('[razorpay-webhook] shift already PAID, ignoring duplicate', shift.id)
            break
          }
          const expectedPaise = Math.round((shift.paymentAmount ?? shift.hourlyRate * shift.duration * shift.workersNeeded) * 100)
          if (amountPaid > 0 && amountPaid < expectedPaise) {
            console.error(`[razorpay-webhook] cart amount mismatch: paid=${amountPaid}, expected=${expectedPaise}, shift=${shift.id}`)
            return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 })
          }
          await prisma.shift.update({
            where: { id: shift.id },
            data:  {
              paymentStatus:     'PAID',
              razorpayPaymentId: paymentId ?? shift.razorpayPaymentId,
              paidAt:            shift.paidAt ?? new Date(),
            },
          })
          console.log('[razorpay-webhook] cart shift confirmed:', shift.id)
          break
        }

        console.warn('[razorpay-webhook] no Payment or Shift row for order', orderId)
        break
      }

      case 'payment.failed': {
        const orderId = data.payment?.entity?.order_id
        if (!orderId) break
        const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: orderId } })
        if (payment && payment.status === 'PENDING') {
          await prisma.payment.update({
            where: { id: payment.id },
            data:  { status: 'FAILED' },
          })
          console.log('[razorpay-webhook] payment failed for booking:', payment.bookingId)
        }
        // Cart-flow shifts are only created on successful verify, so payment.failed
        // for a cart order has no DB side effect — the employer simply retries.
        break
      }

      case 'refund.processed': {
        const paymentId = data.refund?.entity?.payment_id ?? data.payment?.entity?.id
        if (!paymentId) break
        const payment = await prisma.payment.findFirst({ where: { razorpayPaymentId: paymentId } })
        if (payment && payment.status !== 'REFUNDED') {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data:  { status: 'REFUNDED' },
            }),
            prisma.booking.update({
              where: { id: payment.bookingId },
              data:  { paymentStatus: 'REFUNDED', status: 'CANCELLED' },
            }),
          ])
        }
        // Cart-flow shifts: refund flips paymentStatus + cancels the shift
        const shift = await prisma.shift.findFirst({ where: { razorpayPaymentId: paymentId } })
        if (shift && shift.paymentStatus !== 'REFUNDED') {
          await prisma.shift.update({
            where: { id: shift.id },
            data:  { paymentStatus: 'REFUNDED', status: 'CANCELLED' },
          })
        }
        break
      }

      default:
        // Unknown event — acknowledge so Razorpay doesn't retry
        break
    }
  } catch (err) {
    console.error('[razorpay-webhook] handler error:', err)
    // Return 500 so Razorpay retries
    return NextResponse.json({ error: 'Internal' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

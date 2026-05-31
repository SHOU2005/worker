import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Razorpay from 'razorpay'

// Tell Vercel this can run up to 60s — we may scan dozens of orders.
export const maxDuration = 60

const CRON_SECRET    = process.env.CRON_SECRET
const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

const BATCH_SIZE       = 25  // process this many per cron run
const PER_CALL_DELAY_MS = 250 // gentle on Razorpay rate limit (~4 req/s)
const TIME_BUDGET_MS   = 50_000 // exit early before Vercel kills us

/**
 * Periodic reconciliation. Two paths:
 *   1) legacy Payment-row flow (booking-based)
 *   2) cart-flow Shift rows (paymentStatus PENDING but a razorpayOrderId is set)
 *
 * Schedule via Vercel Cron in `vercel.json`:
 *   {
 *     "crons": [{ "path": "/api/cron/reconcile-payments", "schedule": "0 * * * *" }]
 *   }
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!razorpay) {
    return NextResponse.json({ error: 'Razorpay not configured' }, { status: 503 })
  }

  const startedAt = Date.now()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  // 1) Legacy flow
  const stalePayments = await prisma.payment.findMany({
    where:   { status: 'PENDING', createdAt: { lt: oneHourAgo } },
    orderBy: { createdAt: 'asc' },
    take:    BATCH_SIZE,
  })

  let confirmed = 0, expired = 0, errors = 0
  for (const p of stalePayments) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    if (!p.razorpayOrderId || p.razorpayOrderId.startsWith('order_failed_')) {
      await prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } })
      expired++
      continue
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order: any = await razorpay.orders.fetch(p.razorpayOrderId)
      if (order.status === 'paid') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payments: any = await razorpay.orders.fetchPayments(p.razorpayOrderId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const captured = (payments?.items || []).find((x: any) => x.status === 'captured')
        await prisma.$transaction([
          prisma.payment.update({
            where: { id: p.id },
            data:  { status: 'PAID', razorpayPaymentId: captured?.id ?? p.razorpayPaymentId },
          }),
          prisma.booking.update({
            where: { id: p.bookingId },
            data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
          }),
          prisma.shift.updateMany({
            where: { bookings: { some: { id: p.bookingId } } },
            data:  { status: 'ASSIGNED' },
          }),
        ])
        confirmed++
      } else if (order.status === 'attempted' && (Date.now() - p.createdAt.getTime()) > 6 * 60 * 60 * 1000) {
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } })
        expired++
      }
    } catch (err) {
      errors++
      console.error('[reconcile/payment] failed for', p.id, err)
    }
    await sleep(PER_CALL_DELAY_MS)
  }

  // 2) Cart flow: Shift rows that have a razorpayOrderId but paymentStatus is still PENDING.
  // These mean the user opened Razorpay but the verify endpoint never landed (network drop,
  // tab close, etc). The webhook should catch most of these but cron is the safety net.
  let cartConfirmed = 0, cartErrors = 0
  if (Date.now() - startedAt < TIME_BUDGET_MS) {
    const staleCartShifts = await prisma.shift.findMany({
      where: {
        paymentStatus:   'PENDING',
        razorpayOrderId: { not: null },
        createdAt:       { lt: oneHourAgo },
      },
      orderBy: { createdAt: 'asc' },
      take:    BATCH_SIZE,
    })
    for (const s of staleCartShifts) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
      if (!s.razorpayOrderId) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order: any = await razorpay.orders.fetch(s.razorpayOrderId)
        if (order.status === 'paid') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payments: any = await razorpay.orders.fetchPayments(s.razorpayOrderId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const captured = (payments?.items || []).find((x: any) => x.status === 'captured')
          await prisma.shift.update({
            where: { id: s.id },
            data:  {
              paymentStatus:     'PAID',
              razorpayPaymentId: captured?.id ?? s.razorpayPaymentId,
              paidAt:            s.paidAt ?? new Date(),
            },
          })
          cartConfirmed++
        } else if (order.status === 'attempted' && (Date.now() - s.createdAt.getTime()) > 6 * 60 * 60 * 1000) {
          // Mark as failed AND cancel the shift since no employer money came in
          await prisma.shift.update({
            where: { id: s.id },
            data:  { paymentStatus: 'FAILED', status: 'CANCELLED' },
          })
          expired++
        }
      } catch (err) {
        cartErrors++
        console.error('[reconcile/cart-shift] failed for', s.id, err)
      }
      await sleep(PER_CALL_DELAY_MS)
    }
  }

  return NextResponse.json({
    durationMs:    Date.now() - startedAt,
    legacy: { scanned: stalePayments.length, confirmed, expired, errors },
    cart:   { confirmed: cartConfirmed, errors: cartErrors },
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

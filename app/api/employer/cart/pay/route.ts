import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getActivePromos } from '@/lib/promos'
import { computeBill } from '@/lib/slots'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession(['EMPLOYER'])
    if (sess instanceof NextResponse) return sess
    const { payload } = sess

  if (!razorpay) {
    const missing = [
      !RZP_KEY_ID                                    && 'RAZORPAY_KEY_ID',
      !RZP_KEY_SECRET                                && 'RAZORPAY_KEY_SECRET',
      RZP_KEY_ID && RZP_KEY_ID.includes('placeholder') && 'RAZORPAY_KEY_ID (still set to placeholder)',
    ].filter(Boolean).join(', ')
    return NextResponse.json({
      error: `Payment gateway not configured. Missing or invalid: ${missing}. Update Vercel env vars and redeploy.`,
      code:  'RAZORPAY_NOT_CONFIGURED',
      missing,
    }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    category, address, city, lat, lng,
    duration, date, startTime, endTime, isInstant,
    workersNeeded, title, promoCode,
  } = body

  if (!category || !duration || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const dur = Number(duration)
  if (!Number.isFinite(dur) || dur <= 0 || dur > 168) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
  }
  const workers = Math.max(1, Math.min(20, Number(workersNeeded) || 1))

  // Server-derive whether this employer has already paid for a shift. Drives
  // the intro (₹99) vs repeat (₹129) rate for Maid/Cleaning services. We
  // never trust the client's flag — the cart UI computes the same value
  // independently for display, but the price actually charged is bound to
  // this server lookup.
  const prior = await prisma.shift.findFirst({
    where:  { employer: { user: { id: payload.userId } }, paymentStatus: 'PAID' },
    select: { id: true },
  })
  const hasPriorBooking = !!prior

  // First pass — compute the slot-discounted gross to validate promo against.
  // `category` is the same service name the cart page passed in (e.g. "Cleaner");
  // computeBill uses it to apply per-service rates (Cleaner = ₹99/hr promo).
  const preBill = computeBill({ hours: dur, workersNeeded: workers, isInstant: !!isInstant, service: String(category), hasPriorBooking })

  // Server-side promo re-validation — never trust the client's discount.
  // Promo codes are an acquisition tool, scoped to first-time bookings only.
  // Once an employer has any paid shift on file, promo codes are silently
  // ignored on the server even if the client sends one. Exception: admin-
  // only codes (SWITCH99) work for users with DB role=ADMIN on every
  // booking, so support can run end-to-end ₹1 smoke tests on demand.
  let promoDiscount = 0
  let appliedPromoCode = ''
  if (promoCode && typeof promoCode === 'string') {
    const code = promoCode.trim().toUpperCase()
    if (code) {
      const promos = await getActivePromos()
      const postSlotSubtotal = preBill.gross - preBill.slotDiscount
      const promo = promos.find(p => p.code.toUpperCase() === code && p.active)
      const isAdmin   = sess.user.role === 'ADMIN'
      const adminGate = promo?.adminOnly ? isAdmin : !hasPriorBooking
      if (promo && adminGate && (!promo.minSpend || postSlotSubtotal >= promo.minSpend)) {
        if (promo.type === 'flat') {
          promoDiscount = Math.min(promo.amount, postSlotSubtotal)
        } else if (promo.type === 'fixed_total') {
          // Force the payable amount to `amount` (e.g. ₹1) — see promos.ts.
          promoDiscount = Math.max(0, postSlotSubtotal - promo.amount)
        } else {
          promoDiscount = Math.round(postSlotSubtotal * promo.amount / 100)
          if (promo.maxDiscount) promoDiscount = Math.min(promoDiscount, promo.maxDiscount)
        }
        appliedPromoCode = promo.code
      }
    }
  }

  // Second pass — final bill including the validated promo (same service rate).
  const bill          = computeBill({ hours: dur, workersNeeded: workers, isInstant: !!isInstant, promoDiscount, service: String(category), hasPriorBooking })
  const totalAmount   = bill.total
  const amountInPaise = totalAmount * 100
  const grossAmount   = bill.gross
  const hourlyRate    = bill.hourlyRate

    let order
    try {
      order = await razorpay.orders.create({
        amount:   amountInPaise,
        currency: 'INR',
        receipt:  `cart_${payload.userId}_${Date.now()}`.slice(0, 40),
        notes: {
          userId:        String(payload.userId),
          category:      String(category),
          title:         String(title || category),
          address:       String(address || ''),
          city:          String(city || 'Gurgaon'),
          lat:           String(lat ?? ''),
          lng:           String(lng ?? ''),
          duration:      String(dur),
          date:          String(date),
          startTime:     String(startTime),
          endTime:       String(endTime),
          isInstant:     isInstant ? '1' : '0',
          hourlyRate:    String(hourlyRate),
          workersNeeded: String(workers),
          promoCode:     appliedPromoCode,
          promoDiscount: String(promoDiscount),
          slotDiscount:  String(bill.slotDiscount),
          urgentSurcharge: String(bill.urgentSurcharge),
        },
      })
    } catch (err: unknown) {
      // Razorpay-specific failure — return 502 so the client can retry without
      // surfacing a misleading "server error". Re-throwing into the outer
      // catch would have flattened it to a 500.
      const message = err instanceof Error ? err.message : 'Razorpay error'
      console.error('cart/pay order failed:', message)
      return NextResponse.json({ error: 'Could not start payment. Try again.', detail: message }, { status: 502 })
    }

    return NextResponse.json({
      orderId:         order.id,
      keyId:           RZP_KEY_ID,
      amount:          amountInPaise,
      currency:        'INR',
      total:           totalAmount,
      grossAmount,
      slotDiscount:    bill.slotDiscount,
      urgentSurcharge: bill.urgentSurcharge,
      promoDiscount,
      promoCode:       appliedPromoCode,
      workersNeeded:   workers,
    })
  } catch (err: unknown) {
    // Anything else (DB down, JSON parse, promo lookup) lands here.
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[cart/pay] FATAL:', message, stack)
    return NextResponse.json({ error: `Server error: ${message}`, code: 'CART_PAY_FATAL' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { getActivePromos } from '@/lib/promos'

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession(['EMPLOYER', 'ADMIN'])
    if (sess instanceof NextResponse) return sess

    const body  = await req.json().catch(() => ({}))
    const code  = String(body.code || '').toUpperCase().trim()
    const total = Number(body.total)

    if (!code) return NextResponse.json({ valid: false, error: 'Enter a promo code' }, { status: 400 })
    if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ valid: false, error: 'Add items to your cart first' }, { status: 400 })

    const promos = await getActivePromos()
    const promo  = promos.find(p => p.code.toUpperCase() === code && p.active)
    if (!promo) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired promo code' }, { status: 404 })
    }

    // Admin-only promos (SWITCH99 testing code) require DB role=ADMIN.
    // sess.user.role is the role from the User row, not the JWT claim, so
    // an employer-logged-in admin still gets through.
    if (promo.adminOnly && sess.user.role !== 'ADMIN') {
      return NextResponse.json({ valid: false, error: 'Invalid or expired promo code' }, { status: 404 })
    }

    // Non-admin promos (SAVE50 etc.) are one-time-per-user — keyed on
    // whether the employer already has any PAID shift on file. Mirrors
    // the gate inside /api/employer/cart/pay so the UI preview matches
    // what we'd actually charge at checkout. Admins are exempt.
    if (!promo.adminOnly && sess.user.role !== 'ADMIN') {
      const prior = await prisma.shift.findFirst({
        where:  { employer: { user: { id: sess.payload.userId } }, paymentStatus: 'PAID' },
        select: { id: true },
      })
      if (prior) {
        return NextResponse.json({
          valid: false,
          error: 'This promo is one-time only — you\'ve already booked with us',
        }, { status: 400 })
      }
    }

    if (promo.minSpend && total < promo.minSpend) {
      return NextResponse.json({
        valid: false,
        error: `Minimum cart of ₹${promo.minSpend} needed to use this code`,
      }, { status: 400 })
    }

    let discount: number
    if (promo.type === 'flat') {
      discount = Math.min(promo.amount, total)
    } else if (promo.type === 'fixed_total') {
      // Set the final payable to exactly `amount` rupees (e.g. ₹1 for the
      // admin SWITCH99 smoke-test code). Discount = total − amount; clamp
      // at 0 if cart somehow undershoots.
      discount = Math.max(0, total - promo.amount)
    } else {
      discount = Math.round(total * promo.amount / 100)
      if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount)
    }

    return NextResponse.json({
      valid:        true,
      code:         promo.code,
      discount,
      description:  promo.description,
      type:         promo.type,
      amount:       promo.amount,
    })
  } catch (err) {
    console.error('[promo] failed:', err)
    return NextResponse.json({ valid: false, error: 'Could not validate code' }, { status: 500 })
  }
}

// GET — list active, non-admin promo codes the signed-in employer is
// eligible for, given their current booking total. Used by the "View
// offers" sheet on /employer/schedule so users can browse rather than
// guess codes.
export async function GET(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  const totalRaw = req.nextUrl.searchParams.get('total')
  const total    = totalRaw ? Math.max(0, Number(totalRaw) || 0) : 0

  // One-time-per-user codes: are they already past their first paid shift?
  const prior = await prisma.shift.findFirst({
    where:  { employer: { user: { id: sess.payload.userId } }, paymentStatus: 'PAID' },
    select: { id: true },
  })
  const isReturning = !!prior
  const isAdmin     = sess.user.role === 'ADMIN'

  const promos = await getActivePromos()
  const visible = promos
    .filter(p => p.active)
    .filter(p => isAdmin || !p.adminOnly)
    .map(p => {
      // Compute eligibility + previewed discount for display.
      let eligible = true
      let reason   = ''
      if (!isAdmin && p.adminOnly) { eligible = false; reason = 'Admin only' }
      else if (!isAdmin && isReturning && !p.adminOnly) { eligible = false; reason = 'One-time only — already booked' }
      else if (total > 0 && p.minSpend && total < p.minSpend) { eligible = false; reason = `Minimum ₹${p.minSpend} cart` }

      let preview: number | null = null
      if (total > 0 && eligible) {
        if (p.type === 'flat')             preview = Math.min(p.amount, total)
        else if (p.type === 'fixed_total') preview = Math.max(0, total - p.amount)
        else                                preview = Math.min(p.maxDiscount ?? Infinity, Math.round(total * p.amount / 100))
      }

      return {
        code:        p.code,
        description: p.description,
        type:        p.type,
        amount:      p.amount,
        minSpend:    p.minSpend ?? null,
        maxDiscount: p.maxDiscount ?? null,
        eligible,
        reason,
        preview,
      }
    })
    // Eligible first, then by largest preview
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || ((b.preview ?? 0) - (a.preview ?? 0)))

  return NextResponse.json({ promos: visible })
}

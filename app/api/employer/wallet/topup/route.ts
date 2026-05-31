import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

const MIN_PAISE = 5000        // ₹50
const MAX_PAISE = 10000000    // ₹1,00,000

// POST — create a Razorpay order for a wallet top-up.
// Stores a PENDING WalletTransaction with the order ID; the verify endpoint
// looks up by orderId so we can credit idempotently.
export async function POST(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  if (!razorpay) {
    return NextResponse.json({
      error: 'Payment gateway not configured. Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on Vercel.',
      code:  'RAZORPAY_NOT_CONFIGURED',
    }, { status: 503 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const rupees = Math.floor(Number(body?.amount))
  if (!Number.isFinite(rupees) || rupees < 50 || rupees > 100000) {
    return NextResponse.json({ error: 'Amount must be between ₹50 and ₹1,00,000' }, { status: 400 })
  }
  const paise = rupees * 100
  if (paise < MIN_PAISE || paise > MAX_PAISE) {
    return NextResponse.json({ error: 'Amount out of allowed range' }, { status: 400 })
  }

  const employer = await prisma.employerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { id: true },
  })
  if (!employer) return NextResponse.json({ error: 'Employer profile not found' }, { status: 404 })

  // Receipt has to be unique per order. Tag with employer prefix so we can
  // trace if a Razorpay webhook ever fires before our verify endpoint runs.
  const receipt = `wtu_${employer.id.slice(-8)}_${Date.now()}`

  try {
    const order = await razorpay.orders.create({
      amount:   paise,
      currency: 'INR',
      receipt,
      notes: {
        purpose:           'wallet_topup',
        userId:            payload.userId,
        employerProfileId: employer.id,
      },
    })

    await prisma.walletTransaction.create({
      data: {
        employerProfileId: employer.id,
        type:              'TOPUP',
        amount:            paise,
        status:            'PENDING',
        razorpayOrderId:   order.id,
        description:       `Wallet top-up · ₹${rupees.toLocaleString('en-IN')}`,
      },
    })

    return NextResponse.json({
      orderId:  order.id,
      amount:   paise,
      currency: 'INR',
      keyId:    RZP_KEY_ID,
      receipt,
    })
  } catch (err: any) {
    console.error('[wallet/topup] razorpay order failed:', err?.error || err)
    return NextResponse.json({ error: 'Could not create payment order. Try again.' }, { status: 502 })
  }
}

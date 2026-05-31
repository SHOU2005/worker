import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

// POST — verify a Razorpay payment for a wallet top-up and credit the
// employer's balance. Idempotent: if the same orderId has already been
// COMPLETED, we return the current balance without double-crediting.
export async function POST(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  if (!RZP_KEY_SECRET) {
    return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = body || {}
  if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  // 1) Signature check — proves Razorpay actually saw this payment.
  const expected = crypto
    .createHmac('sha256', RZP_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')
  if (expected !== razorpaySignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2) Lookup the pending top-up by orderId. The PENDING row was written by
  //    /api/employer/wallet/topup at order-create time.
  const txn = await prisma.walletTransaction.findUnique({
    where:  { razorpayOrderId: String(razorpayOrderId) },
    select: { id: true, employerProfileId: true, amount: true, status: true },
  })
  if (!txn) {
    return NextResponse.json({ error: 'Top-up record not found for this order' }, { status: 404 })
  }

  // 3) Ownership check — make sure this employer initiated the order. We
  //    join via EmployerProfile.userId to avoid trusting the client.
  const employer = await prisma.employerProfile.findUnique({
    where:  { id: txn.employerProfileId },
    select: { userId: true, walletBalance: true },
  })
  if (!employer || employer.userId !== payload.userId) {
    return NextResponse.json({ error: 'Order does not belong to this account' }, { status: 403 })
  }

  // 4) Idempotency: if already COMPLETED, return current balance.
  if (txn.status === 'COMPLETED') {
    return NextResponse.json({
      success:  true,
      balance:  employer.walletBalance / 100,
      txnId:    txn.id,
      message:  'Top-up already credited',
    })
  }
  if (txn.status === 'FAILED') {
    return NextResponse.json({ error: 'This top-up was previously marked failed.' }, { status: 409 })
  }

  // 5) Credit in a transaction so balance + txn flip atomically.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.walletTransaction.update({
      where: { id: txn.id },
      data:  {
        status:            'COMPLETED',
        razorpayPaymentId: String(razorpayPaymentId),
      },
    })
    const ep = await tx.employerProfile.update({
      where: { id: txn.employerProfileId },
      data:  { walletBalance: { increment: txn.amount } },
      select: { walletBalance: true },
    })
    return ep.walletBalance
  })

  return NextResponse.json({
    success: true,
    balance: updated / 100,
    txnId:   txn.id,
  })
}

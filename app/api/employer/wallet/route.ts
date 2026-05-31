import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// GET — return wallet balance (in rupees) and the most recent ledger rows.
// Anything more than 50 rows lives in /payments; the wallet screen is just
// for at-a-glance balance + recent activity.
export async function GET(_req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const employer = await prisma.employerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { id: true, walletBalance: true },
  })
  if (!employer) return NextResponse.json({ error: 'Employer profile not found' }, { status: 404 })

  const txns = await prisma.walletTransaction.findMany({
    where:   { employerProfileId: employer.id, status: { in: ['COMPLETED', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
    take:    50,
    select: {
      id: true, type: true, amount: true, status: true,
      description: true, createdAt: true, razorpayPaymentId: true,
    },
  })

  return NextResponse.json({
    balance:     Math.round(employer.walletBalance) / 100,   // rupees
    balancePaise: employer.walletBalance,
    transactions: txns.map(t => ({
      id:          t.id,
      type:        t.type,
      amount:      t.amount / 100,
      amountPaise: t.amount,
      status:      t.status,
      description: t.description,
      createdAt:   t.createdAt.toISOString(),
      paymentRef:  t.razorpayPaymentId,
    })),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { pushToUser } from '@/lib/fcm-server'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: string[] }
  if (!ids?.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  const commissions = await prisma.commission.findMany({
    where:   { id: { in: ids }, status: 'APPROVED' },
    include: { captain: true },
  })

  // Group by captain to do one update per captain
  const byCapt: Record<string, { captainId: string; userId: string; total: number }> = {}
  for (const c of commissions) {
    if (!byCapt[c.captainProfileId]) {
      byCapt[c.captainProfileId] = { captainId: c.captainProfileId, userId: c.captain.userId, total: 0 }
    }
    byCapt[c.captainProfileId].total += c.amount
  }

  await prisma.commission.updateMany({
    where: { id: { in: ids }, status: 'APPROVED' },
    data:  { status: 'PAID', paidAt: new Date() },
  })

  for (const { captainId, userId, total } of Object.values(byCapt)) {
    await prisma.captainProfile.update({
      where: { id: captainId },
      data:  {
        totalEarnings: { increment: total },
        pendingPayout: { decrement: total },
      },
    })
    await pushToUser(userId, {
      title: 'Payment Credited!',
      body:  `₹${total} commission has been paid to your account.`,
    })
  }

  return NextResponse.json({ success: true, paid: ids.length })
}

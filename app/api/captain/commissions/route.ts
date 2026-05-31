import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const status = req.nextUrl.searchParams.get('status') || undefined

  const commissions = await prisma.commission.findMany({
    where:   { captainProfileId: captain.id, ...(status && { status: status as 'PENDING' | 'APPROVED' | 'PAID' }) },
    include: {
      booking: {
        include: {
          shift:    { select: { title: true, date: true } },
          employer: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = await prisma.commission.aggregate({
    where: { captainProfileId: captain.id, createdAt: { gte: startOfMonth } },
    _sum:  { amount: true },
  })

  return NextResponse.json({
    commissions,
    pendingPayout:    captain.pendingPayout,
    totalEarnings:    captain.totalEarnings,
    earnedThisMonth:  thisMonth._sum.amount ?? 0,
  })
}

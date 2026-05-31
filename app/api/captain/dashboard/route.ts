import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const today        = new Date(now); today.setHours(0, 0, 0, 0)
  const last7Start   = new Date(today); last7Start.setDate(last7Start.getDate() - 6)

  const [commissionThisMonth, pendingTasks, employersOnboarded, workersOnboarded, last7Rows] = await Promise.all([
    prisma.commission.aggregate({
      where:  { captainProfileId: captain.id, createdAt: { gte: startOfMonth } },
      _sum:   { amount: true },
    }),
    prisma.captainTask.count({
      where: { captainProfileId: captain.id, status: 'OPEN' },
    }),
    prisma.employerProfile.count({ where: { captainReferralId: captain.id } }),
    prisma.workerProfile.count({ where: { captainReferralId: captain.id } }),
    prisma.commission.findMany({
      where: { captainProfileId: captain.id, createdAt: { gte: last7Start } },
      select: { createdAt: true, amount: true },
    }),
  ])

  const buckets: Record<string, number> = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(last7Start); d.setDate(last7Start.getDate() + i)
    buckets[d.toISOString().slice(0, 10)] = 0
  }
  for (const r of last7Rows) {
    const k = r.createdAt.toISOString().slice(0, 10)
    if (k in buckets) buckets[k] += r.amount
  }
  const last7Days = Object.entries(buckets).map(([date, amount]) => ({ date, amount }))

  return NextResponse.json({
    status:              captain.status,
    commissionThisMonth: commissionThisMonth._sum.amount ?? 0,
    pendingPayout:       captain.pendingPayout,
    totalEarnings:       captain.totalEarnings,
    pendingTasks,
    employersOnboarded,
    workersOnboarded,
    last7Days,
  })
}

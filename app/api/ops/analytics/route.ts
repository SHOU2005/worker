import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = parseInt(req.nextUrl.searchParams.get('days') || '30')
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [totalWorkers, totalEmployers, totalCaptains, totalBookings, completedBookings, revenue] = await Promise.all([
    prisma.workerProfile.count(),
    prisma.employerProfile.count(),
    prisma.captainProfile.count({ where: { status: 'ACTIVE' } }),
    prisma.booking.count({ where: { createdAt: { gte: from } } }),
    prisma.booking.count({ where: { status: 'COMPLETED', createdAt: { gte: from } } }),
    prisma.booking.aggregate({
      where: { status: 'COMPLETED', createdAt: { gte: from } },
      _sum:  { platformFee: true, totalAmount: true },
    }),
  ])

  // Build daily revenue chart (last N days)
  const dailyRevenue: { date: string; revenue: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const agg = await prisma.booking.aggregate({
      where: { status: 'COMPLETED', createdAt: { gte: dayStart, lte: dayEnd } },
      _sum:  { platformFee: true },
    })
    dailyRevenue.push({
      date:    dayStart.toISOString().slice(0, 10),
      revenue: agg._sum.platformFee ?? 0,
    })
  }

  return NextResponse.json({
    totalWorkers,
    totalEmployers,
    totalCaptains,
    totalBookings,
    completedBookings,
    totalRevenue:    revenue._sum.platformFee ?? 0,
    grossRevenue:    revenue._sum.totalAmount ?? 0,
    dailyRevenue,
  })
}

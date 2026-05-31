import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [
    totalUsers,
    totalWorkers,
    totalEmployers,
    pendingKyc,
    totalShifts,
    totalBookings,
    completedBookings,
    revenueData,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workerProfile.count(),
    prisma.employerProfile.count(),
    prisma.workerProfile.count({ where: { kycStatus: 'PENDING' } }),
    prisma.shift.count(),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.booking.aggregate({ _sum: { platformFee: true }, where: { status: 'COMPLETED' } }),
  ])

  return NextResponse.json({
    totalUsers,
    totalWorkers,
    totalEmployers,
    pendingKyc,
    totalShifts,
    totalBookings,
    completedBookings,
    revenue: revenueData._sum.platformFee ?? 0,
  })
}

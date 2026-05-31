import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { workerEarningFromBooking } from '@/lib/pricing'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'WORKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workerProfile = await prisma.workerProfile.findUnique({
    where: { userId: payload.userId },
  })
  if (!workerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Include CONFIRMED + IN_PROGRESS so live shifts show in the wallet too —
  // earnings are computed from actual minutes worked, not the stored amount.
  const bookings = await prisma.booking.findMany({
    where: { workerProfileId: workerProfile.id, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
    include: {
      shift: {
        include: { employer: { include: { user: { select: { name: true } } } } },
      },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const liveAmt = (b: { checkInTime: Date | null; checkOutTime: Date | null }) =>
    workerEarningFromBooking(b.checkInTime, b.checkOutTime)

  const weekBookings = bookings.filter(b => b.createdAt >= sevenDaysAgo)

  // Build 7-day chart data
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekData = days.map((day, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    const dayBookings = weekBookings.filter(b => {
      const d = new Date(b.createdAt)
      return d.toDateString() === date.toDateString()
    })
    return { day, amt: dayBookings.reduce((s, b) => s + liveAmt(b), 0) }
  })

  // Total earnings = sum of every booking's actual minutes-worked × ₹100/hr.
  // Avoids relying on workerProfile.totalEarnings which is only updated on
  // shift completion.
  const totalLifetime = bookings.reduce((s, b) => s + liveAmt(b), 0)

  return NextResponse.json({
    totalEarnings: totalLifetime,
    weekTotal:     weekBookings.reduce((s, b) => s + liveAmt(b), 0),
    weekData,
    history:       bookings,
  })
}

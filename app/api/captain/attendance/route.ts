import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [todayRecord, history] = await Promise.all([
    prisma.captainAttendance.findFirst({
      where: { captainProfileId: captain.id, date: { gte: today } },
    }),
    prisma.captainAttendance.findMany({
      where:   { captainProfileId: captain.id },
      orderBy: { date: 'desc' },
      take:    30,
    }),
  ])

  return NextResponse.json({ today: todayRecord, history })
}

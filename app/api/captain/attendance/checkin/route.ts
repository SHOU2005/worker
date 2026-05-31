import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { lat, lng } = await req.json()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.captainAttendance.findFirst({
    where: { captainProfileId: captain.id, date: { gte: today } },
  })
  if (existing?.checkInTime) {
    return NextResponse.json({ error: 'Already checked in today' }, { status: 400 })
  }

  const record = existing
    ? await prisma.captainAttendance.update({
        where: { id: existing.id },
        data:  { checkInTime: new Date(), checkInLat: lat, checkInLng: lng },
      })
    : await prisma.captainAttendance.create({
        data: {
          captainProfileId: captain.id,
          date:             new Date(),
          checkInTime:      new Date(),
          checkInLat:       lat,
          checkInLng:       lng,
        },
      })

  return NextResponse.json({ attendance: record })
}

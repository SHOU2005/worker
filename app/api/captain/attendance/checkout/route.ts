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

  const record = await prisma.captainAttendance.findFirst({
    where: { captainProfileId: captain.id, date: { gte: today }, checkInTime: { not: null } },
  })
  if (!record) return NextResponse.json({ error: 'No active check-in found' }, { status: 400 })
  if (record.checkOutTime) return NextResponse.json({ error: 'Already checked out today' }, { status: 400 })

  const updated = await prisma.captainAttendance.update({
    where: { id: record.id },
    data:  { checkOutTime: new Date(), checkOutLat: lat, checkOutLng: lng },
  })
  return NextResponse.json({ attendance: updated })
}

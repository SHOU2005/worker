import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { lat, lng } = await req.json()
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  await prisma.captainProfile.update({
    where: { userId: payload.userId },
    data:  { lat, lng, lastSeenAt: new Date() },
  })

  return NextResponse.json({ success: true })
}

// Ops: get all active captains (seen in last 2 hours)
export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || !['OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const captains = await prisma.captainProfile.findMany({
    where: { lastSeenAt: { gte: twoHoursAgo }, lat: { not: null }, lng: { not: null } },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { lastSeenAt: 'desc' },
  })

  return NextResponse.json({ captains })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { pushToUsers } from '@/lib/fcm-server'

const VALID_ROLES = ['ALL', 'WORKER', 'CAPTAIN', 'EMPLOYER'] as const
type TargetRole = typeof VALID_ROLES[number]

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || !['OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, body, targetRole = 'ALL', targetCity, url } = await req.json() as {
    title: string; body: string; targetRole?: TargetRole; targetCity?: string; url?: string
  }
  if (!title || !body) return NextResponse.json({ error: 'Title and body required' }, { status: 400 })
  if (!VALID_ROLES.includes(targetRole)) {
    return NextResponse.json({ error: 'Invalid targetRole' }, { status: 400 })
  }

  // Build user filter
  const where: Record<string, unknown> = { isActive: true }
  if (targetRole !== 'ALL') {
    where.role = targetRole
  } else {
    where.role = { in: ['WORKER', 'CAPTAIN', 'EMPLOYER'] }
  }
  // City scoping (only honored for workers/employers — uses respective profile city)
  if (targetCity) {
    where.OR = [
      { workerProfile:   { city: targetCity } },
      { employerProfile: { city: targetCity } },
      { captainProfile:  { territory: targetCity } },
    ]
  }

  const users = await prisma.user.findMany({ where, select: { id: true } })
  const ids = users.map(u => u.id)

  const res = await pushToUsers(ids, { title, body, url, data: { type: 'OPS_BROADCAST' } })

  await prisma.broadcastLog.create({
    data: {
      sentByUserId: payload.userId,
      title,
      body,
      targetRole,
      targetCity: targetCity || null,
      sentCount:  res.success,
    },
  })

  return NextResponse.json({
    success:  true,
    targeted: ids.length,
    delivered: res.success,
    failed:   res.failure,
  })
}

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || !['OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.broadcastLog.findMany({
    orderBy: { createdAt: 'desc' },
    take:    50,
  })
  return NextResponse.json({ logs })
}

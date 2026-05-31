import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

/**
 * Ops-only: read the AadhaarAccessLog. Useful for compliance reviews.
 * Filters: ?workerId=<id>&accessedById=<userId>&page=1
 */
export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || !['OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workerId     = req.nextUrl.searchParams.get('workerId')     || undefined
  const accessedById = req.nextUrl.searchParams.get('accessedById') || undefined
  const page         = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'))
  const limit        = 50

  const where = {
    ...(workerId     ? { workerProfileId: workerId } : {}),
    ...(accessedById ? { accessedById }              : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.aadhaarAccessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aadhaarAccessLog.count({ where }),
  ])

  // Hydrate user names so the UI is readable
  const userIds = Array.from(new Set(logs.map(l => l.accessedById)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where:  { id: { in: userIds } },
        select: { id: true, name: true, role: true },
      })
    : []
  const userMap = new Map(users.map(u => [u.id, u]))

  return NextResponse.json({
    logs:  logs.map(l => ({ ...l, accessedBy: userMap.get(l.accessedById) ?? null })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'OPS' && payload.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const city     = req.nextUrl.searchParams.get('city')     || undefined
    const verified = req.nextUrl.searchParams.get('verified')

    const baseWhere = {
      ...(city     && { city }),
      ...(verified === 'true'  && { verifiedByOpsAt: { not: null } }),
      ...(verified === 'false' && { verifiedByOpsAt: null }),
    }
    let employers
    try {
      employers = await prisma.employerProfile.findMany({
        where: { deletedAt: null, ...baseWhere },
        include: { user: { select: { id: true, name: true, phone: true, avatar: true, isActive: true, createdAt: true } } },
        orderBy: { user: { createdAt: 'desc' } },
      })
    } catch (e) {
      console.error('[ops/employers] deletedAt filter failed, retry without:', e)
      employers = await prisma.employerProfile.findMany({
        where: baseWhere,
        include: { user: { select: { id: true, name: true, phone: true, avatar: true, isActive: true, createdAt: true } } },
        orderBy: { user: { createdAt: 'desc' } },
      })
    }

    return NextResponse.json({ employers })
  } catch (err) {
    console.error('[ops/employers] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ employers: [], error: err instanceof Error ? err.message : 'unknown' }, { status: 200 })
  }
}

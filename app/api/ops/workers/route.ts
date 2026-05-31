import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'OPS' && payload.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const kycStatus = (req.nextUrl.searchParams.get('kycStatus') || undefined) as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined
    const city      = req.nextUrl.searchParams.get('city')      || undefined
    const page      = parseInt(req.nextUrl.searchParams.get('page') || '1')
    const limit     = 20

    const baseWhere = {
      ...(kycStatus && { kycStatus }),
      ...(city      && { city }),
    }
    // Only filter on deletedAt if the schema/DB supports it. Fail open: if the
    // filter throws (column missing), retry without it.
    let workers
    let total
    try {
      [workers, total] = await Promise.all([
        prisma.workerProfile.findMany({
          where:   { deletedAt: null, ...baseWhere },
          include: { user: { select: { id: true, name: true, phone: true, avatar: true, isActive: true, createdAt: true } } },
          orderBy: { user: { createdAt: 'desc' } },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
        prisma.workerProfile.count({ where: { deletedAt: null, ...baseWhere } }),
      ])
    } catch (e) {
      console.error('[ops/workers] deletedAt filter failed, retrying without it:', e)
      ;[workers, total] = await Promise.all([
        prisma.workerProfile.findMany({
          where:   baseWhere,
          include: { user: { select: { id: true, name: true, phone: true, avatar: true, isActive: true, createdAt: true } } },
          orderBy: { user: { createdAt: 'desc' } },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
        prisma.workerProfile.count({ where: baseWhere }),
      ])
    }

    // Strip encrypted Aadhaar blob — only expose masked last4
    const safe = workers.map(w => {
      const { aadhaarNumber: _enc, ...rest } = w
      return {
        ...rest,
        aadhaarNumber: w.aadhaarLast4 ? `XXXX-XXXX-${w.aadhaarLast4}` : null,
      }
    })

    return NextResponse.json({ workers: safe, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[ops/workers] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ workers: [], total: 0, page: 1, pages: 0, error: err instanceof Error ? err.message : 'unknown' }, { status: 200 })
  }
}

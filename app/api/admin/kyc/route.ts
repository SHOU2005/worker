import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workers = await prisma.workerProfile.findMany({
    where:   { deletedAt: null, kycStatus: 'PENDING' },
    include: { user: { select: { name: true, phone: true, createdAt: true } } },
    orderBy: { user: { createdAt: 'asc' } },
  })

  return NextResponse.json({ workers })
}

export async function PATCH(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { workerProfileId, status, reason } = await req.json()

  const updated = await prisma.workerProfile.update({
    where: { id: workerProfileId },
    data:  { kycStatus: status },
  })

  return NextResponse.json({ worker: updated, reason })
}

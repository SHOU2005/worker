import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || undefined

  const commissions = await prisma.commission.findMany({
    where: status ? { status: status as 'PENDING' | 'APPROVED' | 'PAID' } : undefined,
    include: {
      captain: {
        include: { user: { select: { name: true, phone: true } } },
      },
      booking: {
        include: { shift: { select: { title: true, date: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ commissions })
}

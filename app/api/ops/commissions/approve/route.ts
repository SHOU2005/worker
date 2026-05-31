import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: string[] }
  if (!ids?.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  await prisma.commission.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data:  { status: 'APPROVED' },
  })

  return NextResponse.json({ success: true, approved: ids.length })
}

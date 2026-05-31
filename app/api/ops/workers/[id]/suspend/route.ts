import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const worker = await prisma.workerProfile.findUnique({ where: { id: params.id } })
  if (!worker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { isActive } = await req.json()
  await prisma.user.update({ where: { id: worker.userId }, data: { isActive } })
  return NextResponse.json({ success: true, isActive })
}

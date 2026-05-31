import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status, resolution } = await req.json()
  const updated = await prisma.complaint.update({
    where: { id: params.id },
    data:  {
      status,
      ...(resolution && { resolution }),
      ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
    },
  })
  return NextResponse.json({ complaint: updated })
}

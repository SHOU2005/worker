import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession()
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const complaint = await prisma.complaint.findFirst({
    where:   { id: params.id, reportedBy: payload.userId },
  })
  if (!complaint) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ complaint })
}

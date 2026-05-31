import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const task = await prisma.captainTask.findFirst({
    where: { id: params.id, captainProfileId: captain.id },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const { status } = await req.json()
  const updated = await prisma.captainTask.update({
    where: { id: params.id },
    data: {
      status,
      ...(status === 'DONE' && { completedAt: new Date() }),
    },
  })
  return NextResponse.json({ task: updated })
}

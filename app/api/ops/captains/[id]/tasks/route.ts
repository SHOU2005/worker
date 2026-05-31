import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { pushToUser } from '@/lib/fcm-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, dueDate } = await req.json()
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const captain = await prisma.captainProfile.findUnique({ where: { id: params.id } })
  if (!captain) return NextResponse.json({ error: 'Captain not found' }, { status: 404 })

  const task = await prisma.captainTask.create({
    data: {
      captainProfileId: params.id,
      assignedByUserId: payload.userId,
      title,
      description: description || null,
      dueDate:     dueDate ? new Date(dueDate) : null,
    },
  })

  await pushToUser(captain.userId, {
    title: 'New Task Assigned',
    body:  title,
  })

  return NextResponse.json({ task }, { status: 201 })
}

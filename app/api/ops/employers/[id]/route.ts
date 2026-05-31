import { NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getTokenFromCookies()
  if (!token || token.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employer = await prisma.employerProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, phone: true, isActive: true, createdAt: true } },
      shifts: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, title: true, status: true, startTime: true, workersNeeded: true,
          bookings: { select: { id: true, status: true } },
        },
      },
    },
  })

  if (!employer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ employer })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const booking = await prisma.booking.findUnique({ where: { id: params.id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data:  { status: 'COMPLETED', checkOutTime: new Date() },
  })

  await prisma.workerProfile.update({
    where: { id: booking.workerProfileId },
    data:  { totalShifts: { increment: 1 }, totalEarnings: { increment: booking.workerEarning } },
  })

  return NextResponse.json({ booking: updated })
}

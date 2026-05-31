import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  // Allow ADMIN/OPS through too — staff (and founders) need the same view
  // when impersonating or auditing. The data filter below still scopes to
  // payload.userId so ADMIN sees only bookings under their own user.
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bookings = await prisma.booking.findMany({
    where: { employerId: payload.userId },
    include: {
      shift: true,
      worker: { include: { user: { select: { name: true, avatar: true } } } },
      payment: true,
      ratings: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ bookings })
}

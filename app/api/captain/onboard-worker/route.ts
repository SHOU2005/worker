import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain || captain.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Captain account not yet active' }, { status: 403 })
  }

  const { name, phone, city, skills } = await req.json()
  if (!name || !phone || phone.length !== 10) {
    return NextResponse.json({ error: 'Name and valid 10-digit phone required' }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({ where: { phone } })
  if (existing) return NextResponse.json({ error: 'Phone already registered' }, { status: 409 })

  const user = await prisma.user.create({
    data: {
      phone,
      name,
      role:              'WORKER',
      password:          '',
      captainReferralId: captain.id,
    },
  })
  await prisma.workerProfile.create({
    data: {
      userId:            user.id,
      city:              city || '',
      skills:            Array.isArray(skills) ? skills : [],
      captainReferralId: captain.id,
    },
  })

  return NextResponse.json({ success: true, userId: user.id }, { status: 201 })
}

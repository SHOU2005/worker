import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const captain = await prisma.captainProfile.findUnique({ where: { userId: payload.userId } })
  if (!captain) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const [employers, workers] = await Promise.all([
    prisma.user.findMany({
      where:   { captainReferralId: captain.id, role: 'EMPLOYER' },
      include: { employerProfile: { select: { companyName: true, verifiedByOpsAt: true, totalShifts: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where:   { captainReferralId: captain.id, role: 'WORKER' },
      include: { workerProfile: { select: { kycStatus: true, totalShifts: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const safeEmployers = employers.map(({ password: _, ...u }) => u)
  const safeWorkers   = workers.map(({ password: _, ...u }) => u)

  return NextResponse.json({ employers: safeEmployers, workers: safeWorkers })
}

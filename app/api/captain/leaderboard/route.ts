import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const captains = await prisma.captainProfile.findMany({
    where:   { status: 'ACTIVE' },
    include: {
      user:        { select: { name: true, avatar: true } },
      commissions: {
        where:  { createdAt: { gte: startOfMonth } },
        select: { amount: true },
      },
    },
    orderBy: { totalEarnings: 'desc' },
  })

  const ranked = captains.map((c, idx) => ({
    rank:            idx + 1,
    id:              c.id,
    userId:          c.userId,
    name:            c.user.name,
    avatar:          c.user.avatar,
    territory:       c.territory,
    totalEarnings:   c.totalEarnings,
    earnedThisMonth: c.commissions.reduce((s, x) => s + x.amount, 0),
    isMe:            c.userId === payload.userId,
  }))

  return NextResponse.json({ leaderboard: ranked })
}

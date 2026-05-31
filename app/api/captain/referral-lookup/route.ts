import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase().trim()
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })

  const profile = await prisma.captainProfile.findUnique({
    where:   { referralCode: code },
    include: { user: { select: { name: true } } },
  })
  if (!profile) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })

  return NextResponse.json({ captainId: profile.id, captainName: profile.user.name })
}

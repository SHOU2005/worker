import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await prisma.platformSetting.findMany()
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
  return NextResponse.json({ settings: map })
}

export async function PATCH(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updates = await req.json() as Record<string, string>
  for (const [key, value] of Object.entries(updates)) {
    await prisma.platformSetting.upsert({
      where:  { key },
      create: { key, value },
      update: { value },
    })
  }
  return NextResponse.json({ success: true })
}

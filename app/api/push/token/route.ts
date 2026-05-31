import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  // Add to fcmTokens array if not already present (multi-device support)
  const existing = await prisma.user.findUnique({
    where:  { id: payload.userId },
    select: { fcmTokens: true },
  })
  const set = new Set(existing?.fcmTokens ?? [])
  if (!set.has(token)) {
    set.add(token)
    await prisma.user.update({
      where: { id: payload.userId },
      data:  { fcmTokens: { set: Array.from(set) }, fcmToken: token /* legacy field kept in sync */ },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json().catch(() => ({ token: null }))

  if (token && typeof token === 'string') {
    const existing = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { fcmTokens: true },
    })
    const next = (existing?.fcmTokens ?? []).filter(t => t !== token)
    await prisma.user.update({
      where: { id: payload.userId },
      data:  { fcmTokens: { set: next }, fcmToken: null },
    })
  } else {
    // Clear every token (used on full logout)
    await prisma.user.update({
      where: { id: payload.userId },
      data:  { fcmTokens: { set: [] }, fcmToken: null },
    })
  }

  return NextResponse.json({ success: true })
}

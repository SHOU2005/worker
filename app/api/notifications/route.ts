import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = getTokenFromCookies()
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const notifications = await prisma.notification.findMany({
      where:   { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })

    const unread = notifications.filter(n => !n.read).length

    return NextResponse.json({ notifications, unread })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/notifications GET] failed:', msg)
    // Fail open — return empty list so the UI doesn't blow up with a JSON parse error.
    return NextResponse.json({
      notifications: [],
      unread: 0,
      error: msg,
    }, { status: 200 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const ids  = (body && Array.isArray(body.ids)) ? body.ids as string[] : null

    if (ids) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: { id: { in: ids }, userId: payload.userId },
        data:  { read: true },
      })
    } else {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { userId: payload.userId, read: false },
        data:  { read: true },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/notifications PATCH] failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

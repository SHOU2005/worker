import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies, COOKIE_CONFIG } from '@/lib/auth'

/**
 * Bumps User.tokenVersion. Every existing JWT immediately becomes invalid because
 * lib/session.ts checks token.v >= user.tokenVersion. Also clears push tokens so
 * old devices stop receiving notifications.
 */
export async function POST() {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.user.update({
    where: { id: payload.userId },
    data:  {
      tokenVersion: { increment: 1 },
      fcmTokens:    { set: [] },
      fcmToken:     null,
    },
  })

  // Clear the cookie on this client too
  const res = NextResponse.json({ success: true })
  res.cookies.set(COOKIE_CONFIG.name, '', { ...COOKIE_CONFIG.options, maxAge: 0 })
  return res
}

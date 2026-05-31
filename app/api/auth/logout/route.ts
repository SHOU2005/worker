import { NextResponse } from 'next/server'
import { COOKIE_CONFIG, getTokenFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const payload = getTokenFromCookies()

  // Clear the user's FCM tokens BEFORE we drop the auth cookie. Without
  // this, if a different user logs in on the same device (shared phone,
  // worker handover), they inherit push notifications for the previous
  // account because the token stays in users.fcm_tokens. We clear ALL
  // tokens for the user — workers/employers are overwhelmingly single-
  // device, and any second device just re-registers on next page load.
  if (payload?.userId) {
    await prisma.user.update({
      where: { id: payload.userId },
      data:  { fcmTokens: { set: [] }, fcmToken: null },
    }).catch(() => { /* best-effort — never block logout on a DB hiccup */ })
  }

  const res = NextResponse.json({ message: 'Logged out' })
  // cookies.delete() with just the name doesn't always overwrite a cookie
  // that was originally set with explicit path / sameSite / secure options.
  // Setting an empty value with the SAME options + maxAge:0 + expires:past
  // is the bulletproof way to actually clear the auth token.
  res.cookies.set(COOKIE_CONFIG.name, '', {
    ...COOKIE_CONFIG.options,
    maxAge: 0,
    expires: new Date(0),
  })
  return res
}

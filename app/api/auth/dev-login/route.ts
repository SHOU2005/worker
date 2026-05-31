import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signToken, COOKIE_CONFIG } from '@/lib/auth'

// POST /api/auth/dev-login  — DEV ONLY
//
// Bypasses Firebase Phone Auth so worker/employer/captain accounts can be
// logged in during local Capacitor live-reload testing where Firebase
// rejects 192.168.x.x as an authorised domain.
//
// Hard-gated by NODE_ENV so this endpoint cannot ship to production builds.
// If the build is somehow production but this file ships, the gate returns
// 404 — production cannot leak a backdoor by hitting this URL.
//
// Body: { phone: "9205617375" }
// Behaviour: looks up the user by phone, signs a JWT, sets the auth cookie,
// returns { user: {...} }. No OTP, no SMS, no Firebase.

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as { phone?: string }
  const phone = String(body.phone ?? '').replace(/\D/g, '').slice(-10)
  if (phone.length !== 10) {
    return NextResponse.json({ error: 'Enter a 10-digit phone' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({
    where:  { phone },
    select: { id: true, name: true, phone: true, role: true },
  })
  if (!user) {
    return NextResponse.json({ error: `No user with phone ${phone}` }, { status: 404 })
  }

  const token = signToken({ userId: user.id, role: user.role, phone: user.phone })
  cookies().set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)

  return NextResponse.json({ user })
}

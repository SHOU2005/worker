import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, signToken, COOKIE_CONFIG } from '@/lib/auth'
import { hit, ipKey } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  phone:    z.string().length(10),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    // IP rate limit on login: 10 attempts/IP/15 min
    const ipRl = hit(ipKey(req, 'login'), 10, 15 * 60 * 1000)
    if (!ipRl.ok) {
      return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
    }

    const body = await req.json()
    const data = schema.parse(body)

    // Per-phone limit: 8 attempts/phone/15 min — slows down credential stuffing
    const phRl = hit(`login:phone:${data.phone}`, 8, 15 * 60 * 1000)
    if (!phRl.ok) {
      return NextResponse.json({ error: 'Too many failed attempts for this number. Try again later.' }, { status: 429 })
    }

    // Explicit selects — avoids reading new schema columns that may not exist
    // in DB yet (deletedAt, locationSharingConsent) before migration runs.
    // Legacy password login. With per-role accounts, the same phone can
    // map to multiple users — pick the first one with a matching
    // password. New mobile clients use the Firebase OTP flow which
    // is role-aware; this is just for the legacy web admin UI.
    const candidates = await prisma.user.findMany({
      where:  { phone: data.phone },
      select: {
        id: true, name: true, phone: true, role: true, password: true,
        isActive: true, tokenVersion: true, avatar: true,
        workerProfile:   { select: { id: true, kycStatus: true, totalShifts: true, totalEarnings: true, rating: true, profilePhoto: true, city: true, skills: true } },
        employerProfile: { select: { id: true, companyName: true, businessType: true, city: true, address: true, logo: true, totalShifts: true, rating: true, verifiedByOpsAt: true } },
      },
    })
    let user: (typeof candidates)[number] | null = null
    for (const cand of candidates) {
      if (cand.password && await comparePassword(data.password, cand.password)) { user = cand; break }
    }

    if (!user) {
      if (candidates.length === 0) {
        return NextResponse.json({ error: 'Phone not registered. Please create an account.' }, { status: 401 })
      }
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    const token = signToken({ userId: user.id, role: user.role as 'EMPLOYER' | 'WORKER' | 'ADMIN' | 'CAPTAIN' | 'OPS', phone: user.phone, v: user.tokenVersion ?? 0 })

    const res = NextResponse.json({
      user: {
        id:              user.id,
        name:            user.name,
        phone:           user.phone,
        role:            user.role,
        avatar:          user.avatar,
        workerProfile:   user.workerProfile,
        employerProfile: user.employerProfile,
      },
    })

    res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return res
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

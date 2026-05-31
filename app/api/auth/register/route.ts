import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signToken, COOKIE_CONFIG } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  name:         z.string().min(2),
  phone:        z.string().length(10),
  password:     z.string().min(6),
  role:         z.enum(['EMPLOYER', 'WORKER']),
  city:         z.string().optional(),
  companyName:  z.string().optional(),
  ownerName:    z.string().optional(),
  referralCode: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const hashed = await hashPassword(data.password)

    // Resolve captain referral code to captainProfileId
    let captainRefId: string | undefined
    if (data.referralCode) {
      const cap = await prisma.captainProfile.findUnique({
        where: { referralCode: data.referralCode.toUpperCase().trim() },
      })
      if (cap) captainRefId = cap.id
    }

    // Per-role lookup — the same phone may already hold OTHER role
    // accounts (e.g. a worker signing up for an employer account on
    // the same number). We only care about a row that already exists
    // for THIS role.
    const existing = await prisma.user.findFirst({ where: { phone: data.phone, role: data.role } })

    if (existing) {
      // Allow re-registration only if no password was set (old Firebase OTP account)
      if (existing.password) {
        return NextResponse.json({ error: 'Phone already registered. Please login.' }, { status: 409 })
      }

      // Migrate: set password and ensure profile exists
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name:     data.name,
          password: hashed,
          ...(captainRefId ? { captainReferralId: captainRefId } : {}),
        },
        include: { employerProfile: true, workerProfile: true },
      })

      if (data.role === 'EMPLOYER' && !user.employerProfile) {
        await prisma.employerProfile.create({
          data: {
            userId: user.id,
            city: data.city,
            companyName: data.companyName,
            ownerName: data.ownerName,
            ...(captainRefId ? { captainReferralId: captainRefId } : {}),
          },
        })
      } else if (data.role === 'WORKER' && !user.workerProfile) {
        await prisma.workerProfile.create({
          data: {
            userId: user.id,
            city: data.city,
            ...(captainRefId ? { captainReferralId: captainRefId } : {}),
          },
        })
      }

      const token = signToken({ userId: user.id, role: data.role, phone: user.phone, v: user.tokenVersion ?? 0 })
      const res = NextResponse.json({ user: { id: user.id, name: user.name, phone: user.phone, role: data.role } }, { status: 200 })
      res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
      return res
    }

    // New user
    const user = await prisma.user.create({
      data: {
        name:     data.name,
        phone:    data.phone,
        password: hashed,
        role:     data.role,
        ...(captainRefId ? { captainReferralId: captainRefId } : {}),
        ...(data.role === 'EMPLOYER'
          ? { employerProfile: { create: {
              city: data.city,
              companyName: data.companyName,
              ownerName: data.ownerName,
              ...(captainRefId ? { captainReferralId: captainRefId } : {}),
            } } }
          : { workerProfile: { create: {
              city: data.city,
              ...(captainRefId ? { captainReferralId: captainRefId } : {}),
            } } }),
      },
      include: { employerProfile: true, workerProfile: true },
    })

    const token = signToken({ userId: user.id, role: user.role as 'EMPLOYER' | 'WORKER', phone: user.phone, v: user.tokenVersion ?? 0 })
    const res = NextResponse.json({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } }, { status: 201 })
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

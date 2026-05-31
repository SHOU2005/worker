import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signToken, COOKIE_CONFIG } from '@/lib/auth'

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SW'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genCode()
    const existing = await prisma.captainProfile.findUnique({ where: { referralCode: code } })
    if (!existing) return code
  }
  return genCode() + Date.now().toString(36).slice(-3).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const { phone, name, password, city } = await req.json()

    if (!phone || !name?.trim() || !password) {
      return NextResponse.json({ error: 'Phone, name and password are required' }, { status: 400 })
    }
    if (!/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const hashed = await hashPassword(password)
    // Per-role: look up the CAPTAIN row for this phone specifically.
    // Other rows (worker / employer) on the same number are unrelated.
    const existing = await prisma.user.findFirst({
      where:   { phone, role: 'CAPTAIN' },
      include: { captainProfile: true },
    })

    if (existing) {
      // Allow re-registration only if no password was set (old Firebase OTP account)
      if (existing.password) {
        return NextResponse.json({ error: 'Phone already registered. Please login.' }, { status: 409 })
      }

      // Role lock — refuse to convert an existing WORKER/EMPLOYER/OPS into a
      // CAPTAIN. Only an unset placeholder (no role assigned beyond the default
      // WORKER stub) or an existing CAPTAIN-without-password may proceed.
      if (existing.role !== 'CAPTAIN' && existing.role !== 'WORKER') {
        return NextResponse.json({
          error: `This number is registered as a ${existing.role.toLowerCase()}. Please use the ${existing.role.toLowerCase()} app to log in.`,
          code:  'WRONG_APP_FOR_ROLE',
          registeredRole: existing.role,
        }, { status: 403 })
      }
      if (existing.role === 'WORKER') {
        return NextResponse.json({
          error: 'This number is registered as a worker. Please use the worker app to log in.',
          code:  'WRONG_APP_FOR_ROLE',
          registeredRole: 'WORKER',
        }, { status: 403 })
      }

      // Migrate: set password and ensure captain profile exists
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: name.trim(), password: hashed },
      })

      if (!existing.captainProfile) {
        await prisma.captainProfile.create({
          data: { userId: existing.id, territory: city?.trim() || null, status: 'PENDING', referralCode: await uniqueReferralCode() },
        })
      }

      const token = signToken({ userId: existing.id, role: 'CAPTAIN', phone: existing.phone, v: existing.tokenVersion ?? 0 })
      const res = NextResponse.json({ success: true, role: 'CAPTAIN' })
      res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
      return res
    }

    // New user
    const user = await prisma.user.create({
      data: { phone, name: name.trim(), role: 'CAPTAIN', password: hashed },
    })

    await prisma.captainProfile.create({
      data: { userId: user.id, territory: city?.trim() || null, status: 'PENDING', referralCode: await uniqueReferralCode() },
    })

    const token = signToken({ userId: user.id, role: 'CAPTAIN', phone: user.phone, v: user.tokenVersion ?? 0 })
    const res = NextResponse.json({ success: true, role: 'CAPTAIN' })
    res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('captain-register error:', msg)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? `Registration failed: ${msg}` : 'Registration failed. Try again.' },
      { status: 500 }
    )
  }
}

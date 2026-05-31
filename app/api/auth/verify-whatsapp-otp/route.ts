import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, COOKIE_CONFIG } from '@/lib/auth'
import { isValidRole } from '@/lib/config'
import { randomInt } from 'crypto'

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SW'
  for (let i = 0; i < 6; i++) code += chars[randomInt(0, chars.length)]
  return code
}
async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genCode()
    const exists = await prisma.captainProfile.findUnique({ where: { referralCode: code } })
    if (!exists) return code
  }
  return genCode() + Date.now().toString(36).slice(-3).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const { phone, otp, role, name, referralCode } = await req.json()

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 })
    }

    const record = await prisma.otpLog.findFirst({
      where: {
        phone,
        otp: String(otp),
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 })
    }

    if (role && !isValidRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Disallow OTP self-onboarding for OPS/ADMIN — staff must be created via admin dashboard.
    const requestedRole = role as 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN' | undefined
    if (requestedRole === 'OPS' || requestedRole === 'ADMIN') {
      const existing = await prisma.user.findFirst({
        where:  { phone },
        select: { id: true, role: true, opsProfile: { select: { id: true } } },
      })
      if (!existing || (requestedRole === 'OPS' && !existing.opsProfile) || (requestedRole === 'ADMIN' && existing.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Staff account required', code: 'STAFF_ACCOUNT_REQUIRED' }, { status: 403 })
      }
    }

    let captainRefId: string | undefined
    if (referralCode) {
      const cap = await prisma.captainProfile.findUnique({
        where: { referralCode: String(referralCode).toUpperCase().trim() },
      })
      if (cap) captainRefId = cap.id
    }

    const user = await prisma.$transaction(async tx => {
      await tx.otpLog.update({ where: { id: record.id }, data: { verified: true } })

      const existing = await tx.user.findFirst({ where: { phone } })
      if (existing) {
        if (name?.trim() && !existing.name) {
          await tx.user.update({ where: { id: existing.id }, data: { name: name.trim() } })
        }
        return existing
      }

      const displayName = name?.trim() || `User ${phone.slice(-4)}`
      if (requestedRole === 'CAPTAIN') {
        const u = await tx.user.create({ data: { phone, name: displayName, role: 'CAPTAIN', password: '' } })
        await tx.captainProfile.create({ data: { userId: u.id, status: 'PENDING', referralCode: await uniqueReferralCode() } })
        return u
      }
      const userRole = requestedRole === 'EMPLOYER' ? 'EMPLOYER' : 'WORKER'
      const u = await tx.user.create({
        data: { phone, name: displayName, role: userRole, password: '', ...(captainRefId && { captainReferralId: captainRefId }) },
      })
      if (userRole === 'WORKER') {
        await tx.workerProfile.create({ data: { userId: u.id, ...(captainRefId && { captainReferralId: captainRefId }) } })
      } else {
        await tx.employerProfile.create({ data: { userId: u.id, ...(captainRefId && { captainReferralId: captainRefId }) } })
      }
      return u
    })

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    let tokenRole: 'EMPLOYER' | 'WORKER' | 'ADMIN' | 'CAPTAIN' | 'OPS' = user.role
    if (requestedRole && requestedRole !== user.role) {
      const profile = (
        requestedRole === 'CAPTAIN'  ? await prisma.captainProfile.findUnique({ where: { userId: user.id } })  :
        requestedRole === 'OPS'      ? await prisma.opsProfile.findUnique({ where: { userId: user.id } })      :
        requestedRole === 'EMPLOYER' ? await prisma.employerProfile.findUnique({ where: { userId: user.id } }) :
        requestedRole === 'WORKER'   ? await prisma.workerProfile.findUnique({ where: { userId: user.id } })   :
        null
      )
      if (profile) tokenRole = requestedRole
    }

    const token = signToken({ userId: user.id, role: tokenRole, phone: user.phone, v: user.tokenVersion ?? 0 })
    const res = NextResponse.json({ success: true, role: tokenRole })
    res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return res
  } catch (err) {
    console.error('verify-whatsapp-otp error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, COOKIE_CONFIG } from '@/lib/auth'
import { isValidRole } from '@/lib/config'
import { hit, ipKey } from '@/lib/rate-limit'
import { randomInt } from 'crypto'

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SW'
  for (let i = 0; i < 6; i++) code += chars[randomInt(0, chars.length)]
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
    // IP rate limit: 30 verify attempts/IP/15min — stops OTP brute-force
    const rl = hit(ipKey(req, 'verify-otp'), 30, 15 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const { phone, otp, role, referralCode } = await req.json()

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 })
    }

    // Verify OTP from database
    const record = await prisma.otpLog.findFirst({
      where: {
        phone,
        otp:      String(otp),
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

    // Resolve referral code → captainProfileId (lookup outside the tx; immutable)
    let captainRefId: string | undefined
    if (referralCode) {
      const cap = await prisma.captainProfile.findUnique({ where: { referralCode: String(referralCode).toUpperCase().trim() } })
      if (cap) captainRefId = cap.id
    }

    // OPS and ADMIN cannot self-onboard via OTP. They must be created by an
    // existing OPS/ADMIN through the admin dashboard. Captain self-onboard is
    // allowed but starts in PENDING status (an admin must activate them).
    const requestedRole = role as 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN' | undefined
    if (requestedRole === 'OPS' || requestedRole === 'ADMIN') {
      const existing = await prisma.user.findFirst({
        where:  { phone },
        select: { id: true, role: true, opsProfile: { select: { id: true } } },
      })
      if (!existing || (requestedRole === 'OPS' && !existing.opsProfile) || (requestedRole === 'ADMIN' && existing.role !== 'ADMIN')) {
        return NextResponse.json({
          error: 'This phone is not registered as a staff account. Contact your administrator.',
          code:  'STAFF_ACCOUNT_REQUIRED',
        }, { status: 403 })
      }
    }

    // Find or create user + role-specific profile inside a single transaction so
    // a partial failure can't leave a User without their profile (or vice versa).
    const user = await prisma.$transaction(async tx => {
      // Mark OTP used inside the tx so a retry can't reuse it
      await tx.otpLog.update({ where: { id: record.id }, data: { verified: true } })

      const existing = await tx.user.findFirst({ where: { phone } })
      if (existing) return existing

      // Self-service signup flows. OPS/ADMIN already rejected above.
      if (requestedRole === 'CAPTAIN') {
        const u = await tx.user.create({
          data: { phone, name: `Captain ${phone.slice(-4)}`, role: 'CAPTAIN', password: '' },
        })
        await tx.captainProfile.create({
          data: { userId: u.id, status: 'PENDING', referralCode: await uniqueReferralCode() },
        })
        return u
      }

      const userRole = requestedRole === 'EMPLOYER' ? 'EMPLOYER' : 'WORKER'
      const u = await tx.user.create({
        data: {
          phone,
          name: `User ${phone.slice(-4)}`,
          role: userRole,
          password: '',
          ...(captainRefId && { captainReferralId: captainRefId }),
        },
      })
      if (userRole === 'WORKER') {
        await tx.workerProfile.create({ data: { userId: u.id, ...(captainRefId && { captainReferralId: captainRefId }) } })
      } else {
        await tx.employerProfile.create({ data: { userId: u.id, ...(captainRefId && { captainReferralId: captainRefId }) } })
      }
      return u
    })

    // Honour cross-app role switching ONLY when the user already has that profile.
    // No on-the-fly profile creation, no admin auto-promotion.
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

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account suspended. Contact support.' }, { status: 403 })
    }

    const token = signToken({ userId: user.id, role: tokenRole, phone: user.phone, v: user.tokenVersion ?? 0 })

    const res = NextResponse.json({ success: true, role: tokenRole })
    res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return res
  } catch (err) {
    console.error('verify-otp error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

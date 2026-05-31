import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOtp } from '@/lib/auth'
import { sendSMS } from '@/lib/sms'
import { ADMIN_PHONE } from '@/lib/config'
import { hit, ipKey } from '@/lib/rate-limit'

const RATE_LIMIT_SECONDS = 60

export async function POST(req: NextRequest) {
  try {
    // IP-level: 20 OTPs / IP / hour
    const ipRl = hit(ipKey(req, 'otp'), 20, 60 * 60 * 1000)
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: 'Too many requests from this device. Try again later.' },
        { status: 429 }
      )
    }

    const { phone, mode } = await req.json()

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }

    // Per-phone hourly cap: 5 OTPs / phone / hour
    const phRl = hit(`otp:phone:${phone}`, 5, 60 * 60 * 1000)
    if (!phRl.ok) {
      return NextResponse.json(
        { error: 'Too many OTPs for this number. Try again in an hour.' },
        { status: 429 }
      )
    }

    // Login mode: reject unregistered numbers (admin phone always allowed)
    if (mode === 'login' && phone !== ADMIN_PHONE) {
      const user = await prisma.user.findFirst({ where: { phone } })
      if (!user) {
        return NextResponse.json(
          { notRegistered: true, error: 'Number not registered. Please create an account.' },
          { status: 404 }
        )
      }
    }

    // Rate limit: one OTP per RATE_LIMIT_SECONDS per number
    const recent = await prisma.otpLog.findFirst({
      where: {
        phone,
        createdAt: { gt: new Date(Date.now() - RATE_LIMIT_SECONDS * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recent) {
      const waitSecs = Math.ceil(
        (recent.createdAt.getTime() + RATE_LIMIT_SECONDS * 1000 - Date.now()) / 1000
      )
      return NextResponse.json(
        { error: `Please wait ${waitSecs}s before requesting another OTP` },
        { status: 429 }
      )
    }

    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Invalidate previous OTPs for this phone
    await prisma.otpLog.updateMany({
      where: { phone, verified: false },
      data:  { verified: true },
    })

    await prisma.otpLog.create({ data: { phone, otp, expiresAt } })

    await sendSMS(phone, otp)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-otp error:', err)
    return NextResponse.json({ error: 'Failed to send OTP. Try again.' }, { status: 500 })
  }
}

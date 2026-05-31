import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, signToken, COOKIE_CONFIG } from '@/lib/auth'
import { ADMIN_PHONE } from '@/lib/config'

export async function POST(req: NextRequest) {
  try {
    const { phone, password } = await req.json()

    if (!phone || !password) {
      return NextResponse.json({ error: 'Phone and password required' }, { status: 400 })
    }
    if (!/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }

    // Explicit select avoids Prisma reading new columns that may not exist
    // in DB if the migration hasn't run.
    const user = await prisma.user.findFirst({
      where:  { phone, role: { in: ['OPS', 'ADMIN'] } },
      select: { id: true, phone: true, role: true, password: true, isActive: true, tokenVersion: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    }

    // Only ADMIN or OPS users can access the ops portal
    if (user.role !== 'ADMIN' && user.role !== 'OPS') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    if (!user.password) {
      return NextResponse.json({ error: 'No password set. Contact admin to set up your account.' }, { status: 401 })
    }

    const valid = await comparePassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    await prisma.opsProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    })

    const token = signToken({ userId: user.id, role: 'OPS', phone: user.phone, v: user.tokenVersion ?? 0 })
    const res = NextResponse.json({ success: true, role: 'OPS' })
    res.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return res
  } catch (err) {
    console.error('ops-login error:', err)
    return NextResponse.json({ error: 'Login failed. Try again.' }, { status: 500 })
  }
}

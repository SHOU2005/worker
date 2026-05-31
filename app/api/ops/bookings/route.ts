import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'OPS' && payload.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = req.nextUrl.searchParams.get('status') || undefined
    const from   = req.nextUrl.searchParams.get('from')
    const to     = req.nextUrl.searchParams.get('to')
    const page   = parseInt(req.nextUrl.searchParams.get('page') || '1')
    const limit  = 20

    const where = {
      ...(status && { status: status as never }),
      ...(from   && { createdAt: { gte: new Date(from) } }),
      ...(to     && { createdAt: { lte: new Date(to) } }),
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          shift:    { select: { id: true, title: true, date: true, city: true, address: true, startTime: true, endTime: true, hourlyRate: true, duration: true } },
          worker:   { include: { user: { select: { name: true, phone: true } } } },
          employer: { select: { name: true, phone: true } },
          payment:  true,
        },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.booking.count({ where }),
    ])

    // Attach the latest active job OTP to every booking. OTPs are stored in
    // OtpLog with phone=`job_<shiftId>` (see /api/employer/jobs/[id]/otp).
    // OPS sees them so they can help workers/employers if the share fails.
    const shiftIds = Array.from(new Set(bookings.map(b => b.shift?.id).filter(Boolean) as string[]))
    const otpRows = shiftIds.length
      ? await prisma.otpLog.findMany({
          where:  { phone: { in: shiftIds.map(id => `job_${id}`) } },
          orderBy: { createdAt: 'desc' },
        })
      : []
    const latestOtpByShift: Record<string, { otp: string; expiresAt: Date; verified: boolean } | undefined> = {}
    for (const row of otpRows) {
      const sid = row.phone.replace(/^job_/, '')
      if (!latestOtpByShift[sid]) latestOtpByShift[sid] = { otp: row.otp, expiresAt: row.expiresAt, verified: row.verified }
    }
    const enriched = bookings.map(b => ({
      ...b,
      jobOtp: b.shift?.id ? latestOtpByShift[b.shift.id] ?? null : null,
    }))

    return NextResponse.json({ bookings: enriched, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ops/bookings] failed:', msg)
    return NextResponse.json({
      bookings: [], total: 0, page: 1, pages: 0,
      error: msg,
    }, { status: 200 })
  }
}

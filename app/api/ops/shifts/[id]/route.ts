import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Single-shift detail view for OPS — full shift fields, employer contact,
// every booking with worker contact + on-shift timer state, and the latest
// active job OTP. Used by /ops/shifts/[id].
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'OPS' && payload.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const shift = await prisma.shift.findUnique({
      where:   { id: params.id },
      include: {
        employer: { include: { user: { select: { name: true, phone: true, role: true } } } },
        bookings: {
          orderBy: { createdAt: 'asc' },
          include: { worker: { include: { user: { select: { name: true, phone: true } } } } },
        },
      },
    })
    if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

    const otpRow = await prisma.otpLog.findFirst({
      where:   { phone: `job_${shift.id}` },
      orderBy: { createdAt: 'desc' },
    })

    const activeBookingCount = shift.bookings.filter(b => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)).length

    return NextResponse.json({
      shift: {
        ...shift,
        activeBookings: activeBookingCount,
        vacancyLeft:    Math.max(0, shift.workersNeeded - activeBookingCount),
        source:         shift.razorpayOrderId ? 'employer' : 'ops',
      },
      jobOtp: otpRow ? {
        otp:        otpRow.otp,
        expiresAt:  otpRow.expiresAt,
        verified:   otpRow.verified,
        createdAt:  otpRow.createdAt,
      } : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    console.error('[/api/ops/shifts/[id]] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

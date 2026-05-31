import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const city     = searchParams.get('city')
  const role     = searchParams.get('role')
  const dateStr  = searchParams.get('date')
  const duration = searchParams.get('duration') ? parseInt(searchParams.get('duration')!) : null

  if (payload.role === 'WORKER') {
    // Visibility: every worker can SEE jobs even without a worker profile or
    // KYC. We don't even fetch their profile here — the accept endpoint is
    // where KYC is enforced. But we DO surface the worker's KYC status in
    // the response so the jobs page can show an actionable empty state
    // ("Re-submit documents" / "Verification pending") instead of the
    // generic "All caught up" when the real reason they see no shifts is
    // a KYC block.
    const wp = await prisma.workerProfile.findUnique({
      where:  { userId: payload.userId },
      select: { kycStatus: true },
    })
    const kycStatus = wp?.kycStatus ?? null
    const kycMessage =
      kycStatus === 'REJECTED' ? 'Your documents were rejected — re-submit to start accepting jobs.'
      : kycStatus === 'PENDING'  ? 'Your documents are being verified — you\'ll see jobs as soon as it\'s approved.'
      : ''

    // No implicit date cap — workers see EVERY open + paid shift. The status
    // filter (`OPEN`) already hides anything assigned, in-progress or completed.
    // A `date` filter is only applied when the worker explicitly picks one.
    const dateFilter = dateStr
      ? { gte: new Date(dateStr + 'T00:00:00'), lt: new Date(dateStr + 'T23:59:59') }
      : null

    // No city / KYC / availability / "already-applied" filter — every worker
    // sees every active shift. Only `status='OPEN'` (hide already-assigned or
    // completed jobs) and `paymentStatus='PAID'` (hide unpaid) remain, since
    // those represent shifts genuinely unavailable to anyone.
    const shifts = await prisma.shift.findMany({
      where: {
        status:        'OPEN',
        paymentStatus: 'PAID',
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(role     ? { role }     : {}),
        ...(duration ? { duration } : {}),
      },
      // Pull the employer's avg rating + total-shift-count so the worker
      // can decide based on track record before swiping accept. Was only
      // returning name/avatar before.
      include: {
        employer: {
          select: {
            companyName: true,
            rating:      true,
            totalShifts: true,
            user:        { select: { name: true, avatar: true } },
          },
        },
      },
      orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
      take:    100,
    })
    return NextResponse.json({ shifts, kycStatus, message: kycMessage })
  }

  if (payload.role === 'EMPLOYER') {
    const employerProfile = await prisma.employerProfile.findUnique({ where: { userId: payload.userId } })
    if (!employerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const shifts = await prisma.shift.findMany({
      where:   { employerProfileId: employerProfile.id },
      include: { bookings: { include: { worker: { include: { user: { select: { name: true, avatar: true } } } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ shifts })
  }

  if (payload.role === 'OPS' || payload.role === 'ADMIN') {
    const shifts = await prisma.shift.findMany({
      include: { employer: { include: { user: { select: { name: true } } } }, bookings: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ shifts })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Direct shift creation is disabled — production flow requires payment first.
// Employers must POST to /api/employer/cart/pay to create a Razorpay order, complete
// payment, then call /api/employer/cart/verify which creates the shift atomically.
export async function POST(_req: NextRequest) {
  return NextResponse.json({
    error:    'Direct shift creation is disabled. Complete payment first.',
    code:     'PAYMENT_REQUIRED',
    payEndpoint: '/api/employer/cart/pay',
    verifyEndpoint: '/api/employer/cart/verify',
  }, { status: 402 })
}

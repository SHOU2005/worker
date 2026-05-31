import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))

// Build a billing message for a shift + (optionally) a Razorpay payment link
// the OPS user can paste into WhatsApp / SMS to the employer.
//
// POST body: { hoursOverride?: number, includePaymentLink?: boolean }
//   - hoursOverride: bill for actual hours worked instead of shift.duration
//                    (use this when the worker stayed longer/shorter)
//   - includePaymentLink: also create a Razorpay payment link, default true
//
// Returns: { totalAmount, perWorker, message, paymentLink? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || !['OPS', 'ADMIN', 'EMPLOYER'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const includePaymentLink: boolean = body.includePaymentLink !== false
  const hoursOverride: number | undefined = typeof body.hoursOverride === 'number' && body.hoursOverride > 0
    ? body.hoursOverride
    : undefined
  // billByMinute=true → use the actual checkInTime → checkOutTime (or now)
  // window for each worker, billed per minute. Default true now per request:
  // OPS bills employer for the time the worker was actually on shift.
  const billByMinute: boolean = body.billByMinute !== false

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: {
      employer: { include: { user: { select: { name: true, phone: true } } } },
      bookings: {
        where:   { status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
        include: { worker: { include: { user: { select: { name: true, phone: true } } } } },
      },
    },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.bookings.length === 0) {
    return NextResponse.json({ error: 'No active bookings on this shift to bill for' }, { status: 400 })
  }

  const rate            = shift.hourlyRate
  const scheduledHours  = shift.duration
  const numWorkers      = shift.bookings.length
  const employerName    = shift.employer?.user?.name ?? 'Employer'

  // Per-worker billing: prorate by actual minutes worked unless OPS forces a
  // flat hoursOverride. A worker who hasn't checked in yet bills 0 (the OPS
  // user can override if a flat-rate engagement was agreed).
  function workerCharge(b: { checkInTime: Date | null; checkOutTime: Date | null }) {
    if (hoursOverride != null) return Math.round(rate * hoursOverride)
    if (billByMinute && b.checkInTime) {
      const start = b.checkInTime.getTime()
      const end   = (b.checkOutTime ?? new Date()).getTime()
      const minutes = Math.max(0, Math.floor((end - start) / 60_000))
      return Math.round(rate * (minutes / 60))
    }
    // Fallback to scheduled duration when no per-worker timing info exists
    return Math.round(rate * scheduledHours)
  }
  function workerMinutes(b: { checkInTime: Date | null; checkOutTime: Date | null }) {
    if (!b.checkInTime) return 0
    const end = (b.checkOutTime ?? new Date()).getTime()
    return Math.max(0, Math.floor((end - b.checkInTime.getTime()) / 60_000))
  }

  let totalAmount = 0
  const workerLines: string[] = []
  for (const b of shift.bookings) {
    const charge  = workerCharge(b)
    const minutes = workerMinutes(b)
    const hh = Math.floor(minutes / 60), mm = minutes % 60
    const timeLabel = hoursOverride != null ? `${hoursOverride}h` : minutes > 0 ? (hh > 0 ? `${hh}h ${mm}m` : `${mm}m`) : '—'
    workerLines.push(`• ${b.worker.user.name} — ${timeLabel} — ₹${charge.toLocaleString('en-IN')}`)
    totalAmount += charge
  }
  const totalPaise = totalAmount * 100

  const lines: string[] = [
    `*Switch — Bill for ${shift.title}*`,
    '',
    `Date: ${new Date(shift.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    `Rate: ₹${rate}/hr per worker (billed per minute)`,
    '',
    `Workers (${numWorkers}):`,
    ...workerLines,
    '',
    `*Total: ₹${totalAmount.toLocaleString('en-IN')}*`,
  ]

  // Optionally create a Razorpay Payment Link so the employer can pay in one tap
  let paymentLink: string | null = null
  let paymentLinkId: string | null = null
  if (includePaymentLink && RZP_CONFIGURED) {
    try {
      const rzpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:    'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64'),
        },
        body: JSON.stringify({
          amount:   totalPaise,
          currency: 'INR',
          description: `${shift.title} · ${numWorkers} worker(s)`,
          customer: {
            name:    employerName,
            contact: shift.employer?.user?.phone ?? undefined,
          },
          notify:        { sms: false, email: false }, // OPS shares the link manually
          reminder_enable: true,
          notes: {
            shiftId:   shift.id,
            createdBy: payload.userId,
            workers:   String(numWorkers),
            ...(hoursOverride != null ? { hoursOverride: String(hoursOverride) } : {}),
          },
          callback_url:    process.env.NEXT_PUBLIC_APP_URL || undefined,
          callback_method: 'get',
        }),
      })
      const data = await rzpRes.json().catch(() => ({}))
      if (rzpRes.ok && data?.short_url) {
        paymentLink   = data.short_url as string
        paymentLinkId = data.id as string
        lines.push('', `Pay: ${paymentLink}`)
      } else {
        console.warn('[invoice] Razorpay link failed:', data)
        lines.push('', `(Could not generate payment link: ${data?.error?.description || 'unknown'})`)
      }
    } catch (err) {
      console.error('[invoice] Razorpay request error:', err)
      lines.push('', '(Payment link unavailable — please contact ops)')
    }
  }

  const message = lines.join('\n')

  return NextResponse.json({
    shiftId:    shift.id,
    title:      shift.title,
    employer:   { name: employerName, phone: shift.employer?.user?.phone ?? null },
    rate,
    numWorkers,
    totalAmount,
    paymentLink,
    paymentLinkId,
    message,
  })
}

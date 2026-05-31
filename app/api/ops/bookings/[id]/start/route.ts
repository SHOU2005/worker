import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// OPS-driven manual shift start. Sets booking.checkInTime + flips status to
// IN_PROGRESS without going through the worker's slide-to-arrive + OTP flow.
// Used when ops are coordinating offline (phone calls, walk-ins) or when a
// worker's GPS / OTP path was blocked.
//
// Body: { checkInTime?: "HH:MM" | ISO-8601 }
//   - HH:MM is interpreted as today (Asia/Kolkata) at that hour:minute
//   - ISO-8601 is taken verbatim
//   - Omitted = "now"
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  let body: { checkInTime?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine — defaults to now */ }

  let checkInTime: Date
  if (!body.checkInTime) {
    checkInTime = new Date()
  } else {
    const raw = String(body.checkInTime).trim()
    if (/^\d{1,2}:\d{2}$/.test(raw)) {
      // HH:MM → today at that time in IST. We construct an ISO string with
      // the +05:30 offset so the resulting Date is unambiguous regardless of
      // the server's locale.
      const [hh, mm] = raw.split(':').map(n => parseInt(n, 10))
      if (hh > 23 || mm > 59) {
        return NextResponse.json({ error: 'checkInTime out of range' }, { status: 400 })
      }
      const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const y = istNow.getFullYear()
      const m = String(istNow.getMonth() + 1).padStart(2, '0')
      const d = String(istNow.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`
      checkInTime = new Date(iso)
    } else {
      const parsed = new Date(raw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'checkInTime must be HH:MM or ISO-8601' }, { status: 400 })
      }
      checkInTime = parsed
    }
  }

  const booking = await prisma.booking.findUnique({
    where:   { id: params.id },
    include: { shift: true, worker: { include: { user: { select: { name: true } } } } },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'COMPLETED') return NextResponse.json({ error: 'Booking already completed' }, { status: 409 })
  if (booking.status === 'CANCELLED') return NextResponse.json({ error: 'Booking cancelled' }, { status: 409 })

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data:  {
      checkInTime,
      status: 'IN_PROGRESS',
    },
    include: { worker: { include: { user: { select: { name: true, phone: true } } } } },
  })

  return NextResponse.json({ booking: updated })
}

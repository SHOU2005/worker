import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { notifyJobStarted } from '@/lib/fcm-server'
import { hit } from '@/lib/rate-limit'
import { randomInt } from 'crypto'

// 4-digit arrival OTP. Brute-force surface (10k codes) is mitigated by:
//   1. 5 wrong attempts per booking → 10-min lock (see PUT below)
//   2. 15-min absolute expiry (down from 80m) — narrows the attack window
//   3. One-time use — verified codes are flipped, replay returns "invalid"
//   4. Per-booking POST cap (10 generations / hour) — stops mass re-rolls
// These guards together keep effective brute-force feasibility well below
// the auth-OTP threshold the codebase reserves 6 digits for.
const OTP_EXPIRY_MS = 15 * 60 * 1000
const OTP_VERIFY_LIMIT = 5
const OTP_VERIFY_LOCK_MS = 10 * 60 * 1000
const OTP_GENERATE_LIMIT = 10
const OTP_GENERATE_WINDOW_MS = 60 * 60 * 1000

// Multi-worker shifts (workersNeeded > 1) need per-booking OTP semantics —
// staggered arrivals mean each worker needs their own code, and only their
// own booking flips to IN_PROGRESS on verify. The OtpLog row is keyed by
// `booking_${bookingId}` instead of the old `job_${shiftId}`.
//
// Backwards compat: if the client omits bookingId we fall back to the
// first CONFIRMED booking on this shift. Old single-worker callers keep
// working unchanged. New employer slot-list UI passes bookingId explicitly.
async function resolveBookingId(shiftId: string, bookingIdFromBody: unknown): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  if (typeof bookingIdFromBody === 'string' && bookingIdFromBody) {
    const b = await prisma.booking.findFirst({
      where: { id: bookingIdFromBody, shiftId },
      select: { id: true },
    })
    if (!b) return { ok: false, error: 'Booking does not belong to this shift' }
    return { ok: true, bookingId: b.id }
  }
  // Backwards-compat fallback only for single-worker shifts. Multi-worker
  // shifts MUST pass bookingId — otherwise we'd resolve to "first booking
  // by appliedAt asc" which has flipped the wrong worker's booking when
  // workers arrive out of application order. Older clients that don't
  // send bookingId on multi-worker shifts now fail loudly instead of
  // silently corrupting state.
  const shift = await prisma.shift.findUnique({
    where:  { id: shiftId },
    select: { workersNeeded: true },
  })
  if (!shift) return { ok: false, error: 'Shift not found' }
  if ((shift.workersNeeded ?? 1) > 1) {
    return { ok: false, error: 'bookingId is required for multi-worker shifts' }
  }
  const first = await prisma.booking.findFirst({
    where:   { shiftId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
    orderBy: { appliedAt: 'asc' },
    select:  { id: true },
  })
  if (!first) return { ok: false, error: 'No active booking on this shift' }
  return { ok: true, bookingId: first.id }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Body is optional — POST historically had no body. New UI sends {bookingId}.
  const body = await req.json().catch(() => ({})) as { bookingId?: string }
  const r = await resolveBookingId(params.id, body.bookingId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

  // Cap mass re-rolls — without this an attacker who finds an authed employer
  // session could exhaust the 10k code space by repeatedly POSTing until the
  // intended worker happens to read the right code, narrowing brute-force.
  const genRl = hit(`arr-otp-gen:${r.bookingId}`, OTP_GENERATE_LIMIT, OTP_GENERATE_WINDOW_MS)
  if (!genRl.ok) {
    return NextResponse.json(
      { error: 'Too many OTP generations on this booking. Try again later.' },
      { status: 429 },
    )
  }

  // 4-digit code via crypto.randomInt — uniform distribution, not Math.random.
  // Pads to 4 chars so leading zeros aren't dropped ("0421" stays "0421").
  const otp = String(randomInt(0, 10000)).padStart(4, '0')
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)

  // Invalidate any previous unverified codes — one active OTP per booking at a time.
  await prisma.otpLog.updateMany({
    where: { phone: `booking_${r.bookingId}`, verified: false },
    data:  { verified: true },
  })

  await prisma.otpLog.create({
    data: { phone: `booking_${r.bookingId}`, otp, expiresAt },
  })

  return NextResponse.json({ otp, expiresAt, bookingId: r.bookingId })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { otp: string; bookingId?: string }
  const { otp } = body
  const r = await resolveBookingId(params.id, body.bookingId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const bookingId = r.bookingId

  // Reject obviously malformed input before touching the DB. Also blocks the
  // accidental case where an old 6-digit client sends a stale code post-migration.
  if (typeof otp !== 'string' || !/^\d{4}$/.test(otp)) {
    return NextResponse.json({ error: 'OTP must be 4 digits' }, { status: 400 })
  }

  // Per-booking attempt limiter. 5 wrong tries → 10-min lock. The key intentionally
  // does NOT include the OTP string — otherwise an attacker could rotate codes to
  // duck the counter. Lock survives across booking re-issues; employer regenerating
  // the code does not reset the lock.
  const verifyRl = hit(`arr-otp-vrf:${bookingId}`, OTP_VERIFY_LIMIT, OTP_VERIFY_LOCK_MS)
  if (!verifyRl.ok) {
    const mins = Math.ceil(verifyRl.resetIn / 60_000)
    return NextResponse.json(
      { error: `Too many wrong attempts. Try again in ${mins} min.` },
      { status: 429 },
    )
  }

  // Ownership/role check — must be done before consulting the OTP log so
  // a leaked OTP from one worker can't be replayed by another. Allowed:
  //   - the worker who owns this booking
  //   - the employer who owns this shift
  //   - OPS / ADMIN for back-office intervention
  // Previous handler only checked `if (!payload)` which let any logged-in
  // user flip any booking they had an OTP for.
  const booking = await prisma.booking.findUnique({
    where:  { id: bookingId },
    select: {
      id: true, status: true, shiftId: true,
      worker: { select: { userId: true } },
      shift:  { select: { employer: { select: { userId: true } } } },
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isWorkerOwner   = payload.role === 'WORKER'   && booking.worker.userId === payload.userId
  const isEmployerOwner = payload.role === 'EMPLOYER' && booking.shift.employer.userId === payload.userId
  const isStaff         = payload.role === 'OPS' || payload.role === 'ADMIN'
  if (!isWorkerOwner && !isEmployerOwner && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const record = await prisma.otpLog.findFirst({
    where: {
      phone:    `booking_${bookingId}`,
      otp,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
  }

  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json({ error: `Booking not in valid state (${booking.status})` }, { status: 400 })
  }

  await prisma.otpLog.update({ where: { id: record.id }, data: { verified: true } })

  // Flip THIS booking only. Shift transitions to IN_PROGRESS the first time
  // any of its bookings starts; subsequent verifies leave shift.status alone.
  const checkIn = new Date()
  await prisma.booking.update({
    where: { id: bookingId },
    data:  { status: 'IN_PROGRESS', checkInTime: checkIn },
  })
  const shift = await prisma.shift.findUnique({ where: { id: params.id }, select: { status: true, title: true } })
  if (shift && shift.status !== 'IN_PROGRESS') {
    await prisma.shift.update({ where: { id: params.id }, data: { status: 'IN_PROGRESS' } })
  }

  if (booking.worker?.userId && shift) {
    notifyJobStarted(booking.worker.userId, shift.title, params.id).catch(console.error)
  }

  return NextResponse.json({ success: true, bookingId })
}

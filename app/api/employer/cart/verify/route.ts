import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { broadcastUrgentJob } from '@/lib/fcm-server'
import { workerEarning as calcWorkerEarning } from '@/lib/pricing'
import { sendTextSMSToMany } from '@/lib/sms'
import { ADMIN_PHONES } from '@/lib/config'

const RZP_KEY_ID     = process.env.RAZORPAY_KEY_ID
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RZP_CONFIGURED = !!(RZP_KEY_ID && RZP_KEY_SECRET && !RZP_KEY_ID.includes('placeholder'))
const razorpay = RZP_CONFIGURED
  ? new Razorpay({ key_id: RZP_KEY_ID!, key_secret: RZP_KEY_SECRET! })
  : null

export async function POST(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  if (!RZP_KEY_SECRET || !razorpay) {
    return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 })
  }

  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = await req.json()
  if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  const expectedSignature = crypto
    .createHmac('sha256', RZP_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')
  if (expectedSignature !== razorpaySignature) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
  }

  // Fetch the original cart context from Razorpay order notes
  let order: { notes?: Record<string, string>; amount?: number }
  try {
    order = await razorpay.orders.fetch(razorpayOrderId) as { notes?: Record<string, string>; amount?: number }
  } catch (err) {
    console.error('Failed to fetch razorpay order:', err)
    return NextResponse.json({ error: 'Could not verify payment with gateway' }, { status: 502 })
  }
  const notes = order.notes || {}
  // Signature only proves Razorpay-side authenticity of the payment
  // fields — it does NOT prove the caller is the same employer who
  // initiated the order. Without this gate, employer A could pay and a
  // separate-session employer B could replay the same payment fields
  // against this endpoint and have the paid Shift attached to their
  // account. Reject the mismatch hard.
  if (String(notes.userId || '') !== String(payload.userId)) {
    console.warn('[cart/verify] notes.userId mismatch', { notes: notes.userId, payload: payload.userId, orderId: razorpayOrderId })
    return NextResponse.json({
      error: 'This payment was initiated by a different account',
      code:  'PAYMENT_OWNER_MISMATCH',
    }, { status: 403 })
  }

  // Idempotency: if a Shift already exists for this razorpayPaymentId, return it
  const existing = await prisma.shift.findFirst({ where: { razorpayPaymentId } })
  if (existing) return NextResponse.json({ shiftId: existing.id, alreadyCreated: true })

  const employerProfile = await prisma.employerProfile.upsert({
    where:  { userId: payload.userId },
    create: { userId: payload.userId },
    update: {},
  })

  const dur        = Number(notes.duration) || 4
  const hourlyRate = Number(notes.hourlyRate) || 200
  const isInstant  = notes.isInstant === '1'
  const workersNeeded = Math.max(1, Math.min(20, Number(notes.workersNeeded) || 1))
  const totalPaise = order.amount || (hourlyRate * dur * workersNeeded * 100)
  // Urgent surcharge is already baked into hourlyRate (₹250 = ₹200 base + ₹50 instant).
  // Storing urgentFee=0 on the Shift so totalAmount can be computed naively as
  // hourlyRate × duration without double-counting. The isUrgent boolean is the
  // source of truth for "was this an instant job".
  const urgentFeePerHour = 0

  const shift = await prisma.shift.create({
    data: {
      title:             notes.title || notes.category || 'Service',
      role:              notes.category || 'Service',
      address:           notes.address || '',
      city:              notes.city || 'Gurgaon',
      lat:               notes.lat ? Number(notes.lat) : null,
      lng:               notes.lng ? Number(notes.lng) : null,
      date:              new Date(notes.date || new Date()),
      startTime:         notes.startTime || '09:00',
      endTime:           notes.endTime || '18:00',
      duration:          dur,
      workersNeeded,
      hourlyRate,
      isUrgent:          isInstant,
      urgentFee:         urgentFeePerHour,
      paymentStatus:     'PAID',
      paymentAmount:     totalPaise / 100,
      razorpayOrderId,
      razorpayPaymentId,
      paidAt:            new Date(),
      status:            'OPEN',
      employerProfileId: employerProfile.id,
    },
  })

  // Single broadcast path for instant AND scheduled jobs — every worker
  // gets a high-priority ring and the notification opens the app on tap.
  // Scheduled jobs previously used pushToUsers with type=NEW_JOB which
  // skipped the urgent_ring sound and showed up as a silent default
  // notification; per ops, every new job should wake every worker.
  const earningPerWorker = calcWorkerEarning(dur)
  broadcastUrgentJob(
    shift.id,
    shift.title,
    shift.address,
    `₹${earningPerWorker.toLocaleString('en-IN')} per worker`,
  ).catch(console.error)

  // Notify admins (DB role=ADMIN, falling back to ADMIN_PHONES env) that an
  // employer just paid for a booking. Fire-and-forget so SMS latency/failure
  // never blocks the verify response.
  ;(async () => {
    const employer = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { name: true, phone: true },
    })
    const adminUsers = await prisma.user.findMany({
      where:  { role: 'ADMIN', deletedAt: null },
      select: { phone: true },
    })
    const phones = Array.from(new Set([
      ...adminUsers.map(u => u.phone),
      ...ADMIN_PHONES,
    ])).filter(Boolean)
    if (!phones.length) return
    const msg =
      `Switch: New booking by ${employer?.name || 'employer'} (${employer?.phone || '-'}). ` +
      `${shift.title} in ${shift.city}, ${workersNeeded} worker(s), ₹${(totalPaise / 100).toLocaleString('en-IN')}. Shift ${shift.id}.`
    await sendTextSMSToMany(phones, msg)
  })().catch(err => console.error('[admin SMS] failed:', err))

  return NextResponse.json({ shiftId: shift.id })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { hit, ipKey } from '@/lib/rate-limit'

// POST /api/worker/jyoti/confirm-call
//
// Triggers an outbound Jyoti voice call to the worker so she can confirm:
//   "Main Jyoti, aapki shift {{shift_title}} confirm ho gayi {{employer_name}} pe.
//    Aap jaoge na?"
//
// Workflow: worker accepts a shift → /api/shifts/[id]/accept calls this route
// → ElevenLabs Twilio outbound API dials the worker → Jyoti agent uses the
// post_accept confirmation branch in her system prompt.
//
// Body: { bookingId: string }
// Auth: OPS / ADMIN can trigger for any booking (back-office). The booking's
// own worker can also self-trigger (e.g. "call me back" UX in the app).

const ELEVENLABS_OUTBOUND_URL = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ipRl = hit(ipKey(req, 'jyoti-call-ip'), 30, 60 * 60 * 1000)
  if (!ipRl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as { bookingId?: string }
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : ''
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

  const booking = await prisma.booking.findUnique({
    where:  { id: bookingId },
    select: {
      id: true, status: true,
      worker: { select: { userId: true, user: { select: { name: true, phone: true } } } },
      shift: {
        select: {
          id: true, title: true, startTime: true, endTime: true,
          address: true, city: true,
          employer: { select: { companyName: true, ownerName: true, user: { select: { name: true, phone: true } } } },
        },
      },
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isOwnBooking = payload.role === 'WORKER' && booking.worker.userId === payload.userId
  const isStaff      = payload.role === 'OPS' || payload.role === 'ADMIN'
  if (!isOwnBooking && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const workerPhone = booking.worker.user?.phone
  if (!workerPhone) return NextResponse.json({ error: 'Worker has no phone' }, { status: 400 })

  // Per-booking cap so a misbehaving client can't loop-dial the worker.
  const callRl = hit(`jyoti-call:${bookingId}`, 3, 30 * 60 * 1000)
  if (!callRl.ok) {
    return NextResponse.json({ error: 'Already called recently. Wait before retrying.' }, { status: 429 })
  }

  const apiKey  = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  const phoneId = process.env.ELEVENLABS_PHONE_NUMBER_ID || 'phnum_2601k7cfr061ew5aa38mjpdhys49'
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'Jyoti is not configured on this server' }, { status: 503 })
  }

  // E.164 — worker phones are stored as 10-digit Indian numbers; prefix +91.
  const digits = String(workerPhone).replace(/\D/g, '')
  const toNumber = digits.length === 10 ? `+91${digits}` : `+${digits}`

  const employer = booking.shift.employer
  // Person's name (e.g. "Saurabh") for "malik ka naam"; company is separate.
  const employerName    = employer?.user?.name || employer?.ownerName || employer?.companyName || 'employer'
  const employerCompany = employer?.companyName || ''

  const callPayload = {
    agent_id: agentId,
    agent_phone_number_id: phoneId,
    to_number: toNumber,
    conversation_initiation_client_data: {
      // Same dynamic vars the in-app session uses, plus call_purpose so the
      // agent's routing rule opens with the post-accept confirmation branch
      // ("aapki shift confirm hai, aap jaoge na?") instead of the in-app
      // "Namaste, kaise help karu" opener.
      dynamic_variables: {
        worker_name:       booking.worker.user?.name || 'bhaiya',
        worker_language:   'hi',
        shift_id:          booking.shift.id,
        booking_id:        booking.id,
        shift_title:       booking.shift.title,
        shift_start_time:  booking.shift.startTime,
        shift_end_time:    booking.shift.endTime || '',
        employer_name:     employerName,
        employer_company:  employerCompany,
        employer_address:  booking.shift.address || booking.shift.city || '',
        has_active_shift:  'yes',
        arrival_completed: 'no',
        shift_status:      booking.status,
        call_purpose:      'post_accept_confirm',
      },
    },
  }

  const res = await fetch(ELEVENLABS_OUTBOUND_URL, {
    method:  'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(callPayload),
    signal:  AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error('[JYOTI confirm-call] upstream error', res.status, errBody.slice(0, 300))
    return NextResponse.json({ error: 'Could not place call', upstream: res.status }, { status: 502 })
  }

  const data = await res.json().catch(() => ({})) as { conversation_id?: string; callSid?: string }
  return NextResponse.json({
    ok: true,
    toNumber,
    conversationId: data.conversation_id,
    callSid:        data.callSid,
  })
}

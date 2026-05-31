import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { hit } from '@/lib/rate-limit'
import { pushToUsers } from '@/lib/fcm-server'
import { broadcastWhatsAppText } from '@/lib/whatsapp'
import { FOUNDER_ADMIN_PHONES } from '@/lib/config'

const VALID_CATEGORIES = new Set([
  'payment', 'refund', 'worker', 'safety', 'app_bug', 'account', 'other',
])

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'EMPLOYER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = hit(`support:escalate:${payload.userId}`, 5, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many tickets opened. Please wait an hour before raising another.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const transcript = Array.isArray(body?.transcript) ? body.transcript : []
  const rawCategory = typeof body?.category === 'string' ? body.category : 'other'
  const category   = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'other'
  const summary    = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 500) : ''
  const bookingId  = typeof body?.bookingId === 'string' && body.bookingId.length > 0 ? body.bookingId : null

  if (transcript.length === 0 || !summary) {
    return NextResponse.json({ error: 'Need a summary and at least one message' }, { status: 400 })
  }

  // Pull a clean transcript copy — strip anything other than {role, text, ts}.
  const cleanTranscript = transcript
    .filter((m: any) => (m?.role === 'user' || m?.role === 'bot') && typeof m?.text === 'string')
    .slice(-30)
    .map((m: any) => ({
      role: m.role,
      text: String(m.text).slice(0, 2000),
      ts:   typeof m?.ts === 'number' ? m.ts : Date.now(),
    }))

  const ticket = await prisma.complaint.create({
    data: {
      reportedBy:  payload.userId,
      against:     'switch_support',
      type:        category,
      description: summary,
      status:      'OPEN',
      source:      'bot_escalation',
      transcript:  cleanTranscript,
      bookingId,
    },
  })

  // Fire-and-forget ops notifications. Failures don't fail the ticket creation.
  notifyOps(ticket.id, summary, category).catch(err =>
    console.error('[support/escalate] ops notify error:', err),
  )

  return NextResponse.json({ ticketId: ticket.id, status: ticket.status })
}

async function notifyOps(ticketId: string, summary: string, category: string): Promise<void> {
  const shortSummary = summary.length > 90 ? summary.slice(0, 87) + '…' : summary
  const link = `https://app.switchlocally.com/ops/complaints/${ticketId}`

  // 1. Push notification to every active ADMIN/OPS user.
  const ops = await prisma.user.findMany({
    where:  { role: { in: ['ADMIN', 'OPS'] }, isActive: true },
    select: { id: true },
  })
  const opsIds = ops.map(o => o.id)
  if (opsIds.length > 0) {
    await pushToUsers(opsIds, {
      title: `New support ticket (${category})`,
      body:  shortSummary,
      data:  { type: 'support_ticket', ticketId },
    }).catch(err => console.error('[support/escalate] pushToUsers error:', err))
  }

  // 2. WhatsApp to founder phones — they get a direct ping even when not in the app.
  await broadcastWhatsAppText(
    FOUNDER_ADMIN_PHONES,
    `🔔 New Switch support ticket (${category})\n\n${shortSummary}\n\nReview: ${link}`,
  ).catch(err => console.error('[support/escalate] whatsapp error:', err))
}

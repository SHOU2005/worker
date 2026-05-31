import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

const ALLOWED_TYPES = ['payment', 'employer', 'safety', 'app_bug', 'other'] as const

export async function POST(req: NextRequest) {
  const sess = await requireSession()
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const body = await req.json().catch(() => ({}))
  const { type, description, against, bookingId } = body

  const t = String(type || 'other').toLowerCase()
  if (!ALLOWED_TYPES.includes(t as typeof ALLOWED_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid complaint type' }, { status: 400 })
  }
  const desc = String(description || '').trim()
  if (desc.length < 10) {
    return NextResponse.json({ error: 'Please describe the issue (min 10 characters)' }, { status: 400 })
  }
  if (desc.length > 2000) {
    return NextResponse.json({ error: 'Description too long (max 2000 characters)' }, { status: 400 })
  }

  const complaint = await prisma.complaint.create({
    data: {
      reportedBy:  payload.userId,
      against:     String(against || '').slice(0, 200),
      type:        t,
      description: desc,
      status:      'OPEN',
      ...(bookingId ? { bookingId: String(bookingId) } : {}),
    },
  })

  return NextResponse.json({ complaint }, { status: 201 })
}

export async function GET() {
  const sess = await requireSession()
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const complaints = await prisma.complaint.findMany({
    where:   { reportedBy: payload.userId },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })
  return NextResponse.json({ complaints })
}

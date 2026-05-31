import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { findMatchingWorkers } from '@/lib/matching'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shift = await prisma.shift.findUnique({
    where:   { id: params.id },
    include: {
      employer: { include: { user: { select: { name: true, avatar: true, phone: true } } } },
      bookings: {
        include: {
          worker: { include: { user: { select: { name: true, avatar: true, phone: true } } } },
          ratings: true,
        },
      },
    },
  })

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const matches = await findMatchingWorkers(params.id)

  return NextResponse.json({ shift, matches })
}

// Whitelist of fields an employer can edit on a shift before it's been
// accepted. PATCH was previously `data: body` (raw spread) — meaning a
// hostile employer could PATCH paymentStatus, hourlyRate, status, etc. and
// either get free shifts or unlock already-locked ones. Anything not in
// this list is silently dropped.
const EMPLOYER_PATCHABLE = ['title', 'role', 'description', 'address', 'mapLink', 'date', 'startTime', 'endTime', 'isUrgent'] as const
type EmployerPatchKey = typeof EMPLOYER_PATCHABLE[number]

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'EMPLOYER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as Record<string, unknown>

  // Verify the shift belongs to this employer AND hasn't been assigned/started
  // yet — once a worker has accepted, the shift is contractually locked.
  const existing = await prisma.shift.findUnique({
    where:  { id: params.id },
    select: { id: true, status: true, employer: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (existing.employer?.userId !== payload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existing.status !== 'OPEN' && existing.status !== 'SEARCHING') {
    return NextResponse.json({ error: 'Shift can only be edited before a worker accepts it' }, { status: 409 })
  }

  // Build a sanitized data object — only known-safe fields pass through.
  const data: Record<string, unknown> = {}
  for (const k of EMPLOYER_PATCHABLE) {
    if (k in body && body[k] !== undefined) {
      data[k as EmployerPatchKey] = k === 'date' ? new Date(body[k] as string) : body[k]
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const shift = await prisma.shift.update({ where: { id: params.id }, data })
  return NextResponse.json({ shift })
}

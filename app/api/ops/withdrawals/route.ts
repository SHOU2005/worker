import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { decryptPII } from '@/lib/crypto'

function isLikelyEncrypted(v: string): boolean {
  return v.length >= 40 && !v.includes('@') && /^[A-Za-z0-9+/=]+$/.test(v)
}
function readUpi(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!isLikelyEncrypted(stored)) return stored
  try { return decryptPII(stored) } catch { return null }
}

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'PENDING'
  const where  = status === 'ALL' ? {} : { status: status as 'PENDING' | 'PROCESSING' | 'PAID' | 'REJECTED' }

  const withdrawals = await prisma.withdrawal.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take:    200,
  })

  // Enrich with worker info
  const ids = Array.from(new Set(withdrawals.map(w => w.workerId)))
  const profiles = ids.length === 0 ? [] : await prisma.workerProfile.findMany({
    where:   { id: { in: ids } },
    include: { user: { select: { name: true, phone: true } } },
  })
  const byId = new Map(profiles.map(p => [p.id, p]))

  const enriched = withdrawals.map(w => ({
    ...w,
    upiId: readUpi(w.upiId),
    worker: byId.get(w.workerId)
      ? { id: w.workerId, name: byId.get(w.workerId)!.user.name, phone: byId.get(w.workerId)!.user.phone, city: byId.get(w.workerId)!.city }
      : null,
  }))

  return NextResponse.json({ withdrawals: enriched })
}

export async function PATCH(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, utr, notes } = await req.json()
  if (!id || !['PROCESSING', 'PAID', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await prisma.withdrawal.update({
    where: { id: String(id) },
    data: {
      status,
      processedAt: status === 'PAID' || status === 'REJECTED' ? new Date() : null,
      ...(utr   ? { utr:   String(utr).slice(0, 50) }   : {}),
      ...(notes ? { notes: String(notes).slice(0, 500) } : {}),
    },
  })

  return NextResponse.json({ withdrawal: updated })
}

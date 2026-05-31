import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'OPEN'

  const complaints = await prisma.complaint.findMany({
    where:   status === 'ALL' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take:    200,
  })

  // Enrich with reporter info — Complaint.reportedBy is a User.id
  const reporterIds = Array.from(new Set(complaints.map(c => c.reportedBy)))
  const reporters = reporterIds.length === 0 ? [] : await prisma.user.findMany({
    where:  { id: { in: reporterIds } },
    select: { id: true, name: true, phone: true, role: true },
  })
  const byId = new Map(reporters.map(u => [u.id, u]))

  const enriched = complaints.map(c => ({
    ...c,
    reporter: byId.get(c.reportedBy) || null,
  }))

  return NextResponse.json({ complaints: enriched })
}

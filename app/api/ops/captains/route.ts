import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// OPS dashboard: list of all captains with their onboarding + commission stats.
// "Leads" = workers + employers each captain has onboarded (captainReferralId match).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  const captains = await prisma.captainProfile.findMany({
    include: {
      user:        { select: { id: true, name: true, phone: true, avatar: true, createdAt: true } },
      commissions: { select: { amount: true, status: true } },
      tasks:       { select: { status: true } },
    },
    orderBy: { joinedAt: 'desc' },
  })

  // Bulk count workers/employers each captain has onboarded. We avoid the
  // groupBy types here by just counting per-captain in parallel — simpler,
  // and survives any Prisma type-inference quirks.
  const captainIds = captains.map(c => c.id)
  const workerLeadByCaptain   = new Map<string, number>()
  const employerLeadByCaptain = new Map<string, number>()
  const approvedByCaptain     = new Map<string, number>()

  if (captainIds.length > 0) {
    await Promise.all(captainIds.map(async id => {
      try {
        const [w, e, a] = await Promise.all([
          prisma.workerProfile.count({ where: { captainReferralId: id } }),
          prisma.employerProfile.count({ where: { captainReferralId: id } }),
          prisma.workerProfile.count({ where: { captainReferralId: id, kycStatus: 'APPROVED' } }),
        ])
        workerLeadByCaptain.set(id, w)
        employerLeadByCaptain.set(id, e)
        approvedByCaptain.set(id, a)
      } catch (err) {
        console.error('[ops/captains] lead counts failed for', id, err instanceof Error ? err.message : err)
        workerLeadByCaptain.set(id, 0)
        employerLeadByCaptain.set(id, 0)
        approvedByCaptain.set(id, 0)
      }
    }))
  }

  const data = captains.map(c => ({
    id:                  c.id,
    userId:              c.userId,
    name:                c.user.name,
    phone:               c.user.phone,
    avatar:              c.user.avatar,
    territory:           c.territory,
    status:              c.status,
    totalEarnings:       c.totalEarnings,
    pendingPayout:       c.pendingPayout,
    joinedAt:            c.joinedAt,
    totalCommissions:    c.commissions.reduce((s, x) => s + x.amount, 0),
    pendingCommissions:  c.commissions.filter(x => x.status === 'PENDING').length,
    paidCommissions:     c.commissions.filter(x => x.status === 'PAID').length,
    openTasks:           c.tasks.filter(x => x.status === 'OPEN').length,
    workerLeads:         workerLeadByCaptain.get(c.id)   ?? 0,
    employerLeads:       employerLeadByCaptain.get(c.id) ?? 0,
    approvedWorkerLeads: approvedByCaptain.get(c.id)     ?? 0,
  }))

  return NextResponse.json({ captains: data })
  } catch (err) {
    console.error('[ops/captains] failed:', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '')
    return NextResponse.json({ captains: [], error: err instanceof Error ? err.message : 'unknown' }, { status: 200 })
  }
}

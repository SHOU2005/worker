import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// Always re-run on every request — counts are live, never serve stale cached data.
export const dynamic = 'force-dynamic'

// Run a Prisma query, log + return fallback if it throws so a single bad query
// doesn't blank the entire dashboard.
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch (err) {
    console.error(`[ops/dashboard] ${label} failed:`, err instanceof Error ? err.message : err)
    return fallback
  }
}

export async function GET() {
  try {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  const now   = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const week  = new Date(now); week.setDate(week.getDate() - 7)
  const month = new Date(now); month.setDate(1); month.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const last30Start = new Date(today); last30Start.setDate(last30Start.getDate() - 29)

  const [
    activeShifts, openShifts, vacancyShiftsRaw, todayBookings, pendingKyc, openComplaints,
    captainsInField, pendingCommissions, pendingCaptains, pendingWithdrawals,
    totalWorkers, totalCaptains, totalEmployers, totalBookings,
    billingRows,
    captainWorkerLeads, captainEmployerLeads, captainLeadsToday,
  ] = await Promise.all([
    safe('activeShifts',       () => prisma.shift.count({ where: { status: { in: ['OPEN', 'SEARCHING', 'ASSIGNED', 'IN_PROGRESS'] } } }), 0),
    // Shifts still accepting workers — total openings on the worker feed
    safe('openShifts',         () => prisma.shift.count({ where: { status: 'OPEN', paymentStatus: 'PAID' } }), 0),
    // For each OPEN+PAID shift, fetch workersNeeded + active booking count so
    // we can compute remaining vacancy.
    safe('vacancyShiftsRaw',   () => prisma.shift.findMany({
      where:  { status: 'OPEN', paymentStatus: 'PAID' },
      select: {
        workersNeeded: true,
        bookings: { where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } }, select: { id: true } },
      },
    }), [] as Array<{ workersNeeded: number; bookings: { id: string }[] }>),
    safe('todayBookings',      () => prisma.booking.count({ where: { createdAt: { gte: today } } }), 0),
    // Some prod DBs may have the kycStatus column with a slightly different enum from local schema —
    // wrap each in safe() so dashboard doesn't go all-zeros on one mismatch.
    safe('pendingKyc',         () => prisma.workerProfile.count({ where: { kycStatus: 'PENDING' } }), 0),
    safe('openComplaints',     () => prisma.complaint.count({ where: { status: 'OPEN' } }), 0),
    safe('captainsInField',    () => prisma.captainAttendance.count({ where: { date: { gte: today }, checkInTime: { not: null }, checkOutTime: null } }), 0),
    safe('pendingCommissions', () => prisma.commission.count({ where: { status: 'PENDING' } }), 0),
    safe('pendingCaptains',    () => prisma.captainProfile.count({ where: { status: 'PENDING' } }), 0),
    safe('pendingWithdrawals', () => prisma.withdrawal.count({ where: { status: 'PENDING' } }), 0),
    safe('totalWorkers',       () => prisma.workerProfile.count(), 0),
    safe('totalCaptains',      () => prisma.captainProfile.count(), 0),
    safe('totalEmployers',     () => prisma.employerProfile.count(), 0),
    safe('totalBookings',      () => prisma.booking.count(), 0),
    // Total Sales = sum of (employer hourly rate × actual minutes worked) per
    // booking that has actually started (checkInTime set + status IN_PROGRESS
    // or COMPLETED). CONFIRMED-but-not-yet-checked-in bookings contribute ₹0.
    safe('billingRows', () => prisma.booking.findMany({
      where:  {
        paymentStatus: 'PAID',
        checkInTime:   { not: null },
        status:        { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
      select: { id: true, checkInTime: true, checkOutTime: true, shift: { select: { hourlyRate: true } } },
    }), [] as { id: string; checkInTime: Date | null; checkOutTime: Date | null; shift: { hourlyRate: number } }[]),
    safe('captainWorkerLeads',   () => prisma.workerProfile.count({ where: { captainReferralId: { not: null } } }), 0),
    safe('captainEmployerLeads', () => prisma.employerProfile.count({ where: { captainReferralId: { not: null } } }), 0),
    safe('captainLeadsToday',    () => prisma.user.count({ where: { captainReferralId: { not: null }, createdAt: { gte: today } } }), 0),
  ])

  // Compute live billed amount per booking + bucket into time windows.
  // Amount = shift.hourlyRate × (checkOut ?? now − checkIn) ÷ 60
  function billedAmount(b: { checkInTime: Date | null; checkOutTime: Date | null; shift: { hourlyRate: number } }): number {
    if (!b.checkInTime) return 0
    const start = b.checkInTime.getTime()
    const end   = (b.checkOutTime ?? new Date()).getTime()
    const minutes = Math.max(0, Math.floor((end - start) / 60_000))
    return Math.round((b.shift.hourlyRate || 0) * minutes / 60)
  }
  // Bucket by checkInTime (when the work actually started), not createdAt
  function bucketKey(b: { checkInTime: Date | null }): Date | null {
    return b.checkInTime ?? null
  }

  let todayRevenue = 0, yesterdayRevenue = 0, weekRevenue = 0, monthRevenue = 0, totalRevenue = 0
  const buckets: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(last30Start); d.setDate(last30Start.getDate() + i)
    buckets[d.toISOString().slice(0, 10)] = 0
  }
  for (const b of billingRows) {
    const amt = billedAmount(b)
    totalRevenue += amt
    const dt = bucketKey(b)
    if (!dt) continue
    if (dt >= today)                              todayRevenue     += amt
    if (dt >= yesterday && dt < today)            yesterdayRevenue += amt
    if (dt >= week)                               weekRevenue      += amt
    if (dt >= month)                              monthRevenue     += amt
    const k = dt.toISOString().slice(0, 10)
    if (k in buckets) buckets[k] += amt
  }
  const last30Days = Object.entries(buckets).map(([date, revenue]) => ({ date, revenue }))

  // Performance / analytics — top employers, top workers, conversion ratios
  const [
    topEmployers, topWorkers, completionStats, todayShifts, todayBookingsCount,
    weekBookings, monthBookings, last7DaysBookingsRows,
  ] = await Promise.all([
    safe('topEmployers', () => prisma.employerProfile.findMany({
      where:   { totalShifts: { gt: 0 } },
      orderBy: { totalShifts: 'desc' },
      take:    5,
      select:  { id: true, companyName: true, totalShifts: true, rating: true, user: { select: { name: true } } },
    }), [] as Array<{ id: string; companyName: string | null; totalShifts: number; rating: number; user: { name: string } }>),
    safe('topWorkers', () => prisma.workerProfile.findMany({
      where:   { totalShifts: { gt: 0 } },
      orderBy: [{ totalShifts: 'desc' }, { rating: 'desc' }],
      take:    5,
      select:  { id: true, totalShifts: true, totalEarnings: true, rating: true, user: { select: { name: true } } },
    }), [] as Array<{ id: string; totalShifts: number; totalEarnings: number; rating: number; user: { name: string } }>),
    safe('completionStats', async () => {
      const [completed, cancelled, all] = await Promise.all([
        prisma.booking.count({ where: { status: 'COMPLETED' } }),
        prisma.booking.count({ where: { status: 'CANCELLED' } }),
        prisma.booking.count(),
      ])
      return { completed, cancelled, all }
    }, { completed: 0, cancelled: 0, all: 0 }),
    safe('todayShifts', () => prisma.shift.count({ where: { createdAt: { gte: today } } }), 0),
    safe('todayBookingsCount', () => prisma.booking.count({ where: { createdAt: { gte: today } } }), 0),
    safe('weekBookings', () => prisma.booking.count({ where: { createdAt: { gte: week } } }), 0),
    safe('monthBookings', () => prisma.booking.count({ where: { createdAt: { gte: month } } }), 0),
    safe('last7DaysBookingsRows', () => {
      const d = new Date(today); d.setDate(d.getDate() - 6)
      return prisma.booking.findMany({
        where: { createdAt: { gte: d } },
        select: { createdAt: true, status: true },
      })
    }, [] as { createdAt: Date; status: string }[]),
  ])

  // Daily-bookings count for last 7 days (for the small bar chart)
  const sevenStart = new Date(today); sevenStart.setDate(sevenStart.getDate() - 6)
  const dailyBuckets: Record<string, { bookings: number; completed: number; cancelled: number }> = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenStart); d.setDate(sevenStart.getDate() + i)
    dailyBuckets[d.toISOString().slice(0, 10)] = { bookings: 0, completed: 0, cancelled: 0 }
  }
  for (const r of last7DaysBookingsRows) {
    const k = r.createdAt.toISOString().slice(0, 10)
    const b = dailyBuckets[k]
    if (!b) continue
    b.bookings++
    if (r.status === 'COMPLETED') b.completed++
    if (r.status === 'CANCELLED') b.cancelled++
  }
  const last7Days = Object.entries(dailyBuckets).map(([date, v]) => ({ date, ...v }))

  const completionRate = completionStats.all > 0
    ? Math.round((completionStats.completed / completionStats.all) * 100)
    : 0
  const cancellationRate = completionStats.all > 0
    ? Math.round((completionStats.cancelled / completionStats.all) * 100)
    : 0

  const vacancyLeft = vacancyShiftsRaw.reduce(
    (sum, s) => sum + Math.max(0, s.workersNeeded - s.bookings.length),
    0,
  )

  return NextResponse.json({
    activeShifts, openShifts, vacancyLeft, todayBookings, pendingKyc, openComplaints,
    captainsInField, pendingCommissions, pendingCaptains, pendingWithdrawals,
    totalWorkers, totalCaptains, totalEmployers, totalBookings,
    todayRevenue,
    yesterdayRevenue,
    weekRevenue,
    monthRevenue,
    totalRevenue,
    last30Days,
    captainLeads: {
      workers:    captainWorkerLeads,
      employers:  captainEmployerLeads,
      total:      captainWorkerLeads + captainEmployerLeads,
      today:      captainLeadsToday,
    },
    // Performance / daily / analytics block
    performance: {
      todayShifts,
      todayBookings: todayBookingsCount,
      weekBookings,
      monthBookings,
      completionRate,
      cancellationRate,
      totalBookings: completionStats.all,
      completedBookings: completionStats.completed,
      cancelledBookings: completionStats.cancelled,
      last7Days,
      topEmployers: topEmployers.map(e => ({
        id:           e.id,
        name:         e.companyName || e.user.name,
        totalShifts:  e.totalShifts,
        rating:       e.rating,
      })),
      topWorkers: topWorkers.map(w => ({
        id:            w.id,
        name:          w.user.name,
        totalShifts:   w.totalShifts,
        totalEarnings: w.totalEarnings,
        rating:        w.rating,
      })),
    },
  })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/ops/dashboard] failed:', msg, err instanceof Error ? err.stack : '')
    const isDbDown = /reach|connect|ECONNREFUSED|ENOTFOUND|server.*not.*running|pgbouncer/i.test(msg)
    return NextResponse.json({
      error: isDbDown
        ? 'Database is unreachable. Check DATABASE_URL in Vercel env.'
        : `Server error: ${msg}`,
      code: isDbDown ? 'DB_UNREACHABLE' : 'DASHBOARD_FATAL',
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Auto-DELETE "empty" vacancies at the end of each day.
 *
 * A shift is "empty" when:
 *   - status is OPEN, SEARCHING, or already CANCELLED (the latter so the
 *     job table stays clean instead of piling up tombstone rows)
 *   - the shift date has come (date <= now)
 *   - every booking on it (if any) is itself CANCELLED — i.e. no worker
 *     ever showed up. PENDING / CONFIRMED / IN_PROGRESS / COMPLETED
 *     bookings mean real work touched the row, leave it alone.
 *
 * What we DO NOT touch:
 *   - Bookings or Payments tied to non-cancelled work — completed work
 *     data must stay intact (per ops policy: keep the audit trail).
 *   - Shifts with at least one active worker (even partial fills).
 *   - Shifts already in IN_PROGRESS / COMPLETED.
 *
 * Schedule: daily at 22:00 IST (16:30 UTC) — vercel.json cron expression
 *           "30 16 * * *". Auth: Bearer ${CRON_SECRET}.
 *
 * Returns: { scanned, deleted, errors }
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if ((req.headers.get('authorization') || '') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Pull candidates: stale unfilled or already-cancelled shifts. Limit to a
  // sensible batch so a single invocation doesn't time out if a backlog has
  // built up — the cron runs daily, and Vercel's 60s cap is our budget.
  const candidates = await prisma.shift.findMany({
    where: {
      status: { in: ['OPEN', 'SEARCHING', 'CANCELLED'] },
      date:   { lte: now },
    },
    select: {
      id: true,
      bookings: {
        // Any non-cancelled booking blocks deletion — that's real work.
        where:  { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
        select: { id: true },
        take:   1,
      },
    },
    take: 500,
  })

  const emptyShiftIds = candidates
    .filter(s => s.bookings.length === 0)
    .map(s => s.id)

  if (emptyShiftIds.length === 0) {
    return NextResponse.json({ scanned: candidates.length, deleted: 0, errors: 0 })
  }

  let deleted = 0
  let errors  = 0
  for (const id of emptyShiftIds) {
    try {
      await prisma.$transaction(async tx => {
        // Drop cancelled bookings on the shift (none should exist for OPEN/
        // SEARCHING status; for previously-CANCELLED shifts there may be a
        // few rejected applications). Anything not CANCELLED would have been
        // filtered out upstream — guard with a where clause anyway.
        await tx.booking.deleteMany({
          where: { shiftId: id, status: 'CANCELLED' },
        })
        await tx.shift.delete({ where: { id } })
      })
      deleted++
    } catch (err) {
      errors++
      console.error('[cron/expire-unfilled-shifts] failed for shift', id, err)
    }
  }

  return NextResponse.json({
    scanned: candidates.length,
    deleted,
    errors,
    deletedShiftIds: emptyShiftIds,
  })
}

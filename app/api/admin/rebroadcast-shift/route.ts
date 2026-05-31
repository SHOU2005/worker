import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { broadcastUrgentJob } from '@/lib/fcm-server'
import { workerEarning as calcWorkerEarning } from '@/lib/pricing'

// Re-fires the urgent FCM broadcast for an existing OPEN shift. Used by
// ops when they reassign a booking and want to wake up workers again
// without going through the full employer cart-verify flow.
//
// Auth: ADMIN only. Body: { shiftId: string }.
export async function POST(req: NextRequest) {
  const sess = await requireSession(['ADMIN', 'OPS'])
  if (sess instanceof NextResponse) return sess

  const { shiftId } = await req.json().catch(() => ({})) as { shiftId?: string }
  if (!shiftId) return NextResponse.json({ error: 'shiftId required' }, { status: 400 })

  const shift = await prisma.shift.findUnique({
    where:  { id: shiftId },
    select: { id: true, title: true, address: true, duration: true, status: true, role: true, paymentStatus: true },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.status !== 'OPEN') {
    return NextResponse.json({ error: `Shift not OPEN (status=${shift.status})` }, { status: 409 })
  }
  if (shift.paymentStatus !== 'PAID') {
    return NextResponse.json({ error: 'Shift not paid' }, { status: 409 })
  }

  const earnPerWorker = calcWorkerEarning(shift.duration)
  await broadcastUrgentJob(
    shift.id,
    shift.title,
    shift.address,
    `₹${earnPerWorker.toLocaleString('en-IN')} per worker`,
    { role: shift.role },
  )

  return NextResponse.json({ ok: true, shiftId: shift.id, title: shift.title })
}

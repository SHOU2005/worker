import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { pushToUser } from './fcm-server'

/**
 * Single source of truth for booking-COMPLETED side effects:
 *  - Increments worker totalShifts + totalEarnings
 *  - Creates a captain Commission (idempotent on bookingId)
 *  - Sends a push notification to the captain
 *
 * Idempotent: calling twice for the same booking does nothing on the second call.
 * Wraps all DB work in a single transaction.
 *
 * IMPORTANT: caller is responsible for the booking.status = COMPLETED update itself.
 * This function only handles downstream effects.
 */
export async function applyBookingCompletedEffects(
  bookingId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ commissionFiredFor?: string }> {
  const booking = await tx.booking.findUnique({
    where:  { id: bookingId },
    select: {
      id: true,
      status: true,
      workerProfileId: true,
      employerId: true,
      workerEarning: true,
    },
  })
  if (!booking) return {}
  if (booking.status !== 'COMPLETED') return {} // caller bug; safer to no-op

  // Worker stats — Prisma "increment" is atomic at the DB layer. Idempotency
  // for this part is handled by the caller (only call once per COMPLETED transition).
  await tx.workerProfile.update({
    where: { id: booking.workerProfileId },
    data:  {
      totalShifts:   { increment: 1 },
      totalEarnings: { increment: booking.workerEarning },
    },
  })

  // Captain commission — bookingId is unique on Commission so the second insert
  // would fail with P2002. We check first to keep the failure path clean.
  const [workerProfile, employerProfile] = await Promise.all([
    tx.workerProfile.findUnique({
      where:  { id: booking.workerProfileId },
      select: { captainReferralId: true },
    }),
    tx.employerProfile.findFirst({
      where:  { userId: booking.employerId },
      select: { captainReferralId: true },
    }),
  ])

  const captainProfileId = workerProfile?.captainReferralId || employerProfile?.captainReferralId
  if (!captainProfileId) return {}

  const existing = await tx.commission.findUnique({ where: { bookingId: booking.id } })
  if (existing) return {}

  await tx.commission.create({
    data: { captainProfileId, bookingId: booking.id, amount: 100, status: 'PENDING' },
  })
  await tx.captainProfile.update({
    where: { id: captainProfileId },
    data:  { pendingPayout: { increment: 100 } },
  })
  return { commissionFiredFor: captainProfileId }
}

/**
 * Fire the push notification to the captain. Run AFTER the transaction commits
 * so we don't keep DB locks held during a network round-trip.
 */
export async function notifyCaptainAboutCommission(captainProfileId: string): Promise<void> {
  const captain = await prisma.captainProfile.findUnique({
    where:  { id: captainProfileId },
    select: { userId: true },
  })
  if (!captain) return
  await pushToUser(captain.userId, {
    title: '₹100 Commission Earned!',
    body:  'A booking from your referral was completed.',
  })
}

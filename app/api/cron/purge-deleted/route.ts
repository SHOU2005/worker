import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET
const RETENTION_DAYS = 30

/**
 * Hard-purge soft-deleted users whose 30-day DPDP grace has elapsed.
 *
 * What gets PII-scrubbed (PII removed, row kept for FK integrity + auditability):
 *   - User: name → "[deleted user]", phone → "+DELETED-<id>", email → null,
 *           avatar → null, fcmTokens → [], password → ""
 *   - WorkerProfile: clears aadhaar*, profilePhoto, bio, contacts, lat/lng, upiId.
 *                    Keeps anonymous stats (totalShifts, totalEarnings, rating).
 *   - EmployerProfile: clears address, lat/lng, ownerName, gstNumber, logo.
 *                       Keeps companyName for booking history (already exposed in past invoices).
 *
 * What is KEPT (per Indian IT Act + GST 8-year retention):
 *   - Booking, Payment, Commission, Withdrawal rows
 *   - The User row itself (FK target) — only PII fields scrubbed
 *
 * The DataDeletionRequest row is marked COMPLETED with completion timestamp.
 *
 * Run on Vercel Cron daily. Auth: Bearer ${CRON_SECRET}.
 * Schedule in vercel.json:
 *   { "path": "/api/cron/purge-deleted", "schedule": "0 4 * * *" }
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if ((req.headers.get('authorization') || '') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const due = await prisma.user.findMany({
    where:  { deletedAt: { lte: cutoff } },
    select: { id: true },
    take:   100, // batch
  })

  let purged = 0, errors = 0
  for (const u of due) {
    try {
      await prisma.$transaction(async tx => {
        // Scrub WorkerProfile PII
        await tx.workerProfile.updateMany({
          where: { userId: u.id },
          data:  {
            profilePhoto:           null,
            aadhaarNumber:          null,
            aadhaarFront:           null,
            aadhaarBack:            null,
            aadhaarLast4:           null,
            aadhaarConsentVersion:  null,
            aadhaarConsentAt:       null,
            aadhaarConsentIp:       null,
            bio:                    null,
            contacts:               null,
            lat:                    null,
            lng:                    null,
            upiId:                  null,
            locationSharingConsent: false,
            isAvailable:            false,
          },
        })

        // Scrub EmployerProfile PII (keep companyName for past invoices)
        await tx.employerProfile.updateMany({
          where: { userId: u.id },
          data:  {
            address:   null,
            lat:       null,
            lng:       null,
            ownerName: null,
            logo:      null,
            gstNumber: null,
          },
        })

        // Scrub User PII; keep row + id for FK integrity (booking/payment audit)
        await tx.user.update({
          where: { id: u.id },
          data:  {
            name:      '[deleted user]',
            phone:     `+DELETED-${u.id}`,  // unique; phone is @unique
            email:     null,
            avatar:    null,
            password:  '',
            fcmToken:  null,
            fcmTokens: { set: [] },
          },
        })

        await tx.dataDeletionRequest.updateMany({
          where: { userId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          data:  { status: 'COMPLETED', completedAt: new Date() },
        })
      })
      purged++
    } catch (err) {
      errors++
      console.error('[cron/purge-deleted] failed for user', u.id, err)
    }
  }

  return NextResponse.json({ scanned: due.length, purged, errors, retentionDays: RETENTION_DAYS })
}

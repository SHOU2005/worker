import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { decryptPII } from '@/lib/crypto'

/**
 * Ops-only: fetch full Aadhaar details for a worker (signed image URLs + decrypted number).
 *
 * EVERY call to this endpoint is logged to AadhaarAccessLog SYNCHRONOUSLY.
 * If the audit log write fails, the request fails — DPDP/UIDAI require an
 * unbreakable audit trail for KYC document access.
 *
 * Ops should provide a `reason` query string for compliance (e.g. ?reason=KYC_review).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const worker = await prisma.workerProfile.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      aadhaarFront:      true,
      aadhaarBack:       true,
      aadhaarFrontBytes: true,
      aadhaarBackBytes:  true,
      aadhaarFrontMime:  true,
      aadhaarBackMime:   true,
      aadhaarNumber:     true,
      aadhaarLast4:      true,
    },
  })
  if (!worker) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reason = req.nextUrl.searchParams.get('reason') || null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            ?? req.headers.get('x-real-ip')
            ?? null
  const ua = req.headers.get('user-agent') ?? null

  // Decide what fields will be returned BEFORE writing the audit log so the log
  // accurately reflects what was actually exposed.
  const hasFront = !!(worker.aadhaarFrontBytes || worker.aadhaarFront)
  const hasBack  = !!(worker.aadhaarBackBytes  || worker.aadhaarBack)
  const fieldsViewed: string[] = []
  if (hasFront)             fieldsViewed.push('aadhaarFront')
  if (hasBack)              fieldsViewed.push('aadhaarBack')
  if (worker.aadhaarNumber) fieldsViewed.push('aadhaarNumber')

  // Audit log MUST land before we return the data. Fail closed for compliance.
  try {
    await prisma.aadhaarAccessLog.create({
      data: {
        workerProfileId: worker.id,
        accessedById:    payload.userId,
        fieldsViewed,
        reason,
        ip,
        userAgent: ua,
      },
    })
  } catch (err) {
    console.error('[ops/aadhaar] audit log write failed — refusing to expose PII:', err)
    return NextResponse.json({
      error: 'Could not record access. PII not exposed. Try again or contact ops-tech.',
      code:  'AUDIT_LOG_WRITE_FAILED',
    }, { status: 500 })
  }

  // Audit logged — now resolve image source. Three possible storage states:
  //   - bytea column populated → return inline data URL constructed from
  //     the bytes + mime so the ops UI can render <img src> without an
  //     extra round-trip / signed-URL flow.
  //   - legacy data: URL in the String column → return as-is.
  //   - legacy https URL (Supabase or earlier) → return as-is. New URLs
  //     are no longer minted server-side; existing rows continue to work.
  function bytesToDataUrl(bytes: Buffer | null | undefined, mime: string | null | undefined): string | null {
    if (!bytes || bytes.length === 0) return null
    return `data:${mime || 'image/jpeg'};base64,${bytes.toString('base64')}`
  }
  function resolveLegacy(stored: string | null): string | null {
    if (!stored) return null
    if (stored.startsWith('data:image/')) return stored
    if (/^https?:\/\//.test(stored))      return stored
    return null
  }
  const frontUrl: string | null = bytesToDataUrl(worker.aadhaarFrontBytes, worker.aadhaarFrontMime)
                              ?? resolveLegacy(worker.aadhaarFront)
  const backUrl:  string | null = bytesToDataUrl(worker.aadhaarBackBytes,  worker.aadhaarBackMime)
                              ?? resolveLegacy(worker.aadhaarBack)

  let aadhaarNumber: string | null = null
  if (worker.aadhaarNumber) {
    try { aadhaarNumber = decryptPII(worker.aadhaarNumber) }
    catch (err) { console.error('[ops/aadhaar] decrypt failed:', err) }
  }

  return NextResponse.json({
    aadhaarFrontUrl: frontUrl,
    aadhaarBackUrl:  backUrl,
    aadhaarNumber,
    aadhaarLast4:    worker.aadhaarLast4,
  })
}

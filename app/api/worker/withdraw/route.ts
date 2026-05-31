import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { encryptPII, decryptPII } from '@/lib/crypto'
import { workerEarningFromBooking } from '@/lib/pricing'

const MIN_WITHDRAW = 100 // ₹100 minimum

// UPI IDs are stored encrypted at rest. Newly-stored values are GCM ciphertext;
// legacy plaintext rows (no encryption marker) read through unchanged.
function isLikelyEncrypted(v: string): boolean {
  // GCM ciphertext is base64 of (12 IV + ≥1 ct + 16 tag) = ≥40 chars, and never contains '@'.
  return v.length >= 40 && !v.includes('@') && /^[A-Za-z0-9+/=]+$/.test(v)
}
function readUpi(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!isLikelyEncrypted(stored)) return stored
  try { return decryptPII(stored) } catch { return null }
}

async function computeAvailableBalance(
  workerProfileId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  // Source of truth = ACTUAL minutes worked × ₹100/hr, not the stored
  // booking.workerEarning (which is the scheduled-hours estimate set at
  // accept time). If a worker checked out early, scheduled estimate >
  // actual — and the prior code let them withdraw the difference, leaking
  // money. Mirrors the calc used in /api/worker/earnings so the wallet
  // number the worker sees and the withdrawable cap are identical.
  const [completed, withdrawn] = await Promise.all([
    tx.booking.findMany({
      where:  { workerProfileId, status: 'COMPLETED', paymentStatus: 'PAID' },
      select: { checkInTime: true, checkOutTime: true, workerEarning: true },
    }),
    tx.withdrawal.aggregate({
      where: { workerId: workerProfileId, status: { in: ['PENDING', 'PROCESSING', 'PAID'] } },
      _sum:  { amount: true },
    }),
  ])
  const earned = completed.reduce((sum, b) => {
    // If both timestamps are present, prefer actual-minutes math. Otherwise
    // fall back to the stored estimate (legacy bookings without checkInTime).
    const actual = b.checkInTime
      ? workerEarningFromBooking(b.checkInTime, b.checkOutTime)
      : (b.workerEarning ?? 0)
    return sum + actual
  }, 0)
  const taken = withdrawn._sum.amount ?? 0
  return Math.max(0, earned - taken)
}

export async function POST(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const wp = await prisma.workerProfile.findUnique({ where: { userId: payload.userId } })
  if (!wp) return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const reqAmount = Number(body.amount)
  const upiInput  = String(body.upiId || readUpi(wp.upiId) || '').trim().toLowerCase()

  if (!upiInput || !upiInput.includes('@') || upiInput.length > 100) {
    return NextResponse.json({ error: 'Add a valid UPI ID in your profile first' }, { status: 400 })
  }
  if (!Number.isFinite(reqAmount) || reqAmount < MIN_WITHDRAW) {
    return NextResponse.json({ error: `Minimum withdrawal is ₹${MIN_WITHDRAW}` }, { status: 400 })
  }

  // Atomic balance check + insert under Serializable isolation. Two concurrent
  // requests for the same worker will conflict and one will retry/fail — the DB
  // is the only safe place to enforce this invariant.
  try {
    const result = await prisma.$transaction(async tx => {
      const available = await computeAvailableBalance(wp.id, tx)
      if (reqAmount > available) {
        throw new InsufficientFundsError(available)
      }
      const w = await tx.withdrawal.create({
        data: {
          workerId: wp.id,
          upiId:    encryptPII(upiInput),
          amount:   Math.round(reqAmount),
          status:   'PENDING',
        },
      })
      // Persist the UPI on profile if not stored yet (encrypted)
      if (!wp.upiId) {
        await tx.workerProfile.update({ where: { id: wp.id }, data: { upiId: encryptPII(upiInput) } })
      }
      return { w, availableAfter: available - reqAmount }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({
      withdrawal: { ...result.w, upiId: upiInput }, // return plaintext to caller
      availableAfter: result.availableAfter,
    }, { status: 201 })
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return NextResponse.json({ error: `Only ₹${err.available.toFixed(0)} available to withdraw` }, { status: 400 })
    }
    // Serialization failure → tell client to retry
    if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2034') {
      return NextResponse.json({ error: 'Please retry your withdrawal request' }, { status: 409 })
    }
    console.error('[worker/withdraw] tx failed:', err)
    return NextResponse.json({ error: 'Could not place withdrawal' }, { status: 500 })
  }
}

class InsufficientFundsError extends Error {
  constructor(public available: number) { super('insufficient_funds') }
}

export async function GET() {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const wp = await prisma.workerProfile.findUnique({ where: { userId: payload.userId } })
  if (!wp) return NextResponse.json({ error: 'Worker profile not found' }, { status: 404 })

  const [available, withdrawals] = await Promise.all([
    computeAvailableBalance(wp.id),
    prisma.withdrawal.findMany({
      where:   { workerId: wp.id },
      orderBy: { requestedAt: 'desc' },
      take:    50,
    }),
  ])

  // Decrypt UPI on read so the worker sees the actual ID, not ciphertext
  const decrypted = withdrawals.map(w => ({ ...w, upiId: readUpi(w.upiId) ?? '' }))

  return NextResponse.json({
    available,
    withdrawals: decrypted,
    upiId: readUpi(wp.upiId),
  })
}

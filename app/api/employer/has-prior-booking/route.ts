import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// Used by the cart UI to decide whether to display the intro (₹99) or the
// repeat (₹129) rate for Maid/Cleaning services. Server-derived from
// existing paid shifts so the user can't manipulate it client-side; the
// pay endpoint independently re-derives the same flag, this route is
// purely for UI rendering.
export async function GET() {
  const sess = await requireSession(['EMPLOYER', 'OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  // Any shift the employer has previously paid for counts as a prior
  // booking. We don't require it to be COMPLETED — once they've paid, the
  // intro deal has been consumed even if the worker no-showed (refund
  // flow handles that separately).
  const prior = await prisma.shift.findFirst({
    where:  {
      employer:      { user: { id: payload.userId } },
      paymentStatus: 'PAID',
    },
    select: { id: true },
  })

  return NextResponse.json({ hasPriorBooking: !!prior })
}

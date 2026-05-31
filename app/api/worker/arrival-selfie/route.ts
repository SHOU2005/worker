import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// Worker uploads the arrival selfie after sliding-to-arrive but BEFORE
// entering the employer's OTP. We store the JPEG bytes + mime on the
// Booking row (same pattern as users.avatar_bytes). The OTP-verify
// endpoint refuses to flip status to IN_PROGRESS unless this column is
// populated, so the selfie is a hard gate on shift start.
//
// Body shape:
//   { bookingId: string, dataUrl: "data:image/jpeg;base64,XXX..." }
// `dataUrl` is whatever lib/compress-image.ts returned on the client.
export async function POST(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { bookingId, dataUrl } = await req.json() as { bookingId?: string; dataUrl?: string }
  if (!bookingId || !dataUrl) {
    return NextResponse.json({ error: 'bookingId + dataUrl required' }, { status: 400 })
  }

  // data:<mime>;base64,<payload>
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return NextResponse.json({ error: 'Invalid image data URL' }, { status: 400 })
  const mime = match[1]
  const buf  = Buffer.from(match[2], 'base64')
  // Defensive cap — compress-image targets 250 KB; reject anything obscene.
  if (buf.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Selfie too large (max 2 MB)' }, { status: 413 })
  }

  const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: payload.userId } })
  if (!workerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Ownership: the booking must belong to this worker AND be in a state
  // where a selfie makes sense (CONFIRMED right before shift start, or
  // already IN_PROGRESS to allow a retake before OTP is re-issued).
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, workerProfileId: workerProfile.id },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json({ error: `Booking not in valid state (${booking.status})` }, { status: 400 })
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data:  {
      arrivalSelfie:     buf,
      arrivalSelfieMime: mime,
      arrivalSelfieAt:   new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

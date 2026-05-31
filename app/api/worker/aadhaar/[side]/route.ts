import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Streams the worker's own Aadhaar front/back from Postgres bytea + mime.
// Workers can only view their own Aadhaar — ops viewing requires the
// audit-logged endpoint at /api/ops/workers/[id]/aadhaar.
//
// `side` is `front` or `back`. Anything else is rejected.
export async function GET(_req: Request, { params }: { params: { side: string } }) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const side = params.side === 'front' ? 'front' : params.side === 'back' ? 'back' : null
  if (!side) return NextResponse.json({ error: 'side must be front or back' }, { status: 400 })

  let bytes: Buffer | null = null
  let mime:  string | null = null

  if (side === 'front') {
    const wp = await prisma.workerProfile.findUnique({
      where:  { userId: payload.userId },
      select: { aadhaarFrontBytes: true, aadhaarFrontMime: true },
    })
    if (!wp) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    bytes = wp.aadhaarFrontBytes as Buffer | null
    mime  = wp.aadhaarFrontMime
  } else {
    const wp = await prisma.workerProfile.findUnique({
      where:  { userId: payload.userId },
      select: { aadhaarBackBytes: true, aadhaarBackMime: true },
    })
    if (!wp) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    bytes = wp.aadhaarBackBytes as Buffer | null
    mime  = wp.aadhaarBackMime
  }

  if (!bytes) return NextResponse.json({ error: 'No Aadhaar uploaded' }, { status: 404 })

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type':   mime || 'image/jpeg',
      'Content-Length': String(bytes.length),
      // Aadhaar is sensitive — short cache, never store on disk.
      'Cache-Control':  'private, max-age=60, no-store',
    },
  })
}

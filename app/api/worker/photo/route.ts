import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Streams the worker's own selfie from Postgres bytea + mime as binary.
// /api/auth/me + /api/worker/profile return `/api/worker/photo` as the
// profilePhoto URL when the bytea column is populated; the browser caches
// the image via Cache-Control so subsequent dashboard renders don't re-hit
// the DB unless the worker uploads a new selfie.
export async function GET() {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const wp = await prisma.workerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { profilePhotoBytes: true, profilePhotoMime: true, profilePhoto: true },
  })
  if (!wp) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Bytea path is the canonical one. Legacy data:/https URLs are returned
  // verbatim via /api/worker/profile and bypass this endpoint, so falling
  // through to 404 here is safe.
  if (!wp.profilePhotoBytes) {
    return NextResponse.json({ error: 'No selfie uploaded' }, { status: 404 })
  }

  return new NextResponse(wp.profilePhotoBytes, {
    status: 200,
    headers: {
      'Content-Type':   wp.profilePhotoMime || 'image/jpeg',
      'Content-Length': String(wp.profilePhotoBytes.length),
      // Worker's own selfie — fine to cache aggressively in the browser.
      // Cache-busting is via the ?v=… query string the worker/profile GET
      // appends; a new uploaded selfie changes nothing in the URL but the
      // browser will revalidate on profile-page reload because we're using
      // `must-revalidate` rather than `immutable`.
      'Cache-Control':  'private, max-age=300, must-revalidate',
    },
  })
}

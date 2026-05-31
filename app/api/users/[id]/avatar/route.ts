import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Public-readable avatar served from User.avatarBytes + avatarMime. No auth
// gate because avatars appear on every job card / chat header / leaderboard
// — same trust level as a public CDN URL would have.
//
// GET /api/users/<userId>/avatar
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where:  { id: params.id },
    select: { avatarBytes: true, avatarMime: true },
  })
  if (!user || !user.avatarBytes) {
    return NextResponse.json({ error: 'No avatar' }, { status: 404 })
  }
  return new NextResponse(user.avatarBytes, {
    status: 200,
    headers: {
      'Content-Type':   user.avatarMime || 'image/jpeg',
      'Content-Length': String(user.avatarBytes.length),
      // Public, cacheable for an hour. Workers / employers re-uploading
      // their avatar invalidate via a ?v= cache buster the GET endpoints
      // append below.
      'Cache-Control':  'public, max-age=3600, must-revalidate',
    },
  })
}

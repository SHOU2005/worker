import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Public employer logo served from EmployerProfile.logoBytes + logoMime.
// Surfaces on the worker job feed (employer card on every shift), so
// kept publicly readable. The String column EmployerProfile.logo (legacy
// https / data: URLs) is read by the worker /api/shifts route directly.
//
// GET /api/employers/<employerProfileId>/logo
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ep = await prisma.employerProfile.findUnique({
    where:  { id: params.id },
    select: { logoBytes: true, logoMime: true },
  })
  if (!ep || !ep.logoBytes) {
    return NextResponse.json({ error: 'No logo' }, { status: 404 })
  }
  return new NextResponse(ep.logoBytes, {
    status: 200,
    headers: {
      'Content-Type':   ep.logoMime || 'image/jpeg',
      'Content-Length': String(ep.logoBytes.length),
      'Cache-Control':  'public, max-age=3600, must-revalidate',
    },
  })
}

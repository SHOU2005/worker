import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { pushToUser } from '@/lib/fcm-server'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employer = await prisma.employerProfile.update({
    where: { id: params.id },
    data:  { verifiedByOpsAt: new Date() },
  })

  await pushToUser(employer.userId, {
    title: 'Business Verified!',
    body:  'Your business has been verified. You can now post shifts.',
  })

  return NextResponse.json({ employer })
}

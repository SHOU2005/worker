import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { pushToUser } from '@/lib/fcm-server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'OPS') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status, reason } = await req.json()
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const worker = await prisma.workerProfile.update({
    where: { id: params.id },
    data:  { kycStatus: status },
  })

  const message = status === 'APPROVED'
    ? 'Your KYC has been approved! You can now accept shifts.'
    : `Your KYC was rejected. Reason: ${reason || 'Documents unclear'}. Please resubmit.`

  await pushToUser(worker.userId, { title: 'KYC Update', body: message })

  return NextResponse.json({ worker })
}

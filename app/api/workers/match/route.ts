import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { findMatchingWorkers } from '@/lib/matching'

export async function GET(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'EMPLOYER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const shiftId = searchParams.get('shiftId')

  if (!shiftId) return NextResponse.json({ error: 'shiftId required' }, { status: 400 })

  const workers = await findMatchingWorkers(shiftId)
  return NextResponse.json({ workers })
}

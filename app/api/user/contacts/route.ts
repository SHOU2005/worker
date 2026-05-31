import { NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface Contact {
  name: string
  tel:  string[]
}

export async function POST(req: Request) {
  const payload = getTokenFromCookies()
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contacts }: { contacts: Contact[] } = await req.json()
  if (!Array.isArray(contacts)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  // Normalise: trim names, flatten + deduplicate phone numbers
  const clean = contacts
    .filter(c => c.name || c.tel?.length)
    .map(c => ({
      name: (c.name || '').trim(),
      tel:  [...new Set((c.tel || []).map(t => t.replace(/\s/g, '')))],
    }))

  const json = JSON.stringify(clean)
  const userId = payload.userId

  const user = await prisma.user.findUnique({
    where:   { id: userId },
    select:  { role: true, workerProfile: { select: { id: true } }, captainProfile: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.workerProfile) {
    await prisma.workerProfile.update({
      where: { id: user.workerProfile.id },
      data:  { contacts: json },
    })
  } else if (user.captainProfile) {
    await prisma.captainProfile.update({
      where: { id: user.captainProfile.id },
      data:  { contacts: json },
    })
  } else {
    return NextResponse.json({ error: 'No profile found' }, { status: 404 })
  }

  return NextResponse.json({ saved: clean.length })
}

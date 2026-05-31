import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone || !/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })
  }
  // After the per-role schema split (User.@@unique([phone, role])), a
  // single phone can belong to multiple accounts. Return whether any
  // row exists plus the list of roles registered against this phone.
  const users = await prisma.user.findMany({ where: { phone }, select: { id: true, role: true } })
  return NextResponse.json({
    exists: users.length > 0,
    role:   users[0]?.role ?? null,   // back-compat: first role (legacy callers)
    roles:  users.map(u => u.role),   // new: all roles bound to this phone
  })
}

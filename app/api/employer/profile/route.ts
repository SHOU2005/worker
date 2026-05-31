import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { requireSession } from '@/lib/session'

// Logo storage: data: URL → bytea (EmployerProfile.logoBytes + logoMime).
// Was previously routed through Supabase. https URLs stay as-is for legacy
// rows.
function parseLogo(value: unknown):
  | { kind: 'bytes'; bytes: Buffer; mime: string }
  | { kind: 'url';   url: string }
  | { kind: 'err';   error: string }
{
  if (typeof value !== 'string') return { kind: 'err', error: 'Logo must be a string' }
  if (/^https?:\/\//.test(value)) return { kind: 'url', url: value }
  const m = /^data:(image\/[a-z+0-9.-]+)(?:;[^;,]+)*;base64,(.*)$/i.exec(value)
  if (!m) return { kind: 'err', error: 'Logo must be a valid image (data URL or https)' }
  const mime = m[1].toLowerCase()
  let bytes: Buffer
  try { bytes = Buffer.from(m[2], 'base64') }
  catch { return { kind: 'err', error: 'Logo base64 is malformed' } }
  if (bytes.length === 0)              return { kind: 'err', error: 'Logo is empty after decode' }
  if (bytes.length > 5 * 1024 * 1024)  return { kind: 'err', error: 'Logo is over 5MB — compress before uploading' }
  return { kind: 'bytes', bytes, mime }
}

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || !['EMPLOYER', 'OPS', 'ADMIN'].includes(payload.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where:   { id: payload.userId },
    include: { employerProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Replace bytea blobs with binary endpoint URLs so the JSON payload stays
  // small. EmployerProfile.logoBytes → /api/employers/[id]/logo. Same
  // pattern as captain avatar / worker photo.
  if (user.employerProfile) {
    const ep = user.employerProfile as Record<string, unknown>
    if (ep.logoBytes) {
      user.employerProfile.logo = `/api/employers/${user.employerProfile.id}/logo?v=${user.employerProfile.id.slice(-6)}`
    }
    delete ep.logoBytes
    delete ep.logoMime
  }

  return NextResponse.json({ user, profile: user.employerProfile })
}

export async function PATCH(req: NextRequest) {
  const sess = await requireSession(['EMPLOYER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const body = await req.json()
  const { name, ownerName, companyName, businessType, address, flat, tower, city, gstNumber, logo } = body

  // Logo storage — bytea preferred, https URL preserved for legacy rows.
  let logoWrite: Record<string, unknown> = {}
  if (logo != null) {
    const r = parseLogo(logo)
    if (r.kind === 'err')   return NextResponse.json({ error: r.error, code: 'INVALID_IMAGE_FORMAT' }, { status: 400 })
    if (r.kind === 'bytes') logoWrite = { logoBytes: r.bytes, logoMime: r.mime, logo: null }
    else                    logoWrite = { logo: r.url, logoBytes: null, logoMime: null }
  }

  const baseProfile = {
    ...(ownerName    != null ? { ownerName }    : {}),
    ...(companyName  != null ? { companyName }  : {}),
    ...(businessType != null ? { businessType } : {}),
    ...(address      != null ? { address }      : {}),
    ...(flat         != null ? { flat: String(flat).slice(0, 24) }   : {}),
    ...(tower        != null ? { tower: String(tower).slice(0, 64) } : {}),
    ...(city         != null ? { city }         : {}),
    ...(gstNumber    != null ? { gstNumber }    : {}),
    ...logoWrite,
  }

  const writes: Promise<unknown>[] = [
    prisma.employerProfile.upsert({
      where:  { userId: payload.userId },
      create: { userId: payload.userId, ...baseProfile },
      update: baseProfile,
    }),
  ]
  if (name) {
    writes.push(prisma.user.update({ where: { id: payload.userId }, data: { name } }))
  }
  await Promise.all(writes)

  // Read-back so the client can prove the bytes actually landed in Railway.
  // Returning size + mime lets the UI surface a silent failure instead of
  // celebrating an empty save.
  const after = await prisma.employerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { logoBytes: true, logoMime: true },
  }).catch(() => null)
  const saved = {
    logoBytes: after?.logoBytes ? after.logoBytes.length : 0,
    logoMime:  after?.logoMime || null,
  }

  return NextResponse.json({ success: true, saved })
}

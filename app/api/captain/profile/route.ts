import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { requireSession } from '@/lib/session'

// Avatar parsing: data: URL → bytes for Postgres bytea storage. Captain
// avatars used to flow through Supabase Storage; pulled out so every image
// lives in Railway. Existing https / data: rows pass through unchanged.
function parseAvatar(value: unknown):
  | { kind: 'bytes'; bytes: Buffer; mime: string }
  | { kind: 'url';   url: string }
  | { kind: 'err';   error: string }
{
  if (typeof value !== 'string') return { kind: 'err', error: 'Avatar must be a string' }
  if (/^https?:\/\//.test(value)) return { kind: 'url', url: value }
  const m = /^data:(image\/[a-z+0-9.-]+)(?:;[^;,]+)*;base64,(.*)$/i.exec(value)
  if (!m) return { kind: 'err', error: 'Avatar must be a valid image (data URL or https)' }
  const mime = m[1].toLowerCase()
  let bytes: Buffer
  try { bytes = Buffer.from(m[2], 'base64') }
  catch { return { kind: 'err', error: 'Avatar base64 is malformed' } }
  if (bytes.length === 0)              return { kind: 'err', error: 'Avatar is empty after decode' }
  if (bytes.length > 5 * 1024 * 1024)  return { kind: 'err', error: 'Avatar is over 5MB — compress before uploading' }
  return { kind: 'bytes', bytes, mime }
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SW'
  // Use crypto.randomInt to avoid biased Math.random for invite codes
  const { randomInt } = require('crypto') as typeof import('crypto')
  for (let i = 0; i < 6; i++) code += chars[randomInt(0, chars.length)]
  return code
}

async function ensureReferralCode(captainProfileId: string): Promise<string> {
  const profile = await prisma.captainProfile.findUnique({ where: { id: captainProfileId }, select: { referralCode: true } })
  if (profile?.referralCode) return profile.referralCode
  // Generate unique code
  let code = genCode()
  let attempts = 0
  while (attempts < 10) {
    const existing = await prisma.captainProfile.findUnique({ where: { referralCode: code } })
    if (!existing) break
    code = genCode()
    attempts++
  }
  await prisma.captainProfile.update({ where: { id: captainProfileId }, data: { referralCode: code } })
  return code
}

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'CAPTAIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where:   { id: payload.userId },
    include: { captainProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.captainProfile && !user.captainProfile.referralCode) {
    await ensureReferralCode(user.captainProfile.id)
    const updated = await prisma.captainProfile.findUnique({ where: { userId: user.id } })
    const { password: _, ...safe } = user
    return NextResponse.json({ user: { ...stripAvatarBytes(safe), captainProfile: updated } })
  }

  const { password: _, ...safe } = user
  return NextResponse.json({ user: stripAvatarBytes(safe) })
}

// Replace User.avatarBytes/avatarMime with a URL pointing at the binary
// endpoint so the JSON response stays small and client <img> tags can use
// the URL directly. Bytes never leave the server-rendered response.
function stripAvatarBytes<T extends { id: string; avatar?: string | null; avatarBytes?: Buffer | null; avatarMime?: string | null }>(u: T): T {
  const out: T & { avatar?: string | null } = { ...u }
  if (out.avatarBytes) out.avatar = `/api/users/${out.id}/avatar?v=${out.id.slice(-6)}`
  delete (out as { avatarBytes?: unknown }).avatarBytes
  delete (out as { avatarMime?:  unknown }).avatarMime
  return out
}

export async function PATCH(req: NextRequest) {
  const sess = await requireSession(['CAPTAIN'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const { name, city, avatar, lat, lng } = await req.json()

  // Avatar storage: parse to bytes → write to User.avatarBytes + avatarMime.
  // String column (User.avatar) is cleared so the read path can prefer the
  // bytea pair without stale legacy data lingering.
  let avatarWrite: Record<string, unknown> = {}
  if (avatar != null) {
    const r = parseAvatar(avatar)
    if (r.kind === 'err')   return NextResponse.json({ error: r.error, code: 'INVALID_IMAGE_FORMAT' }, { status: 400 })
    if (r.kind === 'bytes') avatarWrite = { avatarBytes: r.bytes, avatarMime: r.mime, avatar: null }
    else                    avatarWrite = { avatar: r.url, avatarBytes: null, avatarMime: null }
  }

  const updated = await prisma.user.update({
    where:   { id: payload.userId },
    data:    { ...(name && { name }), ...avatarWrite },
    include: { captainProfile: true },
  })
  if (city || (typeof lat === 'number' && typeof lng === 'number')) {
    await prisma.captainProfile.update({
      where: { userId: payload.userId },
      data:  {
        ...(city ? { territory: city } : {}),
        ...(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng, lastSeenAt: new Date() } : {}),
      },
    })
  }
  const { password: _, ...safe } = updated
  return NextResponse.json({ user: safe })
}

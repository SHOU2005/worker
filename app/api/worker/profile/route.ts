import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromCookies } from '@/lib/auth'
import { requireSession } from '@/lib/session'
import { prepareAadhaarForStorage, encryptPII, decryptPII } from '@/lib/crypto'
// Supabase Storage was previously the upload destination — pulled out so
// every image lives in Railway Postgres bytea (profilePhotoBytes /
// aadhaarFrontBytes / aadhaarBackBytes) and is served via dedicated image
// endpoints (/api/worker/photo, /api/worker/aadhaar/[side]) rather than as
// inline base64 data URLs. Keeps payloads small without an external bucket.
import { CURRENT_AADHAAR_CONSENT_VERSION } from '@/lib/legal'

// UPI is encrypted at rest. New writes always go through encryptPII; on read
// we transparently decrypt while still understanding legacy plaintext rows.
function isLikelyEncrypted(v: string): boolean {
  return v.length >= 40 && !v.includes('@') && /^[A-Za-z0-9+/=]+$/.test(v)
}
function readUpi(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!isLikelyEncrypted(stored)) return stored
  try { return decryptPII(stored) } catch { return null }
}

export async function GET() {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'WORKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where:   { id: payload.userId },
    include: { workerProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Never return the encrypted Aadhaar number directly. Mask using last 4 digits.
  if (user.workerProfile) {
    const last4 = user.workerProfile.aadhaarLast4
    user.workerProfile.aadhaarNumber = last4 ? `XXXX-XXXX-${last4}` : null
    // Decrypt UPI for display (worker needs to see their own ID)
    user.workerProfile.upiId = readUpi(user.workerProfile.upiId)
    // Image fields: never ship raw bytes / mime over JSON. If the bytea
    // column is populated, point the client at /api/worker/photo (or
    // /api/worker/aadhaar/front|back) which streams the binary with
    // Cache-Control. If only the legacy URL column is populated, return
    // that as-is so existing rows keep rendering.
    type WP = NonNullable<typeof user.workerProfile>
    const wp = user.workerProfile as WP & { profilePhotoBytes?: Buffer | null; profilePhotoMime?: string | null; aadhaarFrontBytes?: Buffer | null; aadhaarFrontMime?: string | null; aadhaarBackBytes?: Buffer | null; aadhaarBackMime?: string | null }
    if (wp.profilePhotoBytes)  user.workerProfile.profilePhoto = `/api/worker/photo?v=${user.id.slice(-6)}`
    if (wp.aadhaarFrontBytes)  user.workerProfile.aadhaarFront = `/api/worker/aadhaar/front?v=${user.id.slice(-6)}`
    if (wp.aadhaarBackBytes)   user.workerProfile.aadhaarBack  = `/api/worker/aadhaar/back?v=${user.id.slice(-6)}`
    // Strip the actual byte fields from the JSON response — they're only
    // for the streaming endpoints, never useful to the client directly.
    delete (user.workerProfile as { profilePhotoBytes?: unknown }).profilePhotoBytes
    delete (user.workerProfile as { profilePhotoMime?: unknown  }).profilePhotoMime
    delete (user.workerProfile as { aadhaarFrontBytes?: unknown }).aadhaarFrontBytes
    delete (user.workerProfile as { aadhaarFrontMime?: unknown  }).aadhaarFrontMime
    delete (user.workerProfile as { aadhaarBackBytes?:  unknown }).aadhaarBackBytes
    delete (user.workerProfile as { aadhaarBackMime?:   unknown }).aadhaarBackMime
  }

  return NextResponse.json({ user })
}

export async function PATCH(req: NextRequest) {
  const sess = await requireSession(['WORKER'])
  if (sess instanceof NextResponse) return sess
  const { payload } = sess

  const body = await req.json()
  const { name, city, skills, bio, lat, lng, profilePhoto, upiId, aadhaarFront, aadhaarBack, aadhaarNumber, aadhaarConsent, locationSharingConsent, isAvailable } = body

  // Trail every PATCH so a "looks successful but not saved" report can be
  // traced in Vercel logs without ambiguity. Sizes only — never log the
  // base64 data URL itself (PII + log bloat).
  console.log('[/api/worker/profile] PATCH', {
    userId:   payload.userId,
    photo:    typeof profilePhoto === 'string' ? `${Math.round(profilePhoto.length/1024)}KB` : null,
    front:    typeof aadhaarFront === 'string' ? `${Math.round(aadhaarFront.length/1024)}KB` : null,
    back:     typeof aadhaarBack  === 'string' ? `${Math.round(aadhaarBack.length/1024)}KB` : null,
    hasAadhaarNum: !!aadhaarNumber,
    consent:  aadhaarConsent === true,
  })

  // If the client is sending Aadhaar data, they MUST also send aadhaarConsent: true.
  // We require this every time Aadhaar fields are written so the consent record
  // matches the data being stored.
  const wantsAadhaarWrite = aadhaarFront != null || aadhaarBack != null || aadhaarNumber != null
  if (wantsAadhaarWrite && aadhaarConsent !== true) {
    return NextResponse.json({
      error: 'Aadhaar consent is required before uploading any Aadhaar information',
      code:  'AADHAAR_CONSENT_REQUIRED',
      consentVersion: CURRENT_AADHAAR_CONSENT_VERSION,
    }, { status: 400 })
  }

  // Encrypt Aadhaar before storage; never persist plaintext. Two failure modes:
  //   - Aadhaar format invalid (12 digits required)  → 400, ask user to retype.
  //   - PII_ENC_KEY env var missing on the server     → 500, deployment misconfig.
  // The original code conflated both as 400 and ALSO returned early, which
  // meant the profilePhoto / images uploaded on the same PATCH never saved
  // either. Surface the deployment error explicitly so it shows up in Vercel
  // logs / Sentry, and bubble images through to the upsert regardless so a
  // missing key only blocks the Aadhaar number column — not the whole save.
  let aadhaarFields: { aadhaarNumber: string; aadhaarLast4: string } | null = null
  if (aadhaarNumber != null) {
    try {
      aadhaarFields = prepareAadhaarForStorage(String(aadhaarNumber))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid Aadhaar'
      const isEnvMissing = /PII_ENC_KEY/.test(msg)
      if (isEnvMissing) {
        console.error('[/api/worker/profile] PII_ENC_KEY missing — set it in your Vercel/Railway env. See DEPLOYMENT.md.')
        return NextResponse.json({
          error: 'Server is missing the encryption key. Ask the admin to set PII_ENC_KEY (see DEPLOYMENT.md).',
          code:  'PII_ENC_KEY_MISSING',
        }, { status: 500 })
      }
      return NextResponse.json({ error: msg, code: 'INVALID_AADHAAR' }, { status: 400 })
    }
  }

  // Build consent record if this PATCH includes Aadhaar fields
  const consentFields = wantsAadhaarWrite ? {
    aadhaarConsentVersion: CURRENT_AADHAAR_CONSENT_VERSION,
    aadhaarConsentAt:      new Date(),
    aadhaarConsentIp:      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
  } : null

  // Parse a data: URL into raw bytes + mime so we can persist as Postgres
  // bytea instead of a base64 TEXT column. Supports the optional "charset"
  // parameter some Android WebViews insert. https URLs from previous
  // deploys are passed through untouched (the GET path keeps reading
  // them so existing rows don't break).
  function parseImage(value: unknown, label: string):
    | { kind: 'bytes'; bytes: Buffer; mime: string }
    | { kind: 'url';   url: string }
    | { kind: 'err';   error: string }
  {
    if (typeof value !== 'string') return { kind: 'err', error: `${label} must be a string` }
    if (/^https?:\/\//.test(value)) return { kind: 'url', url: value }
    const m = /^data:(image\/[a-z+0-9.-]+)(?:;[^;,]+)*;base64,(.*)$/i.exec(value)
    if (!m) return { kind: 'err', error: `${label} must be a valid image (data URL or https URL)` }
    const mime = m[1].toLowerCase()
    let bytes: Buffer
    try { bytes = Buffer.from(m[2], 'base64') }
    catch { return { kind: 'err', error: `${label} base64 payload is malformed` } }
    if (bytes.length === 0) return { kind: 'err', error: `${label} is empty after decode` }
    if (bytes.length > 5 * 1024 * 1024) return { kind: 'err', error: `${label} is over 5MB — compress before uploading` }
    return { kind: 'bytes', bytes, mime }
  }

  let photoBytes: Buffer | undefined; let photoMime: string | undefined; let photoUrl: string | undefined
  let aadhaarFrontBytes: Buffer | undefined; let aadhaarFrontMime: string | undefined; let aadhaarFrontUrl: string | undefined
  let aadhaarBackBytes:  Buffer | undefined; let aadhaarBackMime:  string | undefined; let aadhaarBackUrl:  string | undefined

  if (profilePhoto != null) {
    const r = parseImage(profilePhoto, 'Profile photo')
    if (r.kind === 'err')   return NextResponse.json({ error: r.error, code: 'INVALID_IMAGE_FORMAT' }, { status: 400 })
    if (r.kind === 'bytes') { photoBytes = r.bytes; photoMime = r.mime }
    else                    { photoUrl   = r.url }
  }
  if (aadhaarFront != null) {
    const r = parseImage(aadhaarFront, 'Aadhaar front')
    if (r.kind === 'err')   return NextResponse.json({ error: r.error, code: 'INVALID_IMAGE_FORMAT' }, { status: 400 })
    if (r.kind === 'bytes') { aadhaarFrontBytes = r.bytes; aadhaarFrontMime = r.mime }
    else                    { aadhaarFrontUrl   = r.url }
  }
  if (aadhaarBack != null) {
    const r = parseImage(aadhaarBack, 'Aadhaar back')
    if (r.kind === 'err')   return NextResponse.json({ error: r.error, code: 'INVALID_IMAGE_FORMAT' }, { status: 400 })
    if (r.kind === 'bytes') { aadhaarBackBytes = r.bytes; aadhaarBackMime = r.mime }
    else                    { aadhaarBackUrl   = r.url }
  }

  // Auto-approve KYC when this PATCH provides all four required pieces
  // (selfie + Aadhaar front + Aadhaar back + Aadhaar number with consent).
  // Either bytea or legacy URL counts as "provided".
  const autoApproveKyc =
    (photoBytes        != null || photoUrl        != null) &&
    (aadhaarFrontBytes != null || aadhaarFrontUrl != null) &&
    (aadhaarBackBytes  != null || aadhaarBackUrl  != null) &&
    aadhaarFields != null &&
    aadhaarConsent === true

  // UPI encryption can also throw if PII_ENC_KEY is missing — guard it
  // separately from the main write so a UPI-encryption failure doesn't drop
  // the photo / Aadhaar images on the floor.
  let upiCipher: string | undefined
  if (upiId != null) {
    try {
      upiCipher = encryptPII(String(upiId).trim().toLowerCase())
    } catch (err) {
      console.error('[/api/worker/profile] UPI encryption failed:', err)
      return NextResponse.json({
        error: 'Server is missing the encryption key. Ask the admin to set PII_ENC_KEY (see DEPLOYMENT.md).',
        code:  'PII_ENC_KEY_MISSING',
      }, { status: 500 })
    }
  }

  // Image columns: when bytea is being written we also clear the legacy
  // String column so the read path doesn't return stale data. When the
  // caller sends a fresh URL (https://...) we keep the legacy column and
  // clear the bytea pair.
  const photoWrite = photoBytes
    ? { profilePhotoBytes: photoBytes, profilePhotoMime: photoMime ?? null, profilePhoto: null }
    : photoUrl !== undefined
      ? { profilePhoto: photoUrl, profilePhotoBytes: null, profilePhotoMime: null }
      : {}
  const aFrontWrite = aadhaarFrontBytes
    ? { aadhaarFrontBytes, aadhaarFrontMime: aadhaarFrontMime ?? null, aadhaarFront: null }
    : aadhaarFrontUrl !== undefined
      ? { aadhaarFront: aadhaarFrontUrl, aadhaarFrontBytes: null, aadhaarFrontMime: null }
      : {}
  const aBackWrite  = aadhaarBackBytes
    ? { aadhaarBackBytes,  aadhaarBackMime:  aadhaarBackMime  ?? null, aadhaarBack:  null }
    : aadhaarBackUrl !== undefined
      ? { aadhaarBack: aadhaarBackUrl, aadhaarBackBytes: null, aadhaarBackMime: null }
      : {}

  const profileWrite = {
    ...(city            != null ? { city }                            : {}),
    ...(skills          != null ? { skills }                          : {}),
    ...(bio             != null ? { bio }                              : {}),
    ...(upiCipher       != null ? { upiId: upiCipher }                 : {}),
    ...(lat             != null ? { lat }                              : {}),
    ...(lng             != null ? { lng }                              : {}),
    ...photoWrite,
    ...aFrontWrite,
    ...aBackWrite,
    ...(aadhaarFields ? aadhaarFields : {}),
    ...(consentFields ? consentFields : {}),
    ...(typeof locationSharingConsent === 'boolean' ? { locationSharingConsent } : {}),
    ...(typeof isAvailable             === 'boolean' ? { isAvailable }             : {}),
    ...(autoApproveKyc ? { kycStatus: 'APPROVED' as const, aadhaarVerified: true } : {}),
  }

  // Wrap the DB writes in try/catch so column-size / constraint / connectivity
  // errors come back as a real 500 with a useful message, not as an opaque
  // "fetch failed" on the client.
  try {
    await Promise.all([
      name ? prisma.user.update({ where: { id: payload.userId }, data: { name } }) : null,
      prisma.workerProfile.upsert({
        where:  { userId: payload.userId },
        create: { userId: payload.userId, ...profileWrite },
        update: profileWrite,
      }),
    ])
  } catch (err) {
    console.error('[/api/worker/profile] upsert failed:', err)
    const msg = err instanceof Error ? err.message : 'Database write failed'
    return NextResponse.json({
      error: 'Could not save your profile. ' + msg,
      code:  'DB_WRITE_FAILED',
    }, { status: 500 })
  }

  // Read-back: confirm to the client what's actually in the DB right now.
  // Without this, the client only sees `{success:true}` and can't tell
  // whether the image bytes actually landed. Returning the byte sizes lets
  // the UI display "Saved: photo 33KB, aadhaar front 47KB" so users (and
  // ops) can spot any silent failures immediately.
  const after = await prisma.workerProfile.findUnique({
    where:  { userId: payload.userId },
    select: { profilePhotoBytes: true, aadhaarFrontBytes: true, aadhaarBackBytes: true, aadhaarLast4: true },
  }).catch(() => null)
  const saved = {
    profilePhotoBytes: after?.profilePhotoBytes ? after.profilePhotoBytes.length : 0,
    aadhaarFrontBytes: after?.aadhaarFrontBytes ? after.aadhaarFrontBytes.length : 0,
    aadhaarBackBytes:  after?.aadhaarBackBytes  ? after.aadhaarBackBytes.length  : 0,
    aadhaarLast4:      after?.aadhaarLast4 || null,
  }

  return NextResponse.json({ success: true, kycStatus: autoApproveKyc ? 'APPROVED' : undefined, saved })
}

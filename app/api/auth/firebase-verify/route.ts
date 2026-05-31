import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, COOKIE_CONFIG } from '@/lib/auth'
import { isAdminPhone, isValidRole } from '@/lib/config'
import { hit, ipKey } from '@/lib/rate-limit'
import { randomInt } from 'crypto'

const API_KEY   = process.env.NEXT_PUBLIC_FIREBASE_AUTH_API_KEY  || ''
const CREDS_B64 = process.env.HEARUS_FIREBASE_CREDENTIALS_BASE64 || ''

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SW'
  for (let i = 0; i < 6; i++) code += chars[randomInt(0, chars.length)]
  return code
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genCode()
    const existing = await prisma.captainProfile.findUnique({ where: { referralCode: code } })
    if (!existing) return code
  }
  return genCode() + Date.now().toString(36).slice(-3).toUpperCase()
}

let adminVerify: ((token: string) => Promise<{ phone: string } | null>) | null = null

async function getAdminVerifier() {
  if (adminVerify) return adminVerify
  if (!CREDS_B64) return null
  try {
    const admin = (await import('firebase-admin')).default
    const creds   = JSON.parse(Buffer.from(CREDS_B64, 'base64').toString('utf-8'))
    const appName = 'hearus-admin'
    const app = admin.apps.find(a => a?.name === appName)
      || admin.initializeApp({ credential: admin.credential.cert(creds) }, appName)
    const auth = admin.auth(app)
    adminVerify = async (idToken: string) => {
      try {
        const decoded = await auth.verifyIdToken(idToken)
        const phone = (decoded.phone_number || '').replace(/^\+91/, '')
        if (!phone) return null
        return { phone }
      } catch { return null }
    }
    return adminVerify
  } catch { return null }
}

async function verifyViaREST(idToken: string): Promise<{ phone: string } | null> {
  if (!API_KEY) return null
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const user = data.users?.[0]
    if (!user?.phoneNumber) return null
    return { phone: user.phoneNumber.replace(/^\+91/, '') }
  } catch { return null }
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ phone: string } | null> {
  const adminFn = await getAdminVerifier()
  if (adminFn) return adminFn(idToken)
  return verifyViaREST(idToken)
}

export async function POST(req: NextRequest) {
  try {
    const rl = hit(ipKey(req, 'fb-verify'), 30, 15 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const body = await req.json()
    const {
      idToken, role, referralCode,
      name: providedName,
      city,
      companyName,
      ownerName,
      territory,
      requireExisting,  // login pages send true — refuse to create new users
    } = body

    if (!idToken) return NextResponse.json({ error: 'idToken required' }, { status: 400 })

    // Validate requested role
    if (role && !isValidRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const verified = await verifyFirebaseIdToken(idToken)
    if (!verified) return NextResponse.json({ error: 'Invalid or expired Firebase token' }, { status: 401 })

    const { phone } = verified
    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Could not extract phone number from token' }, { status: 400 })
    }

    let captainRefId: string | undefined
    if (referralCode) {
      const cap = await prisma.captainProfile.findUnique({
        where: { referralCode: String(referralCode).toUpperCase().trim() },
      })
      if (cap) captainRefId = cap.id
    }

    const requestedRole = role as 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN' | undefined
    const isFounderAdmin = isAdminPhone(phone)

    // Block OPS/ADMIN self-onboarding for everyone EXCEPT the founder admin phone.
    // Founder admin is auto-granted ADMIN role on first login.
    if ((requestedRole === 'OPS' || requestedRole === 'ADMIN') && !isFounderAdmin) {
      const ex = await prisma.user.findFirst({
        where:  { phone, role: requestedRole },
        select: { id: true, role: true, opsProfile: { select: { id: true } } },
      })
      if (!ex || (requestedRole === 'OPS' && !ex.opsProfile)) {
        return NextResponse.json({ error: 'Staff account required', code: 'STAFF_ACCOUNT_REQUIRED' }, { status: 403 })
      }
    }

    // Per-role account lookup. A single phone can hold a separate User
    // row for each role (WORKER, EMPLOYER, CAPTAIN, OPS, ADMIN) — see
    // the @@unique([phone, role]) on the User model. The login flows
    // always pass a `role`, so we look up the row for THAT role. If the
    // user has an EMPLOYER account but is logging into the worker app,
    // we treat it as a new sign-up (no WORKER row exists for this phone).
    const USER_SELECT = {
      id: true, phone: true, name: true, role: true, password: true,
      isActive: true, tokenVersion: true, avatar: true,
    } as const
    // Look up the account matching the role the caller is asking for.
    // A founder admin signing into the worker app is treated like any
    // other worker — they get a separate WORKER row. If they want to
    // use ADMIN privileges they sign into the ops portal (role=ADMIN
    // or role=OPS) which keys to their staff account row.
    const lookupRole: 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN' =
      (requestedRole as 'WORKER' | 'EMPLOYER' | 'CAPTAIN' | 'OPS' | 'ADMIN' | undefined) ?? 'WORKER'
    let user = await prisma.user.findFirst({ where: { phone, role: lookupRole }, select: USER_SELECT })

    // Founder admin sigining into the ops portal: the portal sends role='OPS',
    // but the founder may already have an ADMIN row (or vice-versa). Accept
    // either staff row so they don't have to know which one they registered as.
    if (!user && isFounderAdmin && (requestedRole === 'OPS' || requestedRole === 'ADMIN')) {
      const otherRole = requestedRole === 'OPS' ? 'ADMIN' : 'OPS'
      user = await prisma.user.findFirst({ where: { phone, role: otherRole }, select: USER_SELECT })
    }

    // Login flows pass requireExisting:true — refuse to auto-create a User from the
    // login page. Caller must redirect the client to the signup page.
    if (!user && requireExisting === true) {
      return NextResponse.json({
        error: 'This number is not registered. Please sign up first.',
        code:  'PHONE_NOT_REGISTERED',
      }, { status: 404 })
    }

    if (!user) {
      const displayName = providedName?.trim() || `User ${phone.slice(-4)}`

      // Founder-admin phones can self-onboard into the ADMIN/OPS role
      // (they pass the STAFF_ACCOUNT_REQUIRED gate at the top). The ops
      // portal sends role='OPS' with no providedName from the OTP login
      // page — that's a direct login, not a signup, so we default the
      // name to "Admin" rather than refusing. Worker/employer signups
      // from a founder phone still create normal WORKER/EMPLOYER rows
      // — same path as everyone else.
      if (isFounderAdmin && (requestedRole === 'ADMIN' || requestedRole === 'OPS')) {
        user = await prisma.user.create({
          data:   { phone, name: providedName?.trim() || 'Admin', role: requestedRole, password: '' },
          select: USER_SELECT,
        })
        if (requestedRole === 'OPS') {
          await prisma.opsProfile.create({ data: { userId: user.id } })
        }
      } else if (role === 'CAPTAIN') {
        user = await prisma.user.create({
          data:   { phone, name: displayName, role: 'CAPTAIN', password: '' },
          select: USER_SELECT,
        })
        await prisma.captainProfile.create({
          data: { userId: user.id, status: 'PENDING', referralCode: await uniqueReferralCode(), ...(territory ? { territory } : {}) },
        })
      } else {
        // OPS/ADMIN already short-circuited above; only WORKER/EMPLOYER reach here.
        const userRole = (role === 'EMPLOYER' ? 'EMPLOYER' : 'WORKER') as 'EMPLOYER' | 'WORKER'
        user = await prisma.user.create({
          data: {
            phone,
            name: displayName,
            role: userRole,
            password: '',
            ...(captainRefId ? { captainReferralId: captainRefId } : {}),
          },
          select: USER_SELECT,
        })
        if (userRole === 'WORKER') {
          await prisma.workerProfile.create({
            data: {
              userId: user.id,
              ...(captainRefId ? { captainReferralId: captainRefId } : {}),
              ...(city ? { city } : {}),
            },
            select: { id: true },
          })
        } else {
          await prisma.employerProfile.create({
            data: {
              userId: user.id,
              ...(captainRefId ? { captainReferralId: captainRefId } : {}),
              ...(city ? { city } : {}),
              ...(companyName ? { companyName } : {}),
              ...(ownerName ? { ownerName } : {}),
            },
            select: { id: true },
          })
        }
      }
    } else if (providedName?.trim() && user.name !== providedName.trim()) {
      // Update name on login if provided (e.g. registration re-attempt)
      user = await prisma.user.update({
        where:  { id: user.id },
        data:   { name: providedName.trim() },
        select: USER_SELECT,
      })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    // Admin / staff: with per-role User rows, ADMIN access is reached by
    // explicitly signing in with role=ADMIN (or role=OPS) from the ops
    // portal — which looks up the user's ADMIN/OPS row directly. Other
    // role logins for founder-admin phones now produce WORKER or
    // EMPLOYER accounts like everyone else; the founder still gets
    // through the STAFF_ACCOUNT_REQUIRED gate at the top of this
    // handler when they reach the ops app, where their ADMIN row is
    // created if missing.
    if (user.role === 'ADMIN' || user.role === 'OPS') {
      const isPlaceholderName = user.name === 'Admin' || /^User \d{4}$/.test(user.name || '')
      if (isPlaceholderName && requireExisting === true) {
        return NextResponse.json({
          error: 'Profile setup required for admin account.',
          code:  'PHONE_NOT_REGISTERED',
          isAdmin: true,
        }, { status: 404 })
      }
      // Make sure the staff profile exists for the role we're signing in as.
      if (user.role === 'OPS') {
        await prisma.opsProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} })
      }
      const token = signToken({ userId: user.id, role: user.role, phone: user.phone, v: user.tokenVersion ?? 0 })
      const adminRes = NextResponse.json({ success: true, role: user.role, isAdmin: user.role === 'ADMIN' })
      adminRes.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
      return adminRes
    }

    // Per-role accounts: by this point, `user` was looked up via
    // findFirst({ phone, role: lookupRole }), so user.role always
    // matches what the caller requested. The old multi-role upsert
    // (that updated User.role and added the other profile on top of
    // the same row) is gone — each role gets its own User row now.
    const tokenRole: 'EMPLOYER' | 'WORKER' | 'ADMIN' | 'CAPTAIN' | 'OPS' = user.role

    const token = signToken({ userId: user.id, role: tokenRole, phone: user.phone, v: user.tokenVersion ?? 0 })
    const response = NextResponse.json({ success: true, role: tokenRole })
    response.cookies.set(COOKIE_CONFIG.name, token, COOKIE_CONFIG.options)
    return response
  } catch (err) {
    console.error('firebase-verify error:', err)
    // P2002 on `phone` means the production DB still has the legacy
    // single-column unique on users.phone. The schema's composite
    // @@unique([phone, role]) hasn't been applied yet — until it is,
    // any phone that already holds an EMPLOYER row can't sign up for
    // a WORKER row (or vice-versa). Surface a clear, operator-actionable
    // message rather than the raw Prisma string.
    const e = err as { code?: string; meta?: { target?: string[] | string } }
    if (e?.code === 'P2002') {
      const target = Array.isArray(e.meta?.target) ? e.meta!.target!.join(',') : (e.meta?.target ?? '')
      if (target === 'phone' || target === 'users_phone_key') {
        return NextResponse.json({
          error: 'This phone is already registered under another role. The server needs the latest DB schema (`npx prisma db push` or apply migration 20260520130000_phone_role_unique).',
          code:  'DB_SCHEMA_STALE',
        }, { status: 500 })
      }
    }
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({
      error: msg.length > 0 ? `Server error: ${msg}` : 'Internal server error',
      code:  'INTERNAL',
    }, { status: 500 })
  }
}

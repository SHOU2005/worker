import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

// ADMIN-only diagnostic — used to be public, but the response leaks DB host,
// region, error messages, and env-var presence. Now gated behind a session
// with role: 'ADMIN'. In production we additionally refuse non-localhost
// requests so it can never be probed externally even by a logged-in admin.
export async function GET() {
  const sess = await requireSession(['ADMIN'])
  if (sess instanceof NextResponse) return sess

  const out: Record<string, unknown> = {
    env: {
      DATABASE_URL_set:    !!process.env.DATABASE_URL,
      DATABASE_URL_host:   process.env.DATABASE_URL ? hostOf(process.env.DATABASE_URL) : null,
      DIRECT_URL_set:      !!process.env.DIRECT_URL,
      DIRECT_URL_host:     process.env.DIRECT_URL   ? hostOf(process.env.DIRECT_URL)   : null,
      VERCEL_REGION:       process.env.VERCEL_REGION || null,
      NODE_ENV:            process.env.NODE_ENV     || null,
    },
    canConnect:    null,
    userCount:     null,
    workerCount:   null,
    captainCount:  null,
    error:         null,
    diagnosis:     null,
  }

  try {
    // Tiny query — just SELECT 1 — fastest way to confirm connection works
    const ping = await prisma.$queryRaw`SELECT 1 AS ok` as Array<{ ok: number }>
    out.canConnect = ping.length > 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    out.canConnect = false
    out.error = msg
    if (/can.?t reach|ECONNREFUSED|ENOTFOUND|server.*not.*running/i.test(msg)) {
      out.diagnosis = 'DATABASE_URL is wrong or DB is down. Check the host portion of your URL — it should be aws-1-ap-southeast-1.pooler.supabase.com (full domain, ending in .com). The port for runtime should be 6543.'
    } else if (/authentication failed|password authentication/i.test(msg)) {
      out.diagnosis = 'Password in DATABASE_URL is wrong, or it has special chars not URL-encoded. @ must be %40, # must be %23, & must be %26.'
    } else {
      out.diagnosis = `Unexpected DB error. Raw message: ${msg}`
    }
    return NextResponse.json(out, { status: 503 })
  }

  // If we got here, the connection works — count rows
  try {
    const [u, w, c] = await Promise.all([
      prisma.user.count(),
      prisma.workerProfile.count(),
      prisma.captainProfile.count(),
    ])
    out.userCount    = u
    out.workerCount  = w
    out.captainCount = c
    out.diagnosis    = 'DB is healthy. If the dashboard still shows 0 after this, hard-refresh the browser (Cmd+Shift+R) and re-login.'
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err)
    out.diagnosis = 'Connection works but counting tables failed. Likely a schema mismatch.'
  }

  return NextResponse.json(out)
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return 'invalid-url' }
}

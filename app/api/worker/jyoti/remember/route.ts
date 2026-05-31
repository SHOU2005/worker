import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { hit, ipKey } from '@/lib/rate-limit'
import { rememberConversation, type TranscriptTurn } from '@/lib/jyoti-memory'

// POST /api/worker/jyoti/remember
//
// Called by the client when a Jyoti voice session ends. Takes the call's
// transcript turns and folds them into the worker's long-term memory (a
// summarise-and-compress step in lib/jyoti-memory.ts), so the NEXT call can
// open with continuity — the thing that makes Jyoti feel like a friend who
// remembers rather than a stranger every time.
//
// Body: { turns: { role: 'worker' | 'jyoti', text: string }[] }
//
// This is best-effort and fire-and-forget from the client's perspective:
// failures here never affect the call the worker just had. We still authn,
// rate-limit, and validate so a misbehaving client can't spam the LLM.

const MAX_TURNS = 80

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'WORKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // One memory write per call; a worker realistically ends ≤ a handful of
  // calls an hour. Cap generously per user, plus a coarse IP guard.
  const userRl = hit(`jyoti-remember:${payload.userId}`, 30, 60 * 60 * 1000)
  if (!userRl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  const ipRl = hit(ipKey(req, 'jyoti-remember-ip'), 100, 60 * 60 * 1000)
  if (!ipRl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as { turns?: unknown }
  const rawTurns = Array.isArray(body.turns) ? body.turns : []

  // Sanitise into the shape the memory layer expects; drop anything malformed.
  const turns: TranscriptTurn[] = rawTurns
    .slice(0, MAX_TURNS)
    .map((t) => {
      const o = t as { role?: unknown; text?: unknown }
      const role = o.role === 'worker' || o.role === 'jyoti' ? o.role : null
      const text = typeof o.text === 'string' ? o.text.trim() : ''
      return role && text ? { role, text } : null
    })
    .filter((t): t is TranscriptTurn => t !== null)

  // Even an empty transcript is worth recording — it bumps callCount /
  // lastCallAt so the cadence-aware greeting ("kal baat hui thi") stays right.
  await rememberConversation(payload.userId, turns)

  return NextResponse.json({ ok: true })
}

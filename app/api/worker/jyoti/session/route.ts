import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hit, ipKey } from '@/lib/rate-limit'
import {
  getSignedConversationUrl,
  ElevenLabsNotConfiguredError,
  ElevenLabsUpstreamError,
} from '@/lib/elevenlabs-session'
import { readMemoryVars } from '@/lib/jyoti-memory'

// POST /api/worker/jyoti/session
//
// Returns a single-use signed ElevenLabs Conversational AI URL plus the
// dynamic variables that the agent prompt expects (worker name, shift
// details, language preference). The client passes the signedUrl into the
// `@elevenlabs/react` SDK and the variables get interpolated into Jyoti's
// system prompt when the conversation opens.
//
// Body (optional): { shiftId?: string } — when present we attach that
// shift's context. Without it, Jyoti opens with no specific shift in scope
// (useful for the rare case the worker summons her outside the active-shift
// screen — she greets and offers to help find their booking).
//
// We never ship the API key to the client; the signed URL is the entire
// trust boundary. The URL is short-lived (~1 min on the ElevenLabs side)
// and single-use, which limits replay risk if the response is intercepted.

export async function POST(req: NextRequest) {
  // ─── Authn ────────────────────────────────────────────────────────────
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'WORKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── Rate limit ───────────────────────────────────────────────────────
  // Each session costs us an ElevenLabs WebSocket minute + LLM tokens. A
  // tab that opens/closes Jyoti repeatedly could mint dozens of URLs per
  // minute. Cap at 20/hour per worker — generous enough that real users
  // never hit it, tight enough that a bug in the client doesn't drain
  // budget. IP key is a secondary guard against credential-stuffed workers.
  const userRl = hit(`jyoti-session:${payload.userId}`, 20, 60 * 60 * 1000)
  if (!userRl.ok) {
    return NextResponse.json({ error: 'Too many sessions. Please wait.' }, { status: 429 })
  }
  const ipRl = hit(ipKey(req, 'jyoti-session-ip'), 60, 60 * 60 * 1000)
  if (!ipRl.ok) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  // ─── Body ─────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as { shiftId?: string }
  const shiftId = typeof body.shiftId === 'string' ? body.shiftId : null

  // ─── Worker + shift context ───────────────────────────────────────────
  // Loaded in parallel — independent queries. We tolerate one or the other
  // failing (network blip on the secondary lookup shouldn't take down
  // Jyoti when she could still greet by name).
  // Memory loaded alongside — it's a best-effort enhancement (readMemoryVars
  // never throws), so it rides in the same parallel batch without risk of
  // taking down the session if the memory table/row is absent.
  const [user, booking, memoryVars] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: payload.userId },
      select: {
        id: true, name: true,
        workerProfile: {
          select: {
            city: true,
            kycStatus: true,
          },
        },
      },
    }),
    shiftId
      ? prisma.booking.findFirst({
          where:  { shiftId, worker: { userId: payload.userId } },
          select: {
            id: true, status: true, checkInTime: true,
            shift: {
              select: {
                id: true, title: true, startTime: true, endTime: true,
                address: true, city: true, lat: true, lng: true,
                duration: true, status: true,
                employer: {
                  select: {
                    companyName: true,
                    ownerName: true,
                    user: { select: { name: true, phone: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve(null),
    readMemoryVars(payload.userId),
  ])

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Multi-language: default to Hinglish for the opening line; ElevenLabs
  // auto-detects whatever the worker actually speaks (Bhojpuri, Tamil,
  // Telugu, Marathi, Bengali, Kannada, Gujarati) and mirrors it. If we ever
  // store a preferredLanguage on WorkerProfile we can read it here without
  // touching the agent or the client.
  const preferredLanguage = 'hi'

  // ─── Mint signed URL ──────────────────────────────────────────────────
  let signed: { signedUrl: string; agentId: string }
  try {
    signed = await getSignedConversationUrl()
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) {
      return NextResponse.json({ error: 'Jyoti is not configured on this server' }, { status: 503 })
    }
    if (err instanceof ElevenLabsUpstreamError) {
      console.error('[JYOTI] upstream error', err.status, err.message)
      return NextResponse.json({ error: 'Voice service temporarily unavailable' }, { status: 502 })
    }
    console.error('[JYOTI] unknown error', err)
    return NextResponse.json({ error: 'Could not start Jyoti session' }, { status: 500 })
  }

  // Build the dynamic variables the agent prompt interpolates. Names here
  // must match the {{var}} placeholders configured on the ElevenLabs agent
  // — keep this in sync with scripts/update-jyoti-worker-agent.ts.
  const employer = booking?.shift?.employer
  const dynamicVariables: Record<string, string | number> = {
    worker_name:          user.name || 'bhaiya',
    worker_language:      preferredLanguage,
    worker_city:          user.workerProfile?.city || '',
    has_active_shift:     booking ? 'yes' : 'no',
    shift_title:          booking?.shift?.title || '',
    shift_start_time:     booking?.shift?.startTime || '',
    shift_end_time:       booking?.shift?.endTime || '',
    // "Malik / Sahab ka naam" is the PERSON, not the company. Prefer the
    // contact's name (e.g. "Saurabh"); fall back to ownerName, then company.
    // Bug fix: previously companyName won, so Jyoti said "WeWork Cyber Hub"
    // when the worker asked the employer's name.
    employer_name:        employer?.user?.name || employer?.ownerName || employer?.companyName || '',
    // Separate variable for the business/place so the agent can still say
    // "WeWork Cyber Hub pe shift hai" when talking about WHERE the shift is.
    employer_company:     employer?.companyName || '',
    employer_address:     booking?.shift?.address || booking?.shift?.city || '',
    booking_id:           booking?.id || '',
    shift_id:             booking?.shift?.id || '',
    arrival_completed:    booking?.checkInTime ? 'yes' : 'no',
    shift_status:         booking?.status || '',
    // ── Memory: what Jyoti remembers about this worker from past calls ──
    // Lets the agent open with continuity instead of a cold "Namaste".
    // The agent prompt (Vance-prod) reads these to pick its greeting branch.
    ...memoryVars,
  }

  return NextResponse.json({
    signedUrl:         signed.signedUrl,
    agentId:           signed.agentId,
    dynamicVariables,
    // Surface non-sensitive context to the client so JyotiMic can render
    // chips ("Talking to Jyoti about shift at Reliance Trends") without a
    // second round-trip to load the booking.
    context: {
      workerName:   user.name,
      shiftTitle:   booking?.shift?.title || null,
      employerName: employer?.companyName || employer?.user?.name || null,
      hasShift:     Boolean(booking),
    },
  })
}

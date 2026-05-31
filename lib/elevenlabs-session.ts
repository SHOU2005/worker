// Mint a short-lived signed conversation URL for the ElevenLabs Conversational
// AI agent. The signed URL is consumed by the browser-side `@elevenlabs/react`
// SDK to open a WebSocket directly to ElevenLabs without ever shipping the
// API key to the worker's device.
//
// Why signed-URL minting:
//   - The API key carries full account permissions; embedding it in the
//     Capacitor bundle (even as a NEXT_PUBLIC_) would leak it to anyone who
//     pulled an APK or opened devtools.
//   - The signed URL is scoped to a single conversation and a short TTL,
//     so a compromised URL stops working in minutes.
//
// Callers: app/api/worker/jyoti/session/route.ts is the only callsite. This
// helper exists separately so the route stays a thin authn/authz wrapper and
// can be unit-tested against a mock fetch.

const EL_API_BASE = 'https://api.elevenlabs.io'

export class ElevenLabsNotConfiguredError extends Error {
  code = 'no_key' as const
  constructor() { super('ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID is not set') }
}

export class ElevenLabsUpstreamError extends Error {
  code = 'upstream' as const
  status: number
  constructor(status: number, body: string) {
    super(`ElevenLabs ${status}: ${body.slice(0, 200)}`)
    this.status = status
  }
}

export interface SignedUrlResult {
  signedUrl: string
  agentId:   string
}

/**
 * Request a signed conversation URL for the worker arrival agent.
 * Throws `ElevenLabsNotConfiguredError` if env vars are missing.
 * Throws `ElevenLabsUpstreamError` if ElevenLabs rejects the request.
 */
export async function getSignedConversationUrl(): Promise<SignedUrlResult> {
  const apiKey  = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) throw new ElevenLabsNotConfiguredError()

  // The get-signed-url endpoint takes the agent id in the query string and
  // returns { signed_url } scoped to a single conversation. The URL is
  // single-use — once a WS connects with it, it cannot be reused.
  const res = await fetch(
    `${EL_API_BASE}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      method:  'GET',
      headers: { 'xi-api-key': apiKey },
      // Short timeout — if ElevenLabs is slow we'd rather fail fast and let
      // the worker see "voice unavailable" than block the route for 30s.
      // Next.js fetch default has no timeout; AbortController is the
      // platform-portable way to enforce one.
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ElevenLabsUpstreamError(res.status, body)
  }

  const data = await res.json() as { signed_url?: string }
  if (!data.signed_url) {
    throw new ElevenLabsUpstreamError(500, 'No signed_url in response')
  }
  return { signedUrl: data.signed_url, agentId }
}

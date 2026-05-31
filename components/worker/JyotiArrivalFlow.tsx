'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ConversationProvider,
  useConversation,
} from '@elevenlabs/react'
import JyotiMic, { type MicVisualState } from './JyotiMic'
import ArrivalSelfieCapture from './ArrivalSelfieCapture'
import {
  buildClientToolHandlers,
  haversineMetres,
  type ClientToolDeps,
} from '@/lib/jyoti-tools'
import { openMaps } from '@/lib/open-maps'

// JyotiArrivalFlow is the orchestrator that lives at the top of the active-
// shift route. Responsibilities:
//   1. Manage the ElevenLabs Conversational AI session lifecycle
//   2. Wire client tools (camera, maps, OTP, geo) to the host context
//   3. Render the floating JyotiMic orb + transcript chip
//   4. Mount ArrivalSelfieCapture as an overlay when Jyoti triggers it
//
// The component is split into a provider wrapper + inner consumer because
// `useConversation` requires a ConversationProvider ancestor. Keeping the
// split here also means callers don't have to remember to wrap anything.

export interface JyotiArrivalShift {
  id:       string
  title?:   string
  address?: string
  city?:    string
  lat?:     number | null
  lng?:     number | null
  mapsUrl?: string | null
  // Optional employer contact — when present, Jyoti's `call_employer` tool
  // launches the device dialer pre-filled with this number.
  employer?: {
    user?: {
      phone?: string | null
      name?:  string | null
    } | null
    companyName?: string | null
  } | null
}

export interface JyotiArrivalFlowProps {
  shift:     JyotiArrivalShift | null
  bookingId: string | null
  /** Called when Jyoti's verify_otp_and_start tool successfully starts the
   *  shift, so the host page can refresh state. */
  onShiftStarted?: () => void
  /** Optional reason to auto-start the conversation on mount — instead of
   *  waiting for the worker to tap the orb. The reason becomes the
   *  `call_purpose` dynamic variable so the agent routes to the right
   *  opener (e.g. "post_accept_confirm" → "Aapki shift confirm hai, aap
   *  jaoge na?" instead of "Namaste"). Pass once via URL param / state. */
  autoStartReason?: 'post_accept_confirm' | null
}

export default function JyotiArrivalFlow(props: JyotiArrivalFlowProps) {
  return (
    <ConversationProvider>
      <JyotiArrivalFlowInner {...props} />
    </ConversationProvider>
  )
}

// Per-booking de-dupe so a worker who navigates back to the same active-shift
// route doesn't get the post-accept opener twice in the same session. Cleared
// when the worker logs out (cookie reset) or the tab refreshes — the LS key
// includes the bookingId so different bookings still get their own confirm.
const AUTO_STARTED_KEY = (bookingId: string | null) => `jyoti_auto_started_${bookingId ?? 'none'}`

/* ─────────────────────────────────────────────────────────────────────────
   Inner consumer — owns the conversation lifecycle and tool wiring.
   ───────────────────────────────────────────────────────────────────────── */
function JyotiArrivalFlowInner({ shift, bookingId, onShiftStarted, autoStartReason }: JyotiArrivalFlowProps) {
  const [caption,      setCaption]      = useState<string | null>(null)
  const [errorBanner,  setErrorBanner]  = useState<string | null>(null)
  const [showCamera,   setShowCamera]   = useState(false)
  // True from the instant the worker taps "Call Jyoti" until the WS is
  // actually connected. Without this, the call screen + ringtone only appear
  // once conversation.status flips to 'connecting' — which is AFTER the
  // signed-URL fetch round-trip, so the worker tapped and ~1s of nothing
  // happened. Flipping this immediately makes the call UI feel instant.
  const [isStarting,   setIsStarting]   = useState(false)

  // Transcript accumulator — every worker/Jyoti turn from onMessage is
  // pushed here so we can ship the whole conversation to /remember when the
  // call ends. A ref (not state) because we don't want a re-render per turn
  // and the value only needs to be read at teardown. Reset on each connect.
  const transcriptRef = useRef<{ role: 'worker' | 'jyoti'; text: string }[]>([])

  // Flush the accumulated transcript into Jyoti's long-term memory. Uses
  // sendBeacon so the POST survives the page being torn down / navigated
  // away from at call-end (a normal fetch would be cancelled). Clears the
  // buffer so a subsequent call in the same mount starts fresh and we never
  // double-write the same turns.
  const flushMemory = useCallback(() => {
    const turns = transcriptRef.current
    transcriptRef.current = []
    if (turns.length === 0) return
    try {
      const blob = new Blob([JSON.stringify({ turns })], { type: 'application/json' })
      const sent = typeof navigator !== 'undefined' && 'sendBeacon' in navigator
        ? navigator.sendBeacon('/api/worker/jyoti/remember', blob)
        : false
      if (!sent) {
        // Fallback for environments without sendBeacon (older Capacitor WebViews).
        fetch('/api/worker/jyoti/remember', {
          method:    'POST',
          headers:   { 'Content-Type': 'application/json' },
          body:      JSON.stringify({ turns }),
          keepalive: true,
        }).catch(() => {})
      }
    } catch { /* memory is best-effort — never break teardown */ }
  }, [])

  // Promise resolver stored in a ref so the camera tool can await the
  // upload result. We can't use plain state because the tool needs to
  // return a Promise that resolves later — refs survive re-renders without
  // re-triggering effects.
  const cameraResolverRef = useRef<((r: { uploaded: boolean }) => void) | null>(null)

  // Geolocation watch — keeps a running last-known position so the
  // `read_distance_to_employer` tool returns immediately without waiting
  // for a fresh GPS fix. Stops when the component unmounts.
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        lastPositionRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
      },
      () => { /* permission denied or timeout — tool will report unknown */ },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  /* ── Tool deps ─────────────────────────────────────────────────────── */
  const deps: ClientToolDeps = useMemo(() => ({
    shift: shift
      ? {
          id:       shift.id,
          title:    shift.title,
          address:  shift.address,
          city:     shift.city,
          lat:      shift.lat ?? undefined,
          lng:      shift.lng ?? undefined,
          mapsUrl:  shift.mapsUrl ?? undefined,
        }
      : null,

    openArrivalCamera: () =>
      new Promise<{ uploaded: boolean }>((resolve) => {
        // Re-using the existing ArrivalSelfieCapture flow — its onUploaded
        // resolves us with uploaded:true. If the worker closes Jyoti before
        // uploading we'll resolve with uploaded:false on cleanup.
        cameraResolverRef.current = resolve
        setShowCamera(true)
      }),

    fillOtpDigits: () => {
      // V1 punt: Jyoti reads digits back to the worker for confirmation
      // and submits directly via verify_otp_and_start. Auto-filling the
      // visible OTP boxes is a Phase 4 polish (needs a bridge into
      // ActiveShiftCard's local state) — leave the no-op here so the tool
      // call doesn't crash if the agent invokes it.
    },

    submitOtp: async (digits: string) => {
      if (!shift?.id) return { ok: false, message: 'koi shift nahi mila' }
      try {
        const res = await fetch(`/api/employer/jobs/${shift.id}/otp`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ otp: digits, ...(bookingId ? { bookingId } : {}) }),
        })
        if (res.ok) {
          onShiftStarted?.()
          return { ok: true }
        }
        const d = await res.json().catch(() => ({})) as { error?: string }
        return { ok: false, message: d.error || 'OTP galat hai' }
      } catch (e) {
        return { ok: false, message: (e as Error).message || 'network error' }
      }
    },

    readDistanceToEmployer: async () => {
      const pos = lastPositionRef.current
      if (!pos || !shift?.lat || !shift?.lng) return null
      return haversineMetres(pos, { lat: shift.lat, lng: shift.lng })
    },

    callEmployer: () => {
      const raw = shift?.employer?.user?.phone
      if (!raw || typeof window === 'undefined') return false
      // Strip non-digits, then prefix +91 for Indian numbers if missing.
      // Capacitor's WebView treats tel: as a system-handled scheme — it
      // opens the native dialer without leaving the app.
      const digits = String(raw).replace(/\D/g, '')
      const e164   = digits.length === 10 ? `+91${digits}` : `+${digits}`
      window.location.href = `tel:${e164}`
      return true
    },

    endConversation: () => { /* re-bound below to the live conversation */ },
  }), [shift, bookingId, onShiftStarted])

  /* ── Build client tool handlers in the shape ElevenLabs expects ─────── */
  // Note: a ref to the conversation lets `end_conversation` call .endSession
  // without re-creating the tools map every status flip (which would re-
  // register tools and clobber the in-flight call).
  const conversationRef = useRef<{ endSession: () => void } | null>(null)
  const clientTools = useMemo(() => {
    const live: ClientToolDeps = {
      ...deps,
      endConversation: () => {
        conversationRef.current?.endSession()
        setCaption(null)
      },
    }
    const handlers = buildClientToolHandlers(live)
    // ElevenLabs expects tools that always return Promise<string|number|void>.
    // Our handlers return string|Promise<string> — wrap to always-async.
    const out: Record<string, (p: Record<string, unknown>) => Promise<string>> = {}
    for (const [name, fn] of Object.entries(handlers)) {
      out[name] = async (p) => {
        try {
          const r = await fn(p)
          return r
        } catch (e) {
          return `error: ${(e as Error).message}`
        }
      }
    }
    return out
  }, [deps])

  /* ── ElevenLabs conversation ───────────────────────────────────────── */
  const conversation = useConversation({
    clientTools,
    // Play Jyoti's voice at full output gain. Workers are often outdoors / on
    // a noisy street, so default-level TTS felt too quiet on the call screen.
    volume: 1,
    onConnect: () => {
      setErrorBanner(null)
      setIsStarting(false) // WS is live — the real connecting/listening state takes over
      // Fresh conversation — start a clean transcript so we never carry
      // turns across two separate calls in the same mount.
      transcriptRef.current = []
    },
    onDisconnect: () => {
      setCaption(null)
      // Call ended — fold what was said into Jyoti's long-term memory.
      flushMemory()
    },
    onError: (err) => {
      console.error('[JYOTI] conversation error', err)
      setErrorBanner('Voice service disconnected')
    },
    onMessage: ({ message, source }) => {
      if (typeof message !== 'string') return
      // Record every turn for memory. 'ai' = Jyoti, 'user' = the worker.
      transcriptRef.current.push({
        role: source === 'ai' ? 'jyoti' : 'worker',
        text: message,
      })
      // Surface only Jyoti's lines in the caption chip — the worker's own
      // voice is echo and would just clutter the floating UI.
      if (source === 'ai') {
        setCaption(message.length > 160 ? message.slice(0, 157) + '…' : message)
      }
    },
  })

  // Keep the ref in sync so client tools can call endSession.
  useEffect(() => {
    conversationRef.current = { endSession: conversation.endSession }
  }, [conversation.endSession])

  /* ── Visual state derivation ───────────────────────────────────────── */
  // isStarting forces the 'connecting' surface (call screen + ringtone) the
  // moment the worker taps, even before the signed-URL fetch returns — so the
  // tap feels instant instead of dead for ~1s.
  const visualState: MicVisualState = errorBanner
    ? 'error'
    : (isStarting || conversation.status === 'connecting')
      ? 'connecting'
      : conversation.status === 'connected'
        ? (conversation.isSpeaking ? 'speaking' : 'listening')
        : 'idle'

  /* ── Toggle handler ────────────────────────────────────────────────── */
  const onToggle = useCallback(async () => {
    // If already connected, end the session — gives the worker an explicit
    // "stop" affordance without making them hold the orb.
    if (conversation.status === 'connected' || conversation.status === 'connecting' || isStarting) {
      conversation.endSession()
      setIsStarting(false)
      return
    }
    setErrorBanner(null)
    // Flip the call UI on NOW — the ringtone + call screen appear instantly
    // while the signed-URL fetch happens in the background.
    setIsStarting(true)
    setCaption('Jyoti se connect ho rahi hu…')
    try {
      const res = await fetch('/api/worker/jyoti/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(shift?.id ? { shiftId: shift.id } : {}),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setErrorBanner(d.error || 'Voice unavailable right now')
        setCaption(null)
        setIsStarting(false)
        return
      }
      const data = await res.json() as {
        signedUrl: string
        dynamicVariables?: Record<string, string | number>
      }
      // Merge in call_purpose if this is an auto-started session — the agent
      // prompt uses it to pick the post-accept confirmation opener.
      const mergedVars: Record<string, string | number> = {
        ...(data.dynamicVariables || {}),
        ...(autoStartReason ? { call_purpose: autoStartReason } : {}),
      }
      await conversation.startSession({
        signedUrl:        data.signedUrl,
        dynamicVariables: mergedVars,
      } as unknown as Parameters<typeof conversation.startSession>[0])
    } catch (e) {
      setErrorBanner((e as Error).message || 'Could not start Jyoti')
      setCaption(null)
      setIsStarting(false)
    }
  }, [conversation, shift?.id, isStarting, autoStartReason])

  const onClose = useCallback(() => {
    conversation.endSession()
    setCaption(null)
  }, [conversation])

  // Resolve any pending camera-tool promise on unmount so the agent doesn't
  // sit forever waiting if the worker navigates away mid-flow.
  useEffect(() => {
    return () => {
      if (cameraResolverRef.current) {
        cameraResolverRef.current({ uploaded: false })
        cameraResolverRef.current = null
      }
      // Worker navigated away mid-call (e.g. closed the tab without tapping
      // End) — onDisconnect may not fire, so flush any captured turns here
      // too. flushMemory clears the buffer, so the onDisconnect path and this
      // one can never double-write.
      flushMemory()
    }
  }, [flushMemory])

  // Auto-start when autoStartReason is set AND we haven't already auto-started
  // for this booking. Without the de-dupe, navigating back to /worker/active/X
  // would re-open Jyoti every time, which is jarring.
  useEffect(() => {
    if (!autoStartReason) return
    if (typeof window === 'undefined') return
    const key = AUTO_STARTED_KEY(bookingId)
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, String(Date.now()))
    // Small delay so the ConversationProvider context is fully set up before
    // we trigger a session — React StrictMode double-invokes effects which
    // would otherwise race the WS handshake.
    const t = setTimeout(() => { onToggle() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartReason, bookingId])

  return (
    <>
      {/* Hide the call UI completely when the camera is open so the
          ArrivalSelfieCapture overlay has the full viewport and the user
          isn't fighting two stacked full-screen modals. The conversation
          stays alive in the background; CallScreen returns once selfie
          uploads (showCamera → false). */}
      {!showCamera && <JyotiMic
        state={visualState}
        // User explicitly asked: don't show Jyoti's sentences on screen.
        // Voice + status line is enough — keeps the call UI clean.
        caption={errorBanner ?? null}
        onToggle={onToggle}
        onClose={onClose}
        // Quick-action chips on the call screen — let the worker bypass
        // Jyoti and act directly when they already know what they want.
        // Wired to the same side effects Jyoti's tools fire, so behavior
        // is identical whether the worker taps or asks.
        onOpenMaps={shift ? () => {
          openMaps({
            address: shift.address,
            lat:     shift.lat ?? undefined,
            lng:     shift.lng ?? undefined,
            mapsUrl: shift.mapsUrl ?? undefined,
            label:   shift.title,
          })
        } : null}
        onCallEmployer={shift?.employer?.user?.phone ? () => deps.callEmployer() : null}
        isMuted={conversation.isMuted}
        onToggleMute={() => conversation.setMuted(!conversation.isMuted)}
      />}

      {/* Camera overlay — z-index 80 keeps it above any residual CallScreen
          paint during the unmount transition. Renders even if bookingId is
          null so the worker sees an explanation instead of a silent no-op
          when the agent calls open_arrival_camera on an edge-case booking. */}
      {showCamera && bookingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <ArrivalSelfieCapture
            bookingId={bookingId}
            onUploaded={() => {
              setShowCamera(false)
              cameraResolverRef.current?.({ uploaded: true })
              cameraResolverRef.current = null
            }}
          />
        </div>
      )}
      {showCamera && !bookingId && (
        // No bookingId means we can't actually save the selfie. Tell the
        // worker, then resolve the camera promise so the agent can move on.
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80, background: '#000000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', textAlign: 'center', padding: 24,
        }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Camera unavailable</p>
            <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
              No active booking attached.
            </p>
            <button
              onClick={() => {
                setShowCamera(false)
                cameraResolverRef.current?.({ uploaded: false })
                cameraResolverRef.current = null
              }}
              style={{
                padding: '12px 22px', borderRadius: 12, border: 'none',
                background: '#FFFFFF', color: '#111111',
                fontWeight: 800, fontSize: 14, cursor: 'pointer',
              }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}

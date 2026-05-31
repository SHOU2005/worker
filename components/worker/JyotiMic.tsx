'use client'
import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff, MapPin } from 'lucide-react'

// JyotiMic — call-style voice surface for the worker assistant.
//
// Idle: a floating green "Call Jyoti" pill at the bottom-right of the
// host screen. Looks like the standard accept-call button workers
// recognise from any incoming phone call UI.
//
// Active (connecting / listening / speaking / error): a full-screen
// call overlay that mimics a normal phone call screen — pulsing
// avatar, large name, status line, end-call button. While the
// ElevenLabs session is opening we play a synthesised "tring tring"
// Indian ringback tone so the worker knows the call is connecting
// instead of staring at a frozen "Connecting…" string.

export type MicVisualState =
  | 'idle'           // not connected — tap to start
  | 'connecting'     // signed URL fetched, WS opening — RINGTONE PLAYS
  | 'listening'      // mic open, Jyoti waiting for speech
  | 'speaking'       // Jyoti is talking
  | 'error'          // last session failed

export interface JyotiMicProps {
  state:         MicVisualState
  caption?:      string | null
  onToggle:      () => void
  onClose:       () => void
  ariaLabel?:    string
  /** Quick-action chips on the call screen — let the worker open Maps or
   *  dial Sahab without talking through Jyoti. Hidden when handlers null. */
  onOpenMaps?:    (() => void) | null
  onCallEmployer?: (() => void) | null
  /** Mic mute toggle. When provided, a Mute chip appears next to MIC LIVE. */
  isMuted?:       boolean
  onToggleMute?:  (() => void) | null
}

export default function JyotiMic({
  state, caption, onToggle, onClose, ariaLabel,
  onOpenMaps, onCallEmployer, isMuted, onToggleMute,
}: JyotiMicProps) {
  const active = state !== 'idle'

  // Ringtone — only while CONNECTING. Stops as soon as ElevenLabs hands
  // back the first audio chunk (state flips to listening or speaking).
  useRingbackTone(state === 'connecting')

  // Idle — small floating call button so the host page stays usable.
  if (!active) {
    return (
      <button
        onClick={onToggle}
        aria-label={ariaLabel || 'Call Jyoti'}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 'calc(96px + var(--safe-b, 0px))',
          zIndex: 60,
          minWidth: 124, height: 56, borderRadius: 28,
          padding: '0 18px',
          border: 'none',
          background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
          color: '#FFFFFF',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 10px 28px rgba(22,163,74,0.45), 0 4px 12px rgba(0,0,0,0.18)',
          fontFamily: 'inherit',
        }}>
        <Phone style={{ width: 18, height: 18, fill: '#FFFFFF', strokeWidth: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.6 }}>CALL JYOTI</span>
      </button>
    )
  }

  // Active — full screen call overlay
  return (
    <CallScreen
      state={state}
      caption={caption}
      onClose={onClose}
      onOpenMaps={onOpenMaps ?? null}
      onCallEmployer={onCallEmployer ?? null}
      isMuted={isMuted}
      onToggleMute={onToggleMute ?? null}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Full-screen call UI. Black backdrop, large pulsing avatar, name,
   status line, optional Jyoti caption chip, and a single red End Call
   button. Mirrors the platform's incoming/outgoing call UI so a worker
   needs zero learning to use it.
   ───────────────────────────────────────────────────────────────────────── */
function CallScreen({
  state, caption, onClose, onOpenMaps, onCallEmployer, isMuted, onToggleMute,
}: {
  state:    MicVisualState
  caption?: string | null
  onClose:  () => void
  onOpenMaps:    (() => void) | null
  onCallEmployer:(() => void) | null
  isMuted?: boolean
  onToggleMute:  (() => void) | null
}) {
  // Call duration counter — starts at 0 and ticks while the call is alive.
  // Resets on every connect; persists through speaking↔listening flips.
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      if (connectedAt === null) setConnectedAt(Date.now())
    } else if (state === 'idle' || state === 'error') {
      setConnectedAt(null)
    }
  }, [state, connectedAt])
  useEffect(() => {
    if (connectedAt === null) return
    const id = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [connectedAt])
  const durationSecs = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0
  const mm = String(Math.floor(durationSecs / 60)).padStart(2, '0')
  const ss = String(durationSecs % 60).padStart(2, '0')

  const status =
    state === 'connecting' ? 'Calling Jyoti…' :
    state === 'listening'  ? (isMuted ? `Muted · ${mm}:${ss}` : `Connected · ${mm}:${ss}`) :
    state === 'speaking'   ? `Jyoti bol rahi hai · ${mm}:${ss}` :
                             'Call dropped — tap to retry'

  const accent =
    state === 'speaking'  ? '#7C3AED' :
    state === 'listening' ? '#22C55E' :
    state === 'connecting'? '#3B82F6' :
                            '#EF4444'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'linear-gradient(180deg, #0A0A0A 0%, #1F1F1F 70%, #050505 100%)',
        color: '#FFFFFF',
        display: 'flex', flexDirection: 'column' as const,
        paddingTop: 'calc(48px + var(--safe-t, 0px))',
        paddingBottom: 'calc(32px + var(--safe-b, 0px))',
        paddingLeft: 24, paddingRight: 24,
      }}>
      {/* Top — Switch label */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase' as const, fontWeight: 800,
        }}>
          Switch · Voice
        </span>
      </div>

      {/* Middle — Avatar + name + status, vertically centred so the screen
          feels balanced regardless of safe-area on different devices. */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        gap: 18,
      }}>
        <Avatar state={state} accent={accent} />
        <p style={{
          fontSize: 36, fontWeight: 900, letterSpacing: -0.8,
          background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.7) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Jyoti</p>
        <p style={{
          fontSize: 14, color: 'rgba(255,255,255,0.55)',
          fontWeight: 600, letterSpacing: 0.2,
          marginTop: -8,
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {status}
        </p>
        {/* Optional caption shown ONLY as a tiny error banner when something
            goes wrong. Successful Jyoti sentences are never rendered as text
            — voice is the channel, screen is the chrome. */}
        {state === 'error' && caption && (
          <div style={{
            marginTop: 14, padding: '10px 16px',
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.35)',
            borderRadius: 14,
            fontSize: 13, color: '#FCA5A5', fontWeight: 600,
            maxWidth: 280, textAlign: 'center' as const,
          }}>
            {caption}
          </div>
        )}
      </div>

      {/* Bottom controls — quick actions, mute, end call.
          Quick actions let the worker bypass Jyoti and act directly when
          they already know what to do (e.g. just tap Maps without asking). */}
      <div style={{
        display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', gap: 14,
      }}>
        {state === 'listening' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: isMuted ? 'rgba(220,38,38,0.18)' : 'rgba(34,197,94,0.14)',
            border: `1px solid ${isMuted ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.35)'}`,
          }}>
            {isMuted
              ? <MicOff style={{ width: 12, height: 12, color: '#FCA5A5' }} />
              : <Mic    style={{ width: 12, height: 12, color: '#4ADE80' }} />
            }
            <span style={{ fontSize: 11, fontWeight: 800, color: isMuted ? '#FCA5A5' : '#86EFAC', letterSpacing: 0.5 }}>
              {isMuted ? 'MIC MUTED' : 'MIC LIVE'}
            </span>
          </div>
        )}

        {/* Quick action chips — Maps + Call Sahab.
            Hidden during connecting / error so the screen stays focused
            on the connect/recover affordance. */}
        {(state === 'listening' || state === 'speaking') && (onOpenMaps || onCallEmployer) && (
          <div style={{ display: 'flex', gap: 10 }}>
            {onOpenMaps && (
              <button onClick={onOpenMaps} aria-label="Open Maps"
                style={chipStyle('#22C55E')}>
                <MapPin style={{ width: 14, height: 14 }} />
                <span style={{ fontSize: 12, fontWeight: 800 }}>Maps</span>
              </button>
            )}
            {onCallEmployer && (
              <button onClick={onCallEmployer} aria-label="Call Sahab"
                style={chipStyle('#3B82F6')}>
                <Phone style={{ width: 14, height: 14, fill: '#FFFFFF', strokeWidth: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 800 }}>Call Sahab</span>
              </button>
            )}
          </div>
        )}

        {/* Bottom button row — Mute | End | (placeholder for symmetry) */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22,
        }}>
          {onToggleMute && (state === 'listening' || state === 'speaking') ? (
            <button
              onClick={onToggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              style={{
                width: 56, height: 56, borderRadius: 28, border: 'none',
                background: isMuted ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                color:      isMuted ? '#111111' : '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isMuted ? '0 6px 20px rgba(255,255,255,0.22)' : 'none',
              }}>
              {isMuted
                ? <MicOff style={{ width: 22, height: 22 }} />
                : <Mic    style={{ width: 22, height: 22 }} />
              }
            </button>
          ) : <div style={{ width: 56 }} />}

          <button
            onClick={onClose}
            aria-label="End call"
            style={{
              width: 72, height: 72, borderRadius: 36, border: 'none',
              background: '#DC2626', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 28px rgba(220,38,38,0.45)',
              cursor: 'pointer',
            }}>
            <PhoneOff style={{ width: 28, height: 28 }} />
          </button>

          <div style={{ width: 56 }} />
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
          End call
        </span>
      </div>
    </div>
  )
}

function chipStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 14px', borderRadius: 999,
    background: `${accent}1F`,
    border: `1px solid ${accent}55`,
    color: '#FFFFFF',
    cursor: 'pointer',
  }
}

/* Animated avatar disc — pulses while listening, equaliser while speaking,
   ring pulse while connecting, static while error. Bigger than typical phone
   avatar so it's the obvious focal point on the call screen. */
function Avatar({ state, accent }: { state: MicVisualState; accent: string }) {
  return (
    <div
      style={{
        position: 'relative' as const,
        width: 200, height: 200, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {/* Speaking — animated bars overlaid on the disc. */}
      {(state === 'connecting' || state === 'listening' || state === 'speaking') && (
        <>
          <span style={{
            position: 'absolute', inset: -16, borderRadius: '50%',
            border: `2px solid ${accent}`,
            animation: state === 'speaking'
              ? 'jyotiCallRing 1.1s ease-out infinite'
              : 'jyotiCallRing 1.9s ease-out infinite',
            opacity: 0.55,
          }} />
          <span style={{
            position: 'absolute', inset: -16, borderRadius: '50%',
            border: `2px solid ${accent}`,
            animation: state === 'speaking'
              ? 'jyotiCallRing 1.1s ease-out 0.45s infinite'
              : 'jyotiCallRing 1.9s ease-out 0.65s infinite',
            opacity: 0.3,
          }} />
        </>
      )}
      <div style={{
        width: 168, height: 168, borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${accent}48 0%, ${accent}18 40%, rgba(0,0,0,0) 80%), linear-gradient(140deg, ${accent}33 0%, ${accent}11 100%)`,
        border: `2px solid ${accent}66`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 72, fontWeight: 900, color: '#FFFFFF',
        letterSpacing: -2,
        boxShadow: `0 0 80px ${accent}55, inset 0 -20px 40px ${accent}22`,
        textShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}>
        J
      </div>

      <style>{`
        @keyframes jyotiCallRing {
          0%   { transform: scale(1);   opacity: 0.55; }
          70%  { transform: scale(1.4); opacity: 0;    }
          100% { transform: scale(1.4); opacity: 0;    }
        }
      `}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Synthesised Indian ringback tone — classic "tring tring" double-ring.
   400Hz tone with cadence: 0.4s on, 0.2s off, 0.4s on, 2s off (repeat).
   Web Audio synth so we don't need to ship an audio asset. Auto-cleans up
   when the active flag flips false or the component unmounts.
   ───────────────────────────────────────────────────────────────────────── */
function useRingbackTone(active: boolean) {
  const ctxRef    = useRef<AudioContext | null>(null)
  const gainRef   = useRef<GainNode    | null>(null)
  const oscRef    = useRef<OscillatorNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return

    let stopped = false

    // Capacitor / mobile Safari autoplay rules: an AudioContext requires a
    // user gesture before it can output sound. We're inside a tap-handler
    // chain (onToggle from the call button), so resume() will succeed.
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return

    const ctx = new Ctx()
    ctxRef.current = ctx
    const master = ctx.createGain()
    master.gain.value = 0.0  // start silent; we ramp inside the ring pattern
    master.connect(ctx.destination)
    gainRef.current = master

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 400  // Indian standard ringback ~400Hz
    osc.connect(master)
    osc.start()
    oscRef.current = osc

    const RING_ON  = 400   // ms
    const RING_GAP = 200   // ms between the two short bursts
    const TONE_VOL = 0.18

    function playOneTringTring() {
      if (stopped) return
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(0, t)
      // tone 1 ─ 0..0.4s
      master.gain.linearRampToValueAtTime(TONE_VOL, t + 0.02)
      master.gain.setValueAtTime(TONE_VOL, t + RING_ON / 1000 - 0.02)
      master.gain.linearRampToValueAtTime(0, t + RING_ON / 1000)
      // tone 2 ─ 0.6..1.0s
      const t2 = t + (RING_ON + RING_GAP) / 1000
      master.gain.setValueAtTime(0, t2)
      master.gain.linearRampToValueAtTime(TONE_VOL, t2 + 0.02)
      master.gain.setValueAtTime(TONE_VOL, t2 + RING_ON / 1000 - 0.02)
      master.gain.linearRampToValueAtTime(0, t2 + RING_ON / 1000)
    }

    // 1 cycle (tring-tring + silence) = 3 seconds — matches the real ring cadence.
    ctx.resume().then(() => {
      if (stopped) return
      playOneTringTring()
      const id = setInterval(playOneTringTring, 3000)
      intervalRef.current = id
    }).catch(() => { /* autoplay blocked — fall back silently */ })

    return () => {
      stopped = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      try { oscRef.current?.stop()    } catch {}
      try { oscRef.current?.disconnect() } catch {}
      try { gainRef.current?.disconnect() } catch {}
      ctxRef.current?.close().catch(() => {})
      oscRef.current = null
      gainRef.current = null
      ctxRef.current  = null
      intervalRef.current = null
    }
  }, [active])
}

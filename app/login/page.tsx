'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Star, Zap, IndianRupee } from 'lucide-react'
import { sendPhoneCode, confirmPhoneCode } from '@/lib/firebase-phone-auth'
import { track } from '@/lib/posthog'

// useSearchParams forces this page out of static rendering — wrap in
// Suspense so Next can prerender the shell and hydrate the search-param
// hook on the client. Required since Next 14.
export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>
}

function LoginInner() {
  const router  = useRouter()
  const search  = useSearchParams()
  const [phone,   setPhone]   = useState('')
  const [otp,     setOtp]     = useState('')
  const [stage,   setStage]   = useState<'phone' | 'otp'>('phone')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [countdown, setCountdown] = useState(0)

  // First-launch language gate. The worker app boots into /login (via
  // /players); if the user hasn't picked a language yet, bounce them to
  // /language first so the rest of the app renders in their language.
  // /language reads `next` from the query string and replaces history
  // back to here once a language is saved, so the user never sees the
  // gate again.
  useEffect(() => {
    try {
      const lang = localStorage.getItem('sw_lang')
      if (!lang) {
        router.replace('/language?next=/login')
        return
      }
    } catch { /* sessionStorage / localStorage may be disabled */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pre-fill phone when /register bounced the user back here so they don't
  // have to re-type it — single phone-entry across the whole signup flow.
  useEffect(() => {
    const p = search?.get('phone')
    if (p && /^\d{10}$/.test(p)) setPhone(p)
  }, [search])

  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  const phoneOk = /^\d{10}$/.test(phone)
  const otpOk   = /^\d{6}$/.test(otp)

  async function handleSendOtp() {
    if (!phoneOk || loading) return
    setLoading(true); setError('')
    try {
      // OTP first — verify the number is real before checking the DB. After
      // verification, /api/auth/firebase-verify with requireExisting:true tells
      // us whether to land them on the dashboard or send them to /register.
      await sendPhoneCode(phone)
      setStage('otp')
      setCountdown(60)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  async function handleVerify() {
    if (!otpOk || loading) return
    setLoading(true); setError('')
    try {
      const { idToken } = await confirmPhoneCode(otp)
      const res  = await fetch('/api/auth/firebase-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // requireExisting prevents auto-creating a User on the login page
        body: JSON.stringify({ idToken, role: 'WORKER', requireExisting: true }),
      })
      const data = await res.json()
      if (res.status === 404 && data?.code === 'PHONE_NOT_REGISTERED') {
        // Phone is verified but no account exists. Hand the verified Firebase
        // ID token to /register so we don't make the user do a second OTP.
        // The register page treats it as fresh for ~50 minutes (Firebase
        // tokens live ~60); a stale one falls back to the normal OTP flow.
        try {
          sessionStorage.setItem(
            'worker_signup_token',
            JSON.stringify({ phone, idToken, ts: Date.now() }),
          )
        } catch { /* sessionStorage may be disabled */ }
        router.replace(`/register?phone=${phone}&verified=1`)
        return
      }
      if (res.status === 403 && data?.code === 'WRONG_APP_FOR_ROLE') {
        const r = String(data.registeredRole || '').toLowerCase()
        const target = r === 'employer' ? '/employer/login' : r === 'captain' ? '/captain/login' : r === 'ops' ? '/ops/login' : null
        setError(data.error || `This number is registered as a ${r}.`)
        if (target) setTimeout(() => router.replace(`${target}?phone=${phone}`), 1500)
        return
      }
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      track('worker_login_succeeded')
      router.replace('/worker/dashboard')
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  function handleOtpChange(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    setOtp(clean)
    setError('')
    if (clean.length === 6) {
      // auto-submit
      setTimeout(() => document.getElementById('sw-verify-btn')?.click(), 80)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column',
      paddingBottom: 'env(safe-area-inset-bottom)', color: '#fff' }}>

      {/* Hero — fixed 52% of viewport on tall phones so the 1254×1254
          square source has room to breathe; faces sit in the upper 40%
          of the image (object-position `center 20%`) so the gradient
          fade at the bottom never clips a face. The "Earn ₹45,000"
          overlay now lives in its own bottom band with its own dark
          backdrop instead of layered over the image, so on narrow
          phones the headline text never overlaps a worker's chin. */}
      <div style={{
        position: 'relative',
        height: '52vh', minHeight: 360, maxHeight: 520,
        overflow: 'hidden', flexShrink: 0,
        background: '#000',
      }}>
        <img
          src="/workers.jpg?v=3"
          alt=""
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            // Push faces toward the upper third of the crop window so
            // the bottom gradient never eats them.
            objectPosition: 'center 20%',
            display: 'block',
          }}
        />
        {/* Top fade to keep the logo readable on light-background photos */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 120,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }} />
        {/* Strong bottom fade that holds the headline */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.95) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Brand */}
        <div style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', left: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#000', lineHeight: 1 }}>S</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.2 }}>Switch Players</span>
        </div>

        {/* Headline — sized down a touch (44 → 40) and value moved up so
            the trust pills below have proper breathing room. */}
        <div style={{ position: 'absolute', bottom: 22, left: 20, right: 20 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Earn up to
          </p>
          <p style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, margin: '0 0 6px' }}>
            ₹45,000
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 14px' }}>
            per month, working near you
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { icon: <IndianRupee style={{ width: 12, height: 12 }} />, v: '₹99–₹129/hr' },
              { icon: <Star        style={{ width: 12, height: 12 }} />, v: '4.8 Rated'    },
              { icon: <Zap         style={{ width: 12, height: 12 }} />, v: 'Daily Pay'    },
            ].map(({ icon, v }) => (
              <div key={v} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.20)',
                backdropFilter: 'blur(8px)',
              }}>
                {icon}<span style={{ fontSize: 12, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card — overlap the bottom of the hero by 24px for a clean
          rounded-top transition, no visible seam between the photo and
          the card. Inner padding sized so the phone input + button
          + "Resend" affordance all sit comfortably without scroll on a
          standard 6.1" device. */}
      <div style={{
        flex: 1, background: '#000', borderRadius: '24px 24px 0 0',
        marginTop: -24,
        padding: '24px 20px 28px',
        position: 'relative', zIndex: 2,
        border: '1px solid rgba(255,255,255,0.07)',
        borderBottom: 'none',
      }}>

        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 22px' }} />
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px', letterSpacing: -0.4 }}>
          Welcome back!
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px' }}>
          {stage === 'phone' ? 'Enter your mobile number to get OTP' : `OTP sent to +91 ${phone}`}
        </p>

        {stage === 'phone' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', borderRadius: 16,
              border: `1.5px solid ${phoneOk ? '#fff' : 'rgba(255,255,255,0.1)'}`,
              background: '#111', marginBottom: 14, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
                borderRight: '1px solid rgba(255,255,255,0.08)', height: 58, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🇮🇳</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>+91</span>
              </div>
              <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number"
                value={phone} autoFocus
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                style={{ flex: 1, minWidth: 0, width: '100%', background: 'transparent', outline: 'none', border: 'none',
                  padding: '0 12px', fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: 1, height: 58,
                  boxSizing: 'border-box' as const }} />
            </div>
            {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12, fontWeight: 600 }}>{error}</p>}
            <button onClick={handleSendOtp} disabled={!phoneOk || loading}
              style={{ width: '100%', height: 56, borderRadius: 16, border: 'none',
                background: phoneOk ? '#fff' : '#1A1A1A', color: phoneOk ? '#000' : 'rgba(255,255,255,0.15)',
                fontSize: 16, fontWeight: 800, cursor: phoneOk ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', marginBottom: 12,
                boxShadow: phoneOk ? '0 8px 32px rgba(255,255,255,0.12)' : 'none' }}>
              {loading ? <><Spinner /><span>Sending OTP…</span></> : <><span>Send OTP</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
            </button>
          </>
        ) : (
          <>
            {/* OTP input — single tel field underneath, six visual boxes on top.
                Avoids the letterSpacing-overflow that broke layout on narrow
                phones. The hidden input keeps autofill / SMS-OTP autopaste
                working; tap on the boxes focuses it. */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input type="tel" inputMode="numeric" maxLength={6} pattern="\d{6}"
                autoComplete="one-time-code"
                value={otp} autoFocus
                onChange={e => handleOtpChange(e.target.value)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                  opacity: 0, background: 'transparent', border: 'none', outline: 'none',
                  cursor: 'pointer', fontSize: 16,
                  caretColor: 'transparent', color: 'transparent' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const ch = otp[i] || ''
                  const filled  = !!ch
                  const focused = otp.length === i
                  return (
                    <div key={i} style={{
                      flex: 1, minWidth: 0, height: 60,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 12,
                      background: filled ? '#1A1A1A' : '#111',
                      border: `1.5px solid ${focused ? '#fff' : filled ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                        {ch || (focused ? <span style={{ width: 2, height: 26, background: '#fff', display: 'inline-block', animation: 'caretBlink 1s steps(2) infinite' }} /> : '')}
                      </span>
                    </div>
                  )
                })}
              </div>
              <style>{`@keyframes caretBlink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }`}</style>
            </div>
            {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12, fontWeight: 600 }}>{error}</p>}
            <button id="sw-verify-btn" onClick={handleVerify} disabled={!otpOk || loading}
              style={{ width: '100%', height: 56, borderRadius: 16, border: 'none',
                background: otpOk ? '#fff' : '#1A1A1A', color: otpOk ? '#000' : 'rgba(255,255,255,0.15)',
                fontSize: 16, fontWeight: 800, cursor: otpOk ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', marginBottom: 10,
                boxShadow: otpOk ? '0 8px 32px rgba(255,255,255,0.12)' : 'none' }}>
              {loading ? <><Spinner /><span>Verifying…</span></> : <><span>Verify & Sign In</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
            </button>
            <button onClick={() => { if (countdown > 0) return; setStage('phone'); setOtp(''); setError('') }}
              disabled={countdown > 0}
              style={{ width: '100%', height: 44, background: 'none', border: 'none',
                cursor: countdown > 0 ? 'default' : 'pointer',
                color: countdown > 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 600 }}>
              {countdown > 0 ? `Resend OTP in ${countdown}s` : '← Change number / Resend OTP'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,0.2)',
      borderTopColor: '#000', animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

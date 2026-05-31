'use client'
import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ArrowLeft, ShieldCheck, BadgeCheck, Lock, Smartphone } from 'lucide-react'
import { sendPhoneCode, confirmPhoneCode } from '@/lib/firebase-phone-auth'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.58)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

export default function EmployerLoginPage() {
  return <Suspense fallback={null}><EmployerLoginInner /></Suspense>
}

function EmployerLoginInner() {
  const router = useRouter()
  const search = useSearchParams()
  const [phone, setPhone] = useState('')
  const [otp,   setOtp]   = useState('')
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [countdown, setCountdown] = useState(0)
  const verifyBtnRef = useRef<HTMLButtonElement>(null)

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
      await sendPhoneCode(phone)
      setStage('otp')
      setCountdown(60)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleVerify() {
    if (!otpOk || loading) return
    setLoading(true); setError('')
    try {
      const { idToken } = await confirmPhoneCode(otp)
      const res  = await fetch('/api/auth/firebase-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, role: 'EMPLOYER', requireExisting: true }),
      })
      const data = await res.json()
      if (res.status === 404 && data?.code === 'PHONE_NOT_REGISTERED') {
        try {
          sessionStorage.setItem('emp_signup_token', JSON.stringify({ phone, idToken, ts: Date.now() }))
        } catch {}
        router.replace(`/employer/register?phone=${phone}&verified=1`)
        return
      }
      if (res.status === 403 && data?.code === 'WRONG_APP_FOR_ROLE') {
        const r = String(data.registeredRole || '').toLowerCase()
        const target = r === 'worker' ? '/login' : r === 'captain' ? '/captain/login' : r === 'ops' ? '/ops/login' : null
        setError(data.error || `This number is registered as a ${r}.`)
        if (target) setTimeout(() => router.replace(`${target}?phone=${phone}`), 1500)
        return
      }
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      router.replace('/employer')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function handleOtpChange(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    setOtp(clean); setError('')
    if (clean.length === 6) setTimeout(() => verifyBtnRef.current?.click(), 80)
  }

  function goBack() {
    if (stage === 'otp') { setStage('phone'); setOtp(''); setError(''); return }
    router.push('/employer/splash')
  }

  return (
    <div style={{
      minHeight: '100dvh' as any, background: BG, fontFamily: FONT, color: T1,
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* Soft ambient glow behind the brand mark — subtle premium touch */}
      <div aria-hidden style={{
        position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
        width: 420, height: 360,
        background: 'radial-gradient(circle at center, rgba(255,255,255,0.06), transparent 60%)',
        pointerEvents: 'none',
      }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes login-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .login-rise { animation: login-rise 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .login-rise-1 { animation-delay: 60ms; }
        .login-rise-2 { animation-delay: 120ms; }
        .login-rise-3 { animation-delay: 180ms; }
      `}</style>

      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(14px + env(safe-area-inset-top)) 14px 8px', position: 'relative', zIndex: 1 }}>
        <button onClick={goBack} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>
      </header>

      <div style={{ flex: 1, padding: '12px 22px 28px', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>

        {/* Brand block — centred metallic "S" with title and tagline */}
        <div className="login-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 12, marginBottom: 28 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 22,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #C7C7C7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#000', fontWeight: 900, fontSize: 36, letterSpacing: -1.5,
            boxShadow: '0 18px 38px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.16)',
          }}>S</div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: T1, letterSpacing: -0.6 }}>Switch</div>
            <div style={{ fontSize: 13, color: T2, marginTop: 4 }}>Hire verified workers, on demand.</div>
          </div>
        </div>

        {stage === 'phone' ? (
          <>
            <div className="login-rise login-rise-1" style={{ fontSize: 28, fontWeight: 900, color: T1, letterSpacing: -0.7, lineHeight: 1.15, marginBottom: 8, textAlign: 'center' as const }}>
              Log in or sign up
            </div>
            <div className="login-rise login-rise-1" style={{ fontSize: 14, color: T2, lineHeight: 1.5, marginBottom: 24, textAlign: 'center' as const }}>
              Enter your phone — we'll text you a code. Same flow whether you're new or returning.
            </div>

            <div className="login-rise login-rise-2" style={{ fontSize: 12, fontWeight: 800, color: T2, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.7 }}>Mobile number</div>
            <div className="login-rise login-rise-2"
              style={{
                display: 'flex', alignItems: 'stretch',
                borderRadius: 18, border: `1.5px solid ${phoneOk ? T1 : BD}`,
                overflow: 'hidden', background: SURF,
                marginBottom: 16, minWidth: 0,
                boxShadow: phoneOk ? '0 12px 28px rgba(255,255,255,0.06)' : '0 6px 18px rgba(0,0,0,0.25)',
                transition: 'border-color 200ms, box-shadow 200ms',
              }}>
              <div style={{
                padding: '14px 14px', borderRight: `1px solid ${BD}`,
                background: SURF2, display: 'flex', alignItems: 'center', gap: 7,
                flexShrink: 0, fontWeight: 800, fontSize: 16, color: T1,
              }}>
                <span aria-hidden style={{ fontSize: 16 }}>🇮🇳</span>
                +91
              </div>
              <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" autoFocus
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent',
                  outline: 'none', border: 'none',
                  padding: '14px 14px', fontSize: 18, fontWeight: 800, color: T1,
                  fontFamily: FONT, letterSpacing: 1.2,
                }} />
            </div>

            {error && <ErrorBox msg={error} />}

            <div className="login-rise login-rise-2">
              <PrimaryButton onClick={handleSendOtp} disabled={!phoneOk || loading} loading={loading} label="Send OTP" />
            </div>

            {/* Trust strip — small chips of credibility under the CTA */}
            <div className="login-rise login-rise-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 20 }}>
              <TrustChip Icon={ShieldCheck} label="Verified pros" />
              <TrustChip Icon={Lock}        label="Secure payment" />
              <TrustChip Icon={BadgeCheck}  label="Govt ID checks" />
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ textAlign: 'center' as const, marginTop: 22, fontSize: 12, color: T3, lineHeight: 1.5 }}>
              By continuing, you agree to Switch's{' '}
              <a href="/legal" style={{ color: T2, textDecoration: 'underline' }}>Terms</a> and{' '}
              <a href="/legal" style={{ color: T2, textDecoration: 'underline' }}>Privacy Policy</a>.
            </div>
          </>
        ) : (
          <>
            <div className="login-rise login-rise-1" style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: SURF, border: `1px solid ${BD}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}>
                <Smartphone style={{ width: 26, height: 26, color: T1 }} />
              </div>
            </div>

            <div className="login-rise login-rise-1" style={{ fontSize: 28, fontWeight: 900, color: T1, letterSpacing: -0.7, lineHeight: 1.15, marginBottom: 8, textAlign: 'center' as const }}>
              Verify your number
            </div>
            <div className="login-rise login-rise-1" style={{ fontSize: 14, color: T2, lineHeight: 1.5, marginBottom: 26, textAlign: 'center' as const }}>
              We've texted a 6-digit code to <span style={{ color: T1, fontWeight: 700 }}>+91 {phone}</span>.
            </div>

            <div className="login-rise login-rise-2" style={{ fontSize: 12, fontWeight: 800, color: T2, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.7 }}>6-digit code</div>
            <input type="tel" inputMode="numeric" maxLength={6} placeholder="– – – – – –" autoFocus
              value={otp}
              onChange={e => handleOtpChange(e.target.value)}
              className="login-rise login-rise-2"
              style={{
                width: '100%', background: SURF,
                border: `1.5px solid ${otpOk ? T1 : BD}`,
                borderRadius: 18, padding: '20px 20px',
                fontSize: 30, fontWeight: 800, color: T1,
                letterSpacing: 14, outline: 'none',
                fontFamily: FONT, boxSizing: 'border-box' as const,
                marginBottom: 16, textAlign: 'center' as const,
                boxShadow: otpOk ? '0 12px 28px rgba(255,255,255,0.06)' : '0 6px 18px rgba(0,0,0,0.25)',
                transition: 'border-color 200ms, box-shadow 200ms',
              }} />

            {error && <ErrorBox msg={error} />}

            <div className="login-rise login-rise-2">
              <PrimaryButton ref={verifyBtnRef} onClick={handleVerify} disabled={!otpOk || loading} loading={loading} label={loading ? 'Verifying…' : 'Verify & continue'} />
            </div>

            <button onClick={() => { if (countdown > 0) return; setStage('phone'); setOtp(''); setError('') }} disabled={countdown > 0}
              className="login-rise login-rise-3"
              style={{ width: '100%', marginTop: 16, padding: '12px', background: 'transparent', border: 'none', color: countdown > 0 ? T3 : T2, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: countdown > 0 ? 'default' : 'pointer' }}>
              {countdown > 0 ? `Resend in ${countdown}s` : '← Change number / Resend OTP'}
            </button>

            <div style={{ flex: 1 }} />

            <div style={{ textAlign: 'center' as const, marginTop: 14, fontSize: 12, color: T3, lineHeight: 1.5 }}>
              Didn't get it? Check your SMS inbox, then tap Resend above.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TrustChip({ Icon, label }: { Icon: any; label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: '12px 8px',
      background: SURF, border: `1px solid ${BD}`,
      borderRadius: 14, color: T1, textAlign: 'center' as const,
    }}>
      <Icon style={{ width: 18, height: 18, color: T1 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: T1, letterSpacing: -0.1, lineHeight: 1.2 }}>{label}</span>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(239,68,68,0.10)',
      border: '1px solid rgba(239,68,68,0.35)',
      borderRadius: 14, padding: '12px 14px', marginBottom: 14,
      fontSize: 13, color: '#FCA5A5', lineHeight: 1.4,
    }}>
      {msg}
    </div>
  )
}

const PrimaryButton = React.forwardRef<HTMLButtonElement, { disabled?: boolean; loading?: boolean; onClick: () => void; label: string }>(
  function PrimaryButton(props, ref) {
    const enabled = !props.disabled && !props.loading
    return (
      <button ref={ref} onClick={props.onClick} disabled={!enabled}
        style={{
          width: '100%', padding: '16px', borderRadius: 18, border: 'none',
          background: enabled ? T1 : SURF2,
          color:      enabled ? '#000' : T3,
          fontWeight: 900, fontSize: 16, fontFamily: FONT, letterSpacing: -0.2,
          cursor: enabled ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: enabled ? '0 14px 32px rgba(255,255,255,0.12)' : 'none',
          transition: 'background 180ms, color 180ms, box-shadow 180ms',
        }}>
        {props.loading
          ? <><Spinner /> <span>{props.label}</span></>
          : <><span>{props.label}</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
      </button>
    )
  },
)

function Spinner() {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: '50%',
      border: '2.5px solid rgba(0,0,0,0.18)', borderTopColor: '#000',
      animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

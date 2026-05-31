'use client'
import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ArrowLeft, Home, Briefcase, Check, Sparkles } from 'lucide-react'
import { sendPhoneCode, confirmPhoneCode } from '@/lib/firebase-phone-auth'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.30)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

const BUSINESS_TYPES = [
  { label: 'Restaurant',       emoji: '🍽️' },
  { label: 'Retail Store',     emoji: '🏪' },
  { label: 'Warehouse',        emoji: '🏭' },
  { label: 'Hotel',            emoji: '🏨' },
  { label: 'Security Agency',  emoji: '🔒' },
  { label: 'Delivery Hub',     emoji: '🚴' },
  { label: 'Office/Corporate', emoji: '💼' },
  { label: 'Construction',     emoji: '🏗️' },
  { label: 'Healthcare',       emoji: '🏥' },
  { label: 'Other',            emoji: '📋' },
]

function RegisterInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [step,    setStep]    = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  // Step 1
  const [phone,        setPhone]        = useState(searchParams.get('phone') || '')
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '')
  const [showRef,      setShowRef]      = useState(false)
  const [otpSent,      setOtpSent]      = useState(false)
  const [otp,          setOtp]          = useState('')
  const [preVerifiedToken, setPreVerifiedToken] = useState<string | null>(null)

  // Step 2
  const [ownerName, setOwnerName] = useState('')

  // Step 3
  const [bizType, setBizType] = useState('')

  const verifyBtnRef = useRef<HTMLButtonElement>(null)

  // Gate: only reachable via /employer/login (leaves a fresh Firebase token
  // in sessionStorage). If token is missing or stale, bounce back so the
  // user enters their OTP only once.
  useEffect(() => {
    try {
      const raw   = sessionStorage.getItem('emp_signup_token')
      const saved = raw ? JSON.parse(raw) as { phone?: string; idToken?: string; ts?: number } : null
      const fresh = !!(saved?.ts && (Date.now() - saved.ts) < 50 * 60 * 1000 && saved.idToken)
      if (fresh) {
        setPreVerifiedToken(saved!.idToken!)
        if (saved!.phone && !phone) setPhone(saved!.phone!)
      } else {
        try { sessionStorage.removeItem('emp_signup_token') } catch {}
        const p = searchParams.get('phone') || ''
        router.replace(p ? `/employer/login?phone=${p}` : '/employer/login')
      }
    } catch {
      router.replace('/employer/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const phoneOk = /^\d{10}$/.test(phone)
  const otpOk   = /^\d{6}$/.test(otp)

  async function createAccountWithToken(idToken: string) {
    const res = await fetch('/api/auth/firebase-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken, role: 'EMPLOYER',
        name:         ownerName.trim(),
        companyName:  ownerName.trim(),
        ownerName:    ownerName.trim(),
        referralCode: referralCode.trim() || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Registration failed')
  }

  async function handleSendOtp() {
    if (!phoneOk || loading) return
    setLoading(true); setError('')
    try {
      if (!preVerifiedToken) {
        router.replace(`/employer/login?phone=${phone}`)
        return
      }
      await createAccountWithToken(preVerifiedToken)
      try { sessionStorage.removeItem('emp_signup_token') } catch {}
      setStep(2)
    } catch (e: any) {
      setError(`${e.message || 'Verification expired'} — please log in again.`)
      try { sessionStorage.removeItem('emp_signup_token') } catch {}
      setTimeout(() => router.replace(`/employer/login?phone=${phone}`), 1500)
    } finally { setLoading(false) }
  }

  async function handleVerify() {
    if (!otpOk || loading) return
    setLoading(true); setError('')
    try {
      const { idToken } = await confirmPhoneCode(otp)
      await createAccountWithToken(idToken)
      try {
        const r = await fetch('/api/employer/profile', { credentials: 'include' })
        if (r.ok) {
          const d  = await r.json().catch(() => ({}))
          const ep = d?.profile || d?.user?.employerProfile
          const userName = d?.user?.name || ''
          if (ep?.businessType && userName && userName !== `User ${phone.slice(-4)}`) {
            window.location.replace('/employer')
            return
          }
          if (userName && userName !== `User ${phone.slice(-4)}`) setOwnerName(userName)
        }
      } catch {}
      setStep(2)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function handleOtpChange(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    setOtp(clean); setError('')
    if (clean.length === 6) setTimeout(() => verifyBtnRef.current?.click(), 80)
  }

  async function handleComplete() {
    if (!bizType) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/employer/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:         ownerName.trim(),
          ownerName:    ownerName.trim(),
          companyName:  ownerName.trim(),
          businessType: bizType,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Failed to save profile (HTTP ${res.status})`)
        return
      }
      window.location.replace('/employer')
    } catch {
      setError('Network error — try again')
    } finally { setLoading(false) }
  }

  function goBack() {
    if (otpSent && step === 1) { setOtpSent(false); setOtp(''); setError(''); return }
    if (step > 1) { setStep(s => (s - 1) as 1 | 2 | 3); setError(''); return }
    router.push('/employer/login')
  }

  return (
    <div style={{
      minHeight: '100dvh' as any,
      background: BG, fontFamily: FONT, color: T1,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(14px + env(safe-area-inset-top)) 14px 8px' }}>
        <button onClick={goBack} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>
        <div style={{ flex: 1, fontSize: 11, color: T2, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>Step {step} of 3</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: n === step ? 24 : 14, height: 4, borderRadius: 2,
              background: n <= step ? T1 : 'rgba(255,255,255,0.10)',
              transition: 'all 200ms',
            }} />
          ))}
        </div>
      </header>

      <div style={{ flex: 1, padding: '18px 18px 32px', display: 'flex', flexDirection: 'column' }}>
        {/* STEP 1 */}
        {step === 1 && !otpSent && (
          <>
            <Title>Let's verify your number</Title>
            <Subtitle>We'll text a one-time code. Same number every login — that's how we keep your account secure.</Subtitle>

            <FieldLabel>Mobile number</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 16, border: `1.5px solid ${phoneOk ? T1 : BD}`, overflow: 'hidden', background: SURF, marginBottom: 16, minWidth: 0 }}>
              <div style={{ padding: '14px 14px', borderRight: `1px solid ${BD}`, background: SURF2, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontWeight: 800, fontSize: 15, color: T1 }}>
                🇮🇳 +91
              </div>
              <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number"
                value={phone}
                readOnly={!!preVerifiedToken}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                style={{ flex: 1, minWidth: 0, background: 'transparent', outline: 'none', border: 'none', padding: '14px 14px', fontSize: 17, fontWeight: 700, color: T1, fontFamily: FONT, letterSpacing: 1 }} />
            </div>

            <button type="button" onClick={() => setShowRef(s => !s)}
              style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: T2, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkles style={{ width: 13, height: 13, color: T2 }} />
              Have a referral code? {showRef ? 'Hide' : 'Add'}
            </button>
            {showRef && (
              <input type="text" value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="e.g. SW4X7RKM"
                style={inputStyle(referralCode.length > 0, 16)} />
            )}

            <ErrorBox msg={error} />

            <div style={{ flex: 1 }} />

            <PrimaryButton disabled={!phoneOk || loading} loading={loading} onClick={handleSendOtp} label="Continue" />
            <LegalNote />
          </>
        )}

        {/* STEP 1 — OTP re-collect (only if token expired) */}
        {step === 1 && otpSent && (
          <>
            <Title>Enter the OTP</Title>
            <Subtitle>Sent to +91 {phone} via SMS.</Subtitle>

            <FieldLabel>6-digit code</FieldLabel>
            <input type="tel" inputMode="numeric" maxLength={6} placeholder="_ _ _ _ _ _" autoFocus
              value={otp}
              onChange={e => handleOtpChange(e.target.value)}
              style={{ width: '100%', background: SURF, border: `1.5px solid ${otpOk ? T1 : BD}`, borderRadius: 16, padding: '18px 20px', fontSize: 28, fontWeight: 800, color: T1, letterSpacing: 12, outline: 'none', fontFamily: FONT, boxSizing: 'border-box' as const, marginBottom: 16, textAlign: 'center' as const }} />

            <ErrorBox msg={error} />

            <PrimaryButton ref={verifyBtnRef} disabled={!otpOk || loading} loading={loading} onClick={handleVerify} label={loading ? 'Verifying…' : 'Verify & continue'} />

            <button onClick={() => { if (countdown > 0) return; setOtpSent(false); setOtp(''); setError('') }} disabled={countdown > 0}
              style={{ width: '100%', marginTop: 14, background: 'transparent', border: 'none', color: countdown > 0 ? T3 : T2, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: countdown > 0 ? 'default' : 'pointer' }}>
              {countdown > 0 ? `Resend OTP in ${countdown}s` : '← Change number / Resend OTP'}
            </button>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <Title>What's your name?</Title>
            <Subtitle>We'll show this to workers when you hire them.</Subtitle>

            <FieldLabel>Full name</FieldLabel>
            <input type="text" value={ownerName} autoFocus
              onChange={e => { setOwnerName(e.target.value); setError('') }}
              placeholder="e.g. Rajesh Sharma"
              style={inputStyle(ownerName.trim().length > 0, 16)} />

            <ErrorBox msg={error} />

            <div style={{ flex: 1 }} />

            <PrimaryButton
              disabled={ownerName.trim().length === 0 || loading}
              loading={loading}
              onClick={() => ownerName.trim().length > 0 && setStep(3)}
              label="Continue"
            />
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <Title>Who are you hiring for?</Title>
            <Subtitle>Pick the one that fits — you can change this later in Profile.</Subtitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <UseCaseCard
                title="Switch for Home"
                blurb="Hire a cook, cleaner, caretaker or driver for your home"
                Icon={Home}
                selected={bizType === 'Personal / Individual'}
                onClick={() => setBizType('Personal / Individual')}
              />
              <UseCaseCard
                title="Switch for Business"
                blurb="Staff your restaurant, store, warehouse, hotel or event"
                Icon={Briefcase}
                selected={bizType !== '' && bizType !== 'Personal / Individual'}
                onClick={() => setBizType('Business')}
              />
            </div>

            {bizType && bizType !== 'Personal / Individual' && (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>What kind of business? <span style={{ color: T3 }}>(optional)</span></FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {BUSINESS_TYPES.map(({ label, emoji }) => {
                    const sel = bizType === label
                    return (
                      <button key={label} onClick={() => setBizType(label)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 12,
                          background: sel ? 'rgba(255,255,255,0.06)' : SURF,
                          border: `1.5px solid ${sel ? T1 : BD}`,
                          cursor: 'pointer', fontFamily: FONT, textAlign: 'left' as const, color: T1, minWidth: 0 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: sel ? T1 : T2, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <ErrorBox msg={error} />

            <div style={{ flex: 1 }} />

            <PrimaryButton disabled={!bizType || loading} loading={loading} onClick={handleComplete} label={loading ? 'Finishing…' : 'Finish setup'} />
          </>
        )}
      </div>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 30, fontWeight: 900, color: T1, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 10 }}>{children}</div>
}
function Subtitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, color: T2, lineHeight: 1.5, marginBottom: 26 }}>{children}</div>
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: T2, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>{children}</div>
}

function inputStyle(filled: boolean, marginBottom: number): React.CSSProperties {
  return {
    width: '100%',
    background: SURF,
    border: `1.5px solid ${filled ? T1 : BD}`,
    borderRadius: 16,
    padding: '14px 16px',
    color: T1, fontSize: 16, fontWeight: 600,
    outline: 'none', fontFamily: FONT,
    boxSizing: 'border-box' as const,
    marginBottom,
  }
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#FCA5A5' }}>
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
          width: '100%', padding: '16px', borderRadius: 16, border: 'none',
          background: enabled ? T1 : SURF2,
          color:      enabled ? '#000' : T3,
          fontWeight: 900, fontSize: 16, fontFamily: FONT, letterSpacing: -0.2,
          cursor: enabled ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: enabled ? '0 12px 28px rgba(255,255,255,0.10)' : 'none',
        }}>
        {props.loading
          ? <><Spinner /> <span>{props.label}</span></>
          : <><span>{props.label}</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
      </button>
    )
  },
)

function UseCaseCard({ title, blurb, Icon, selected, onClick }: { title: string; blurb: string; Icon: any; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: 18, borderRadius: 18,
        background: selected ? 'rgba(255,255,255,0.06)' : SURF,
        border: `1.5px solid ${selected ? T1 : BD}`,
        cursor: 'pointer', fontFamily: FONT, textAlign: 'left' as const, color: T1,
      }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: selected ? T1 : SURF2,
        border: `1px solid ${selected ? T1 : BD}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon style={{ width: 24, height: 24, color: selected ? '#000' : T1 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: T1, marginBottom: 3, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: T2, lineHeight: 1.45 }}>{blurb}</div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: 11,
        border: `2px solid ${selected ? T1 : BD}`,
        background: selected ? T1 : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {selected && <Check style={{ width: 12, height: 12, color: '#000', strokeWidth: 3.5 }} />}
      </div>
    </button>
  )
}

function Spinner() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,0.18)', borderTopColor: '#000', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
  )
}

function LegalNote() {
  return (
    <div style={{ textAlign: 'center' as const, marginTop: 16, fontSize: 12, color: T3, lineHeight: 1.5 }}>
      By continuing, you agree to Switch's{' '}
      <a href="/legal" style={{ color: T2, textDecoration: 'underline' }}>Terms</a> and{' '}
      <a href="/legal" style={{ color: T2, textDecoration: 'underline' }}>Privacy Policy</a>.
    </div>
  )
}

export default function EmployerRegisterPage() {
  return <Suspense><RegisterInner /></Suspense>
}

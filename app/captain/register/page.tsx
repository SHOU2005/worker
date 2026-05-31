'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle, Camera, User } from 'lucide-react'
import { useLanguage } from '../LanguageContext'
import { sendPhoneCode, confirmPhoneCode } from '@/lib/firebase-phone-auth'
import { compressImage } from '@/lib/compress-image'

const FONT = '"DM Sans", system-ui, sans-serif'

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { t }  = useLanguage()

  const [step,      setStep]      = useState(1) // 1=info+OTP, 2=profile photo
  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState(params.get('phone') || '')
  const [city,      setCity]      = useState('')
  const [otp,       setOtp]       = useState('')
  const [otpSent,   setOtpSent]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [countdown, setCountdown] = useState(0)
  const [photo,     setPhoto]     = useState('')
  const [photoLoading, setPhotoLoading] = useState(false)
  const [preVerifiedToken, setPreVerifiedToken] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  // /captain/register is reachable only via /captain/login (which leaves
  // a fresh Firebase token in sessionStorage). If that token is missing
  // or stale, bounce to /captain/login so the user only enters their
  // OTP once.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('cap_signup_token')
      const saved = raw ? JSON.parse(raw) as { phone?: string; idToken?: string; ts?: number } : null
      const fresh = !!(saved?.ts && (Date.now() - saved.ts) < 50 * 60 * 1000 && saved.idToken)
      if (fresh) {
        setPreVerifiedToken(saved!.idToken!)
        if (saved!.phone && !phone) setPhone(saved!.phone!)
      } else {
        try { sessionStorage.removeItem('cap_signup_token') } catch {}
        const p = params.get('phone') || ''
        router.replace(p ? `/captain/login?phone=${p}` : '/captain/login')
      }
    } catch {
      router.replace('/captain/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const phoneOk = /^\d{10}$/.test(phone)
  const otpOk   = /^\d{6}$/.test(otp)
  const formOk  = name.trim().length > 1 && phoneOk && city.trim().length > 0

  async function createAccountWithToken(idToken: string) {
    const res = await fetch('/api/auth/firebase-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, role: 'CAPTAIN', name: name.trim(), territory: city.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('registerFailed'))
  }

  async function handleSendOtp() {
    if (!formOk || loading) return
    setLoading(true); setError('')
    try {
      // Token from /captain/login is the only auth path. If absent, send
      // them back to /captain/login — never ask for a second OTP here.
      if (!preVerifiedToken) {
        router.replace(`/captain/login?phone=${phone}`)
        return
      }
      await createAccountWithToken(preVerifiedToken)
      try { sessionStorage.removeItem('cap_signup_token') } catch {}
      setStep(2)
    } catch (e: any) {
      setError(`${e.message || 'Verification expired'} — please log in again.`)
      try { sessionStorage.removeItem('cap_signup_token') } catch {}
      setTimeout(() => router.replace(`/captain/login?phone=${phone}`), 1500)
    }
    finally { setLoading(false) }
  }

  async function handleVerify() {
    if (!otpOk || loading) return
    setLoading(true); setError('')
    try {
      const { idToken } = await confirmPhoneCode(otp)
      await createAccountWithToken(idToken)
      setStep(2) // go to photo step
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true); setError('')
    try {
      const compressed = await compressImage(file, 200, 600)
      setPhoto(compressed)
    } catch (ex: any) { setError(ex?.message || 'Failed to process photo') }
    setPhotoLoading(false)
  }

  async function handleComplete() {
    if (!photo) { setError('Profile photo is required'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/captain/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: photo }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Failed to save photo (HTTP ${res.status})`)
        return
      }
      router.replace('/captain')
    } catch { setError('Failed to save photo') }
    finally { setLoading(false) }
  }

  function handleOtpChange(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    setOtp(clean); setError('')
    if (clean.length === 6) setTimeout(() => document.getElementById('capreg-verify-btn')?.click(), 80)
  }

  // ── Step 2: Profile Photo ──────────────────────────────────
  if (step === 2) return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#111111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#111111' }}>S</span>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', margin: '0 0 8px' }}>Add Your Photo</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Your photo helps employers and workers recognise you</p>
        </div>

        {/* Photo picker */}
        <button onClick={() => photoRef.current?.click()}
          style={{ width: '100%', height: 200, borderRadius: 24, background: photo ? 'transparent' : 'rgba(255,255,255,0.06)', border: `2px dashed ${photo ? '#22C55E' : 'rgba(255,255,255,0.2)'}`, cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24, position: 'relative' }}>
          {photoLoading ? (
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
          ) : photo ? (
            <img src={photo} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.4)' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Tap to take or upload photo</p>
            </>
          )}
          {photo && (
            <div style={{ position: 'absolute', bottom: 12, right: 12, background: '#22C55E', borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle style={{ width: 14, height: 14, color: '#FFFFFF' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>Photo added</span>
            </div>
          )}
        </button>
        <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" style={{ display: 'none' }} onChange={handlePhotoChange} />

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#FCA5A5', margin: 0 }}>{error}</p>
          </div>
        )}

        <button onClick={handleComplete} disabled={!photo || loading}
          style={{ width: '100%', height: 56, borderRadius: 16, border: 'none', background: photo ? '#FFFFFF' : 'rgba(255,255,255,0.15)', color: photo ? '#111111' : 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: 800, cursor: photo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          {loading ? <Spinner white={false} /> : <><span>Continue to Dashboard</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.25)', margin: 0 }}>Photo is required to activate your captain account</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Step 1: Info + OTP ────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F8F8F8', display: 'flex', flexDirection: 'column' }}>

      <div style={{ background: '#111111', padding: '40px 24px 28px', paddingTop: 'calc(40px + env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#111111', lineHeight: 1, letterSpacing: -1 }}>S</span>
          </div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>{t('joinAsCaptain')}</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{t('joinTagline')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[t('onboardWorkers'), t('buildTerritory'), t('dailyCommissions')].map(txt => (
            <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <CheckCircle style={{ width: 11, height: 11, color: '#22C55E' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{txt}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '24px 24px 0 0', marginTop: -16, padding: '28px 24px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>

        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111111', margin: '0 0 6px' }}>{t('createYourAccount')}</h2>
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', margin: '0 0 24px' }}>{t('fillDetails')}</p>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>{t('fullName')}</label>
          <input type="text" placeholder={t('namePlaceholder')} value={name} disabled={otpSent}
            onChange={e => { setName(e.target.value); setError('') }}
            style={{ width: '100%', height: 54, borderRadius: 14, border: `1.5px solid ${name.trim().length > 1 ? '#111111' : 'rgba(0,0,0,0.12)'}`, background: '#FAFAFA', outline: 'none', padding: '0 14px', fontSize: 16, fontWeight: 600, color: '#111111', boxSizing: 'border-box' as const, opacity: otpSent ? 0.6 : 1 }} />
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>{t('mobileNumber')}</label>
          <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${phoneOk ? '#111111' : 'rgba(0,0,0,0.12)'}`, borderRadius: 14, background: '#FAFAFA', overflow: 'hidden', opacity: otpSent ? 0.6 : 1, minWidth: 0 }}>
            <div style={{ padding: '0 12px', borderRight: '1px solid rgba(0,0,0,0.08)', height: 54, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>🇮🇳</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111111' }}>+91</span>
            </div>
            {/* Phone is auto-filled from the verified token and locked —
                changing it would invalidate the OTP issued for the original. */}
            <input type="tel" inputMode="numeric" maxLength={10} placeholder={t('phonePlaceholder')} disabled={otpSent || !!preVerifiedToken} readOnly={!!preVerifiedToken}
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
              style={{ flex: 1, minWidth: 0, width: '100%', background: 'transparent', border: 'none', outline: 'none',
                padding: '0 12px', fontSize: 17, fontWeight: 700, color: '#111111', letterSpacing: 1, height: 54,
                boxSizing: 'border-box' as const }} />
          </div>
        </div>

        {/* City */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>{t('cityTerritoryLabel')} *</label>
          <input type="text" placeholder={t('cityPlaceholder')} value={city} disabled={otpSent}
            onChange={e => setCity(e.target.value)}
            style={{ width: '100%', height: 54, borderRadius: 14, border: `1.5px solid ${city ? '#111111' : 'rgba(0,0,0,0.12)'}`, background: '#FAFAFA', outline: 'none', padding: '0 14px', fontSize: 16, fontWeight: 600, color: '#111111', boxSizing: 'border-box' as const, opacity: otpSent ? 0.6 : 1 }} />
        </div>

        {/* OTP */}
        {otpSent && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#111111', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>OTP sent to +91 {phone}</label>
            <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>Check your SMS inbox</p>
            <div style={{ border: `1.5px solid ${otpOk ? '#111111' : 'rgba(0,0,0,0.12)'}`, borderRadius: 14, background: '#FAFAFA', overflow: 'hidden' }}>
              <input type="tel" inputMode="numeric" maxLength={6} placeholder="_ _ _ _ _ _" autoFocus value={otp}
                onChange={e => handleOtpChange(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: '0 20px', fontSize: 32, fontWeight: 800, color: '#111111', letterSpacing: 12, height: 68, boxSizing: 'border-box' as const }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {!otpSent ? (
          <>
            {/* No "already verified" banner — only path here is via
                /captain/login, which means the phone IS verified. */}
            <button onClick={handleSendOtp} disabled={!formOk || loading}
              style={{ width: '100%', height: 56, borderRadius: 16, border: 'none', background: formOk ? '#111111' : '#E5E5E5', color: formOk ? '#FFFFFF' : 'rgba(0,0,0,0.25)', fontSize: 16, fontWeight: 800, cursor: formOk ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', marginBottom: 20, boxShadow: formOk ? '0 8px 24px rgba(0,0,0,0.18)' : 'none' }}>
              {loading
                ? <Spinner />
                : <><span>Continue</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
            </button>
          </>
        ) : (
          <>
            <button id="capreg-verify-btn" onClick={handleVerify} disabled={!otpOk || loading}
              style={{ width: '100%', height: 56, borderRadius: 16, border: 'none', background: otpOk ? '#111111' : '#E5E5E5', color: otpOk ? '#FFFFFF' : 'rgba(0,0,0,0.25)', fontSize: 16, fontWeight: 800, cursor: otpOk ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', marginBottom: 12, boxShadow: otpOk ? '0 8px 24px rgba(0,0,0,0.18)' : 'none' }}>
              {loading ? <Spinner /> : <><span>Verify & Continue</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
            </button>
            <button onClick={() => { if (countdown > 0) return; setOtpSent(false); setOtp(''); setError('') }} disabled={countdown > 0}
              style={{ width: '100%', height: 44, background: 'none', border: 'none', cursor: countdown > 0 ? 'default' : 'pointer', color: countdown > 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)', fontSize: 14, fontWeight: 600 }}>
              {countdown > 0 ? `Resend OTP in ${countdown}s` : '← Change number / Resend OTP'}
            </button>
          </>
        )}

        {/* Once OTP is sent, the user has committed to signup — sending them
            back to /captain/login would erase their info. */}
        {!otpSent && (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(0,0,0,0.45)', margin: '8px 0 0' }}>
            {t('alreadyRegistered')}{' '}
            <a href="/captain/login" style={{ color: '#111111', fontWeight: 800, textDecoration: 'none' }}>{t('signIn')} →</a>
          </p>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Spinner({ white = true }: { white?: boolean }) {
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${white ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)'}`, borderTopColor: white ? '#fff' : '#111', animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function CaptainRegisterPage() {
  return <Suspense><RegisterForm /></Suspense>
}

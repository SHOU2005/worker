'use client'
import { useRef, useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Check, ChevronLeft, Upload, Camera } from 'lucide-react'
import { sendPhoneCode, confirmPhoneCode } from '@/lib/firebase-phone-auth'
import { compressImage } from '@/lib/compress-image'
import { track } from '@/lib/posthog'
import { AADHAAR_CONSENT_TEXT_BY_VERSION } from '@/lib/legal'

const JOB_TYPES = [
  { id: 'shop',         emoji: '🏪', label: 'Shop Helper'     },
  { id: 'delivery',     emoji: '🚴', label: 'Delivery Rider'  },
  { id: 'security',     emoji: '🔒', label: 'Security Guard'  },
  { id: 'kitchen',      emoji: '🍳', label: 'Kitchen Helper'  },
  { id: 'warehouse',    emoji: '🏭', label: 'Warehouse Staff' },
  { id: 'cleaning',     emoji: '🧹', label: 'Cleaning Staff'  },
  { id: 'driver',       emoji: '🚗', label: 'Driver'          },
  { id: 'construction', emoji: '🏗️', label: 'Construction'   },
  { id: 'packing',      emoji: '📦', label: 'Packing Staff'   },
  { id: 'cashier',      emoji: '🛒', label: 'Cashier'         },
  { id: 'waiter',       emoji: '🍽️', label: 'Waiter'         },
  { id: 'bartender',    emoji: '🍹', label: 'Bartender'       },
  { id: 'bouncer',      emoji: '💪', label: 'Bouncer'         },
]

// Captures via the native Capacitor camera plugin when running inside the
// Android app — that forces the OS camera UI to open (no gallery, no file
// browser) so we always get a live worker photo. Returns a Blob ready for
// compressImage. Returns null when not on a native platform OR the user
// cancelled — callers should fall back to the HTML file input in that case.
async function captureWithNativeCamera(selfie: boolean): Promise<Blob | null> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return null
    const { Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      resultType:    CameraResultType.DataUrl,
      source:        CameraSource.Camera,
      quality:       80,
      width:         800,
      direction:     selfie ? CameraDirection.Front : CameraDirection.Rear,
      saveToGallery: false,
      allowEditing:  false,
      promptLabelHeader: selfie ? 'Take your selfie' : 'Take a photo',
    })
    if (!photo?.dataUrl) return null
    const res = await fetch(photo.dataUrl)
    return await res.blob()
  } catch (err) {
    // User-cancelled is a normal exit — don't surface it. Other errors
    // (permission denied, no camera) fall through to the file-input
    // fallback so the user is never stuck.
    return null
  }
}

function PhotoPicker({ label, value, onChange, selfie = false, required = false }: { label: string; value: string; onChange: (v: string) => void; selfie?: boolean; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handlePick() {
    if (loading) return
    setErr('')
    // Try the native camera first inside the Android app so the worker
    // can't bypass the live-photo requirement by uploading from gallery.
    setLoading(true)
    try {
      const native = await captureWithNativeCamera(selfie)
      if (native) {
        onChange(await compressImage(native, 200, 600))
        return
      }
    } catch (ex: any) {
      setErr(ex?.message || 'Could not process image')
      return
    } finally {
      setLoading(false)
    }
    // Web / PWA fallback — the HTML file input still honours `capture` on
    // mobile browsers so most users land in the camera anyway.
    ref.current?.click()
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </p>
      <button onClick={handlePick}
        style={{ width: '100%', height: value ? 'auto' : 100, borderRadius: 16,
          border: `2px dashed ${value ? '#22C55E' : required ? 'rgba(220,38,38,0.3)' : 'rgba(0,0,0,0.15)'}`,
          background: value ? 'rgba(34,197,94,0.04)' : required ? 'rgba(220,38,38,0.02)' : '#F9F9F9',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, cursor: 'pointer', overflow: 'hidden', padding: 0, transition: 'all 0.15s' }}>
        {loading
          ? <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,0.1)', borderTopColor: '#111', animation: 'spin 0.7s linear infinite' }} />
          : value
            ? <img src={value} alt={label} style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
            : <>
                <Camera style={{ width: 26, height: 26, color: required ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.3)' }} />
                <span style={{ fontSize: 13, color: required ? 'rgba(220,38,38,0.6)' : 'rgba(0,0,0,0.4)', fontWeight: 600 }}>Tap to open camera</span>
              </>
        }
      </button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" capture={selfie ? 'user' : 'environment'} style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          setLoading(true); setErr('')
          try { onChange(await compressImage(f, 200, 600)) }
          catch (ex: any) { setErr(ex?.message || 'Could not process image') }
          setLoading(false)
        }} />
      {err && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>{err}</p>}
    </div>
  )
}

function RegisterForm() {
  const router  = useRouter()
  const params  = useSearchParams()

  const [step,      setStep]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState(params?.get('phone') ?? '')
  const [city,     setCity]     = useState('')
  const [referral, setReferral] = useState(params?.get('ref') ?? '')
  const [otpSent,  setOtpSent]  = useState(false)
  const [otp,      setOtp]      = useState('')

  // Pre-verified Firebase token forwarded from /login when the user verified
  // their phone there but had no account yet. Skip the second OTP if it's
  // still fresh (≤50 min), otherwise fall back to the normal OTP flow.
  const [preVerifiedToken, setPreVerifiedToken] = useState<string | null>(null)

  const [jobs,         setJobs]         = useState<Set<string>>(new Set())
  const [profilePhoto, setProfilePhoto] = useState('')
  const [aadhaarFront, setAadhaarFront] = useState('')
  const [aadhaarBack,  setAadhaarBack]  = useState('')
  const [aadhaarNumber,setAadhaarNumber]= useState('')
  const [aadhaarConsent, setAadhaarConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'reading' | 'detected' | 'failed'>('idle')
  // Capture GPS once during the photo step so the dashboard doesn't ask again
  const [latlng, setLatlng] = useState<{ lat: number; lng: number } | null>(null)

  const phoneOk = /^\d{10}$/.test(phone)
  const otpOk   = /^\d{6}$/.test(otp)
  const step1Ok = name.trim().length >= 2 && phoneOk && city.trim().length > 0
  const step2Ok = jobs.size >= 1
  const aadhaarOk = /^\d{12}$/.test(aadhaarNumber)

  const TOTAL_STEPS = 4
  const stepLabel = ['Your Info', 'Work Types', 'Your Photo & Aadhaar', 'Aadhaar Back & Done']

  // Read the verified-token handoff once on mount. /register is the
  // "complete your profile" page — it must only be reachable from /login
  // (which leaves the verified Firebase ID token in sessionStorage). If
  // the token is missing or stale, bounce back to /login so the user only
  // ever enters their OTP ONCE.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('worker_signup_token')
      const saved = raw ? JSON.parse(raw) as { phone?: string; idToken?: string; ts?: number } : null
      const fresh = !!(saved?.ts && (Date.now() - saved.ts) < 50 * 60 * 1000 && saved.idToken)
      if (fresh) {
        setPreVerifiedToken(saved!.idToken!)
        if (saved!.phone && !phone) setPhone(saved!.phone!)
      } else {
        try { sessionStorage.removeItem('worker_signup_token') } catch {}
        const p = params?.get('phone') || ''
        router.replace(p ? `/login?phone=${p}` : '/login')
      }
    } catch {
      router.replace('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createAccountWithToken(idToken: string) {
    const res = await fetch('/api/auth/firebase-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, role: 'WORKER', name: name.trim(), city: city.trim(), referralCode: referral || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Registration failed')
  }

  async function handleSendOtp() {
    if (!step1Ok || loading) return
    setLoading(true); setError('')
    try {
      // /register is gated on a freshly verified Firebase token from /login.
      // If we got this far, preVerifiedToken is present (otherwise the mount
      // effect would have bounced to /login). Create the account directly —
      // no second OTP.
      if (!preVerifiedToken) {
        router.replace(`/login?phone=${phone}`)
        return
      }
      await createAccountWithToken(preVerifiedToken)
      try { sessionStorage.removeItem('worker_signup_token') } catch {}
      track('worker_signup_otp_verified', { city: city.trim() })
      setStep(2)
    } catch (e: any) {
      setError(`${e.message || 'Verification expired'} — please log in again.`)
      try { sessionStorage.removeItem('worker_signup_token') } catch {}
      setTimeout(() => router.replace(`/login?phone=${phone}`), 1500)
    }
    finally { setLoading(false) }
  }

  async function handleVerifyAndNext() {
    if (!otpOk || loading) return
    setLoading(true); setError('')
    try {
      const { idToken } = await confirmPhoneCode(otp)
      await createAccountWithToken(idToken)
      track('worker_signup_otp_verified', { city: city.trim() })
      setStep(2)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function handleOtpChange(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    setOtp(clean); setError('')
    if (clean.length === 6) setTimeout(() => document.getElementById('reg-verify-btn')?.click(), 80)
  }

  // Aadhaar is now optional during signup — workers can upload it later
  // from /worker/kyc whenever they're ready. Only the profile photo is
  // required to leave step 3 (so other workers / employers can recognise
  // them on the map / job feed).
  const step3Ok = !!profilePhoto

  async function handleStep3Next() {
    if (!profilePhoto) { setError('Profile photo is required to continue'); return }
    setStep(4); setError('')
  }

  // Auto-capture GPS once we reach step 3 (photo step). If the user denies,
  // we silently skip — the dashboard's CompleteProfileGate will pick it up later.
  useEffect(() => {
    if (step !== 3 || latlng || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      p => setLatlng({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [step, latlng])

  // Try OCR auto-extract once Aadhaar back is uploaded.
  // Always sets a terminal status so the user knows whether to type the
  // number themselves or trust the auto-fill — silent failures are confusing.
  // Hard-cap the request at 8s so a slow / hung backend doesn't leave the UI
  // stuck on "Reading number from your photo…" forever on 3G connections.
  useEffect(() => {
    if (!aadhaarBack || aadhaarNumber) return
    let cancelled = false
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    setOcrStatus('reading')
    ;(async () => {
      try {
        const r = await fetch('/api/worker/extract-aadhaar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: aadhaarBack || aadhaarFront }),
          signal: ctrl.signal,
        })
        const d = await r.json().catch(() => ({}))
        if (cancelled) return
        if (d?.aadhaarNumber && /^\d{12}$/.test(d.aadhaarNumber)) {
          setAadhaarNumber(d.aadhaarNumber)
          setOcrStatus('detected')
        } else {
          setOcrStatus('failed')
        }
      } catch {
        // Aborted timeout, network error, or any failure — fall through to
        // the manual-entry path. The UI prompts the worker to type the
        // 12 digits themselves so they're not blocked.
        if (!cancelled) setOcrStatus('failed')
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { cancelled = true; clearTimeout(timeout); ctrl.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aadhaarBack])

  async function handleComplete() {
    // Aadhaar fields are all optional on signup. If the worker filled
    // any of them, validate the full set + consent so we don't store
    // a half-record. If none are filled, skip them entirely and the
    // worker completes KYC later via /worker/kyc.
    const wantsAadhaar = !!aadhaarFront || !!aadhaarBack || !!aadhaarNumber
    if (wantsAadhaar) {
      if (!aadhaarFront)   { setError('Please upload your Aadhaar front photo (or skip the whole Aadhaar section)'); return }
      if (!aadhaarBack)    { setError('Please upload your Aadhaar back photo (or skip the whole Aadhaar section)'); return }
      if (!aadhaarOk)      { setError('Enter your 12-digit Aadhaar number (or skip the whole Aadhaar section)'); return }
      if (!aadhaarConsent) { setError('Please review and accept the Aadhaar consent'); setShowConsent(true); return }
    }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/worker/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: Array.from(jobs), profilePhoto,
          ...(wantsAadhaar ? { aadhaarFront, aadhaarBack, aadhaarNumber, aadhaarConsent: true } : {}),
          // Pre-fill location so the dashboard gate doesn't pop up after signup
          ...(latlng ? { lat: latlng.lat, lng: latlng.lng } : {}),
          city: city.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        const msg = d.error || `Could not save (HTTP ${res.status}). Please try again.`
        setError(msg)
        if (res.status === 413) setError('Photos are too large. Pick smaller images and try again.')
        console.error('worker profile save failed', res.status, d)
        return
      }
      track('worker_signup_completed', { skills: Array.from(jobs).length })
      router.replace('/worker/dashboard')
    } catch (err) {
      console.error('worker profile save error:', err)
      setError('Network error — try again')
    }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 8px' }}>
        {step > 1 ? (
          <button onClick={() => { setStep(s => s - 1); setError('') }}
            style={{ width: 40, height: 40, borderRadius: '50%', background: '#F0F0F0',
              border: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ChevronLeft style={{ width: 20, height: 20, color: 'rgba(0,0,0,0.6)' }} />
          </button>
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 14, background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>S</span>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
            Step {step} of {TOTAL_STEPS}
          </p>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#111111', marginTop: 1 }}>{stepLabel[step - 1]}</p>
        </div>
        {step === 1 && (
          <button onClick={() => router.push('/login')}
            style={{ fontSize: 15, fontWeight: 700, color: 'rgba(0,0,0,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Login
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '4px 20px 12px' }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 8, background: i < step ? '#111111' : 'rgba(0,0,0,0.1)', transition: 'background 0.3s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px' }}>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#111111', marginBottom: 4 }}>Join Switch</p>
            <p style={{ fontSize: 15, color: 'rgba(0,0,0,0.45)', marginBottom: 24 }}>Find part-time jobs near you</p>

            {[
              { label: 'Full Name *', value: name, onChange: setName, placeholder: 'Your full name', check: name.length >= 2 },
            ].map(({ label, value, onChange, placeholder, check }) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>{label}</p>
                <input value={value} onChange={e => { onChange(e.target.value); setError('') }} placeholder={placeholder}
                  disabled={otpSent}
                  style={{ width: '100%', height: 54, paddingLeft: 16, paddingRight: 16, borderRadius: 14,
                    background: '#F5F5F5', border: `1.5px solid ${check ? '#111111' : 'rgba(0,0,0,0.1)'}`,
                    fontSize: 16, fontWeight: 600, color: '#111111', outline: 'none', boxSizing: 'border-box' as const,
                    opacity: otpSent ? 0.6 : 1 }} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>Mobile Number *</p>
              <div style={{ display: 'flex', height: 54, borderRadius: 14, overflow: 'hidden',
                background: '#F5F5F5', border: `1.5px solid ${phoneOk ? '#111111' : 'rgba(0,0,0,0.1)'}`, opacity: otpSent ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRight: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>🇮🇳</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.5)' }}>+91</span>
                </div>
                {/* Phone is auto-filled from the verified token on mount
                    and locked — the token in sessionStorage was issued
                    for THIS phone, so letting the user change it here
                    would silently invalidate the token. */}
                <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number"
                  value={phone} disabled={otpSent || !!preVerifiedToken} readOnly={!!preVerifiedToken}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', paddingLeft: 14, fontSize: 18, fontWeight: 700, color: '#111111', letterSpacing: 2 }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>City *</p>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Gurgaon, Delhi" disabled={otpSent}
                style={{ width: '100%', height: 54, paddingLeft: 16, paddingRight: 16, borderRadius: 14,
                  background: '#F5F5F5', border: `1.5px solid ${city.trim() ? '#111111' : 'rgba(0,0,0,0.1)'}`,
                  fontSize: 16, fontWeight: 600, color: '#111111', outline: 'none', boxSizing: 'border-box' as const, opacity: otpSent ? 0.6 : 1 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.4)', marginBottom: 8 }}>
                Captain Referral Code <span style={{ fontWeight: 400 }}>(optional)</span>
              </p>
              <input value={referral} disabled={otpSent}
                onChange={e => setReferral(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="e.g. SW4X7RKM"
                style={{ width: '100%', height: 50, padding: '0 16px', borderRadius: 14,
                  background: '#F5F5F5', border: '1.5px solid rgba(0,0,0,0.1)',
                  fontSize: 15, fontWeight: 700, color: '#111111', outline: 'none', letterSpacing: 3, boxSizing: 'border-box' as const, opacity: otpSent ? 0.6 : 1 }} />
            </div>

            {otpSent && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', marginBottom: 4 }}>OTP sent to +91 {phone}</p>
                <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>Check your SMS inbox</p>
                <div style={{ border: `1.5px solid ${otpOk ? '#111111' : 'rgba(0,0,0,0.1)'}`, borderRadius: 14, background: '#F5F5F5', overflow: 'hidden' }}>
                  <input type="tel" inputMode="numeric" maxLength={6} placeholder="_ _ _ _ _ _" autoFocus
                    value={otp}
                    onChange={e => handleOtpChange(e.target.value)}
                    style={{ width: '100%', height: 68, padding: '0 20px', borderRadius: 14,
                      background: 'transparent', border: 'none', fontSize: 32, fontWeight: 800, color: '#111111', letterSpacing: 12, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
              </div>
            )}

            {!otpSent ? (
              <>
                {/* No "already verified" banner — the mount effect already
                    bounces to /login when there's no preVerifiedToken, so
                    if we render here the phone IS verified. Surfacing
                    that as a separate banner just adds noise; the phone
                    field is already filled and disabled. */}
                <button onClick={handleSendOtp} disabled={!step1Ok || loading}
                  style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
                    background: step1Ok ? '#111111' : 'rgba(0,0,0,0.07)', color: step1Ok ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: step1Ok ? 'pointer' : 'default' }}>
                  {loading
                    ? <><SSpinner /><span>Creating account…</span></>
                    : <><span>Continue</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
                </button>
              </>
            ) : (
              <>
                <button id="reg-verify-btn" onClick={handleVerifyAndNext} disabled={!otpOk || loading}
                  style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
                    background: otpOk ? '#111111' : 'rgba(0,0,0,0.07)', color: otpOk ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: otpOk ? 'pointer' : 'default', marginBottom: 10 }}>
                  {loading ? <><SSpinner /><span>Verifying…</span></> : <><span>Verify & Continue</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
                </button>
                <button onClick={() => { if (countdown > 0) return; setOtpSent(false); setOtp(''); setError('') }}
                  disabled={countdown > 0}
                  style={{ width: '100%', height: 44, background: 'none', border: 'none',
                    cursor: countdown > 0 ? 'default' : 'pointer',
                    color: countdown > 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)', fontSize: 14, fontWeight: 600 }}>
                  {countdown > 0 ? `Resend OTP in ${countdown}s` : '← Change number / Resend OTP'}
                </button>
              </>
            )}

            {/* Hide once OTP has been sent — by then the user has committed
                to signup. Showing the Sign-In CTA there is misleading. */}
            {!otpSent && (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(0,0,0,0.45)', marginTop: 16 }}>
                Already registered?{' '}
                <button onClick={() => router.push('/login')}
                  style={{ color: '#111111', fontWeight: 800, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                  Sign In
                </button>
              </p>
            )}
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#111111', marginBottom: 4 }}>What work do you do?</p>
            <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 20 }}>
              Select at least one — these are the jobs you'll be matched with.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
              {JOB_TYPES.map(j => {
                const on = jobs.has(j.id)
                return (
                  <button key={j.id}
                    onClick={() => setJobs(prev => { const n = new Set(prev); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n })}
                    style={{ padding: '14px 8px', borderRadius: 16, cursor: 'pointer',
                      background: on ? 'rgba(17,17,17,0.06)' : '#F5F5F5', border: `2px solid ${on ? '#111111' : 'rgba(0,0,0,0.08)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.15s', position: 'relative' }}>
                    <span style={{ fontSize: 22 }}>{j.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? '#111111' : 'rgba(0,0,0,0.5)', textAlign: 'center', lineHeight: 1.3 }}>{j.label}</span>
                    {on && <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check style={{ width: 11, height: 11, color: '#fff' }} />
                    </div>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => { if (step2Ok) setStep(3) }} disabled={!step2Ok}
              style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
                background: step2Ok ? '#111111' : 'rgba(0,0,0,0.07)', color: step2Ok ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: step2Ok ? 'pointer' : 'default', marginBottom: 10 }}>
              <span>{step2Ok ? 'Continue' : 'Select at least one'}</span><ArrowRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#111111', marginBottom: 4 }}>Your Photos</p>
            <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 24 }}>Both photos are required to complete your profile.</p>
            <PhotoPicker label="Profile Selfie" value={profilePhoto} onChange={setProfilePhoto} selfie required />
            <PhotoPicker label="Aadhaar Card Front (optional)" value={aadhaarFront} onChange={setAadhaarFront} />
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>}
            <button onClick={handleStep3Next} disabled={!step3Ok}
              style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
                background: step3Ok ? '#111111' : 'rgba(0,0,0,0.07)',
                color: step3Ok ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: step3Ok ? 'pointer' : 'not-allowed', marginBottom: 10 }}>
              <span>{step3Ok ? 'Continue' : 'Upload both photos to continue'}</span>
              <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#111111', marginBottom: 4 }}>Aadhaar Back</p>
            <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 24 }}>
              Upload the back side. Your Aadhaar number will be auto-detected — confirm or enter it manually.
            </p>
            <PhotoPicker label="Aadhaar Card Back (optional)" value={aadhaarBack} onChange={setAadhaarBack} />

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>
                Aadhaar Number <span style={{ fontWeight: 600, color: 'rgba(0,0,0,0.4)' }}>(optional)</span>
              </p>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={12}
                value={aadhaarNumber}
                onChange={e => { setAadhaarNumber(e.target.value.replace(/\D/g, '').slice(0, 12)); setError('') }}
                placeholder="12-digit Aadhaar number"
                style={{
                  width: '100%', height: 56, padding: '0 16px', borderRadius: 14,
                  background: '#F5F5F5', border: `1.5px solid ${aadhaarOk ? '#22C55E' : 'rgba(0,0,0,0.1)'}`,
                  fontSize: 18, fontWeight: 700, color: '#111111', outline: 'none', letterSpacing: 4,
                  boxSizing: 'border-box' as const,
                }} />
              {!aadhaarOk && aadhaarNumber.length > 0 && (
                <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Must be exactly 12 digits</p>
              )}
              {ocrStatus === 'reading'  && <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 6 }}>Reading number from your photo…</p>}
              {ocrStatus === 'detected' && <p style={{ fontSize: 12, color: '#22C55E', marginTop: 6, fontWeight: 600 }}>✓ Auto-detected — verify the number above</p>}
              {ocrStatus === 'failed'   && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Couldn&apos;t auto-read — please type the 12 digits above</p>}
            </div>

            {/* Aadhaar consent */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
              background: aadhaarConsent ? 'rgba(34,197,94,0.05)' : '#F5F5F5',
              border: `1.5px solid ${aadhaarConsent ? '#22C55E' : 'rgba(0,0,0,0.1)'}`,
              borderRadius: 14, marginBottom: 14, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={aadhaarConsent}
                onChange={e => setAadhaarConsent(e.target.checked)}
                style={{ marginTop: 3, width: 18, height: 18, accentColor: '#111111', flexShrink: 0 }}
              />
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', lineHeight: 1.45 }}>
                I consent to Switch storing my Aadhaar securely for KYC and verification, as
                described in the{' '}
                <button type="button" onClick={e => { e.preventDefault(); setShowConsent(true) }}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#111', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>
                  full consent statement
                </button>
                {' '}and the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#111', fontWeight: 700, textDecoration: 'underline' }}>
                  Privacy Policy
                </a>.
                <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>
              </div>
            </label>

            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>}

            {/* Button is always enabled (modulo loading) — Aadhaar fields
                are optional. handleComplete enforces "all-or-none": if
                the worker started any Aadhaar field, the full set is
                required; if all three are blank, signup completes with
                just selfie + skills + city. */}
            <button onClick={handleComplete} disabled={loading}
              style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
                background: loading ? 'rgba(0,0,0,0.07)' : '#111111',
                color:      loading ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: loading ? 'default' : 'pointer' }}>
              {loading ? <><SSpinner light /><span>Completing…</span></> : <><span>Complete Registration</span><ArrowRight style={{ width: 18, height: 18 }} /></>}
            </button>
          </div>
        )}
      </div>

      {showConsent && <ConsentSheet onAccept={() => { setAadhaarConsent(true); setShowConsent(false) }} onClose={() => setShowConsent(false)} />}
    </div>
  )
}

function ConsentSheet({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 520, background: '#FFFFFF', borderRadius: '24px 24px 0 0',
        padding: '20px 22px calc(20px + env(safe-area-inset-bottom))',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 6px' }}>Aadhaar consent</p>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.4)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Version: v1-2026-05-07
        </p>
        <div style={{ overflowY: 'auto', flex: 1, fontSize: 14, color: 'rgba(0,0,0,0.78)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
          {AADHAAR_CONSENT_TEXT_BY_VERSION['v1-2026-05-07']}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose}
            style={{ flex: 1, height: 50, borderRadius: 14, background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.1)', fontSize: 14, fontWeight: 700, color: '#111', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onAccept}
            style={{ flex: 1, height: 50, borderRadius: 14, background: '#111111', color: '#FFFFFF', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            I agree
          </button>
        </div>
      </div>
    </div>
  )
}

function SSpinner({ light }: { light?: boolean }) {
  const c = light ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'
  const tc = light ? '#fff' : '#111'
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2.5px solid ${c}`, borderTopColor: tc, animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function WorkerRegisterPage() {
  return <Suspense><RegisterForm /></Suspense>
}

'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, ShieldCheck, X, MapPin, CheckCircle } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { AADHAAR_CONSENT_TEXT_BY_VERSION } from '@/lib/legal'
import { toastError, toastSuccess } from '@/lib/toast'

const CONSENT_VERSION = 'v1-2026-05-07'

/**
 * Dedicated KYC page — first stop for any worker whose Aadhaar isn't yet
 * verified. Captain-onboarded workers (and any worker who skipped the
 * /register Aadhaar steps) land here on login; the worker dashboard
 * redirects here if profile.aadhaarLast4 is null.
 *
 * Once submitted with all required fields, /api/worker/profile auto-
 * approves KYC (lib commit 0cb6107) and we forward to /worker/dashboard.
 */
export default function WorkerKycPage() {
  const router = useRouter()

  const [front,  setFront]   = useState('')
  const [back,   setBack]    = useState('')
  const [photo,  setPhoto]   = useState('')
  const [number, setNumber]  = useState('')
  const [consent, setConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [latlng, setLatlng]  = useState<{ lat: number; lng: number } | null>(null)

  const [photoLoading, setPhotoLoading] = useState(false)
  const [frontLoading, setFrontLoading] = useState(false)
  const [backLoading,  setBackLoading]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [ocrStatus, setOcrStatus] = useState<'idle'|'reading'|'detected'|'failed'>('idle')

  const photoRef = useRef<HTMLInputElement>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef  = useRef<HTMLInputElement>(null)

  // Bounce out if KYC already done
  useEffect(() => {
    fetch('/api/worker/profile').then(r => r.ok ? r.json() : null).then(d => {
      const wp = d?.user?.workerProfile
      if (wp?.kycStatus === 'APPROVED' && wp?.aadhaarLast4) router.replace('/worker/dashboard')
    }).catch(() => {})
  }, [router])

  // Auto-capture GPS once on mount so it lands in the same PATCH
  useEffect(() => {
    if (latlng || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      p => setLatlng({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [latlng])

  // OCR Aadhaar number from the back image
  useEffect(() => {
    if (!back || number) return
    let cancelled = false
    setOcrStatus('reading')
    ;(async () => {
      try {
        const r = await fetch('/api/worker/extract-aadhaar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: back || front }),
        })
        const d = await r.json().catch(() => ({}))
        if (cancelled) return
        if (d?.aadhaarNumber && /^\d{12}$/.test(d.aadhaarNumber)) { setNumber(d.aadhaarNumber); setOcrStatus('detected') }
        else setOcrStatus('failed')
      } catch { if (!cancelled) setOcrStatus('failed') }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back])

  const numberOk = /^\d{12}$/.test(number)
  const canSubmit = !!photo && !!front && !!back && numberOk && consent && !saving

  async function handlePhotoChange(file: File | undefined, kind: 'photo' | 'front' | 'back') {
    if (!file) return
    const setLoad = kind === 'photo' ? setPhotoLoading : kind === 'front' ? setFrontLoading : setBackLoading
    const setVal  = kind === 'photo' ? setPhoto       : kind === 'front' ? setFront       : setBack
    setLoad(true); setError('')
    try { setVal(await compressImage(file, kind === 'photo' ? 200 : 300, kind === 'photo' ? 600 : 1200)) }
    catch (ex: unknown) { setError(ex instanceof Error ? ex.message : 'Could not process image') }
    setLoad(false)
  }

  async function submit() {
    if (!canSubmit) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/worker/profile', {
        method:      'PATCH',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({
          profilePhoto:  photo,
          aadhaarFront:  front,
          aadhaarBack:   back,
          aadhaarNumber: number,
          aadhaarConsent: true,
          ...(latlng ? { lat: latlng.lat, lng: latlng.lng } : {}),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg = d?.error || `Could not save (${r.status}). Try again.`
        setError(msg); toastError(msg)
        return
      }
      // Verify the DB actually accepted the bytes. A 200 without bytes saved
      // means the write was silently swallowed (auth dropped, DB pointer off,
      // role mismatch). Surface it loudly with a toast so the user can't
      // mistake the inline preview for a real save.
      const s = d?.saved || {}
      if (!s.profilePhotoBytes || !s.aadhaarFrontBytes || !s.aadhaarBackBytes) {
        const msg = `Server didn't persist all images — photo ${s.profilePhotoBytes||0}B / front ${s.aadhaarFrontBytes||0}B / back ${s.aadhaarBackBytes||0}B. Try again or contact support.`
        setError(msg); toastError(msg)
        return
      }
      toastSuccess(`KYC submitted — photo ${Math.round(s.profilePhotoBytes/1024)}KB, Aadhaar ${Math.round((s.aadhaarFrontBytes+s.aadhaarBackBytes)/1024)}KB`)
      router.replace('/worker/dashboard')
    } catch {
      const msg = 'Network error — try again'
      setError(msg); toastError(msg)
    }
    finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
      <div style={{ padding: 'calc(20px + env(safe-area-inset-top)) 22px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ShieldCheck style={{ width: 24, height: 24, color: '#111111' }} />
          <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', margin: 0 }}>Complete your KYC</p>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', margin: '0 0 22px' }}>
          One-time verification. Required before you can accept any job.
        </p>

        {/* Selfie */}
        <Section label="Profile photo" required>
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" style={{ display: 'none' }} onChange={e => handlePhotoChange(e.target.files?.[0], 'photo')} />
          <PickerButton onClick={() => photoRef.current?.click()} loading={photoLoading} value={photo} captureLabel="Tap to take a selfie" />
        </Section>

        {/* Aadhaar Front */}
        <Section label="Aadhaar front" required>
          <input ref={frontRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={e => handlePhotoChange(e.target.files?.[0], 'front')} />
          <PickerButton onClick={() => frontRef.current?.click()} loading={frontLoading} value={front} captureLabel="Tap to capture front side" />
        </Section>

        {/* Aadhaar Back */}
        <Section label="Aadhaar back" required>
          <input ref={backRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={e => handlePhotoChange(e.target.files?.[0], 'back')} />
          <PickerButton onClick={() => backRef.current?.click()} loading={backLoading} value={back} captureLabel="Tap to capture back side" />
        </Section>

        {/* Aadhaar Number */}
        <Section label="Aadhaar number" required>
          <input
            type="tel" inputMode="numeric" maxLength={12}
            value={number}
            onChange={e => { setNumber(e.target.value.replace(/\D/g, '').slice(0, 12)); setError('') }}
            placeholder="12-digit Aadhaar number"
            style={{
              width: '100%', height: 54, padding: '0 16px', borderRadius: 12,
              background: '#F5F5F5', border: `1.5px solid ${numberOk ? '#22C55E' : 'rgba(0,0,0,0.1)'}`,
              fontSize: 17, fontWeight: 700, color: '#111111', outline: 'none', letterSpacing: 3,
              boxSizing: 'border-box',
            }}
          />
          {ocrStatus === 'reading'  && <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> Reading number from your photo…</p>}
          {ocrStatus === 'detected' && <p style={{ fontSize: 12, color: '#22C55E',          marginTop: 6, fontWeight: 600 }}>✓ Auto-detected — please verify the number above</p>}
          {ocrStatus === 'failed'   && <p style={{ fontSize: 12, color: '#DC2626',          marginTop: 6 }}>Couldn&apos;t auto-read — please type the 12 digits above</p>}
        </Section>

        {/* Live location indicator */}
        {latlng && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 14 }}>
            <CheckCircle style={{ width: 14, height: 14, color: '#22C55E' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#15803D' }}>Live location captured</span>
          </div>
        )}
        {!latlng && (
          <button type="button"
            onClick={() => navigator.geolocation?.getCurrentPosition(p => setLatlng({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true })}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.1)', marginBottom: 14, color: 'rgba(0,0,0,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            <MapPin style={{ width: 14, height: 14 }} /> Share my live location
          </button>
        )}

        {/* Consent */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
          background: consent ? 'rgba(34,197,94,0.05)' : '#F5F5F5',
          border: `1.5px solid ${consent ? '#22C55E' : 'rgba(0,0,0,0.1)'}`,
          borderRadius: 12, marginBottom: 16, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
            style={{ marginTop: 3, width: 18, height: 18, accentColor: '#111111', flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', lineHeight: 1.45 }}>
            I consent to Switch storing my Aadhaar securely for KYC. See the{' '}
            <button type="button" onClick={e => { e.preventDefault(); setShowConsent(true) }}
              style={{ background: 'none', border: 'none', padding: 0, color: '#111', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>
              full consent statement
            </button>.
            <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>
          </div>
        </label>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit}
          style={{
            width: '100%', height: 56, borderRadius: 16, fontSize: 16, fontWeight: 800, border: 'none',
            background: canSubmit ? '#111111' : 'rgba(0,0,0,0.1)',
            color: canSubmit ? '#FFFFFF' : 'rgba(0,0,0,0.3)',
            cursor: canSubmit ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {saving ? <><Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> Submitting…</> : 'Submit & Continue'}
        </button>
      </div>

      {showConsent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '20px 22px calc(20px + env(safe-area-inset-bottom))', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#111', margin: 0 }}>Aadhaar consent</p>
              <button onClick={() => setShowConsent(false)} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer' }}>
                <X style={{ width: 18, height: 18, color: 'rgba(0,0,0,0.5)' }} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, fontSize: 13, color: 'rgba(0,0,0,0.78)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
              {AADHAAR_CONSENT_TEXT_BY_VERSION[CONSENT_VERSION]}
            </div>
            <button onClick={() => { setConsent(true); setShowConsent(false) }}
              style={{ width: '100%', height: 50, borderRadius: 12, marginTop: 16, background: '#111', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              I agree
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </p>
      {children}
    </div>
  )
}

function PickerButton({ onClick, loading, value, captureLabel }: { onClick: () => void; loading: boolean; value: string; captureLabel: string }) {
  return (
    <button onClick={onClick} type="button"
      style={{ width: '100%', height: value ? 'auto' : 100, borderRadius: 14,
        border: `2px dashed ${value ? '#22C55E' : 'rgba(0,0,0,0.15)'}`,
        background: value ? 'rgba(34,197,94,0.05)' : '#F5F5F5',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', overflow: 'hidden', padding: 0 }}>
      {loading
        ? <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: 'rgba(0,0,0,0.4)' }} />
        : value
          ? <img src={value} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
          : <>
              <Camera style={{ width: 24, height: 24, color: 'rgba(0,0,0,0.4)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginTop: 6 }}>{captureLabel}</span>
            </>
      }
    </button>
  )
}

'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, MapPin, CheckCircle, Loader2 } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function CaptainCompleteProfileGate({ user, captainProfile, onComplete }: {
  user: any | null
  captainProfile: any | null
  onComplete: () => void
}) {
  const [photo, setPhoto]   = useState<string>(user?.avatar || '')
  const [latlng, setLatlng] = useState<{ lat: number; lng: number } | null>(
    captainProfile?.lat != null && captainProfile?.lng != null
      ? { lat: captainProfile.lat, lng: captainProfile.lng }
      : null
  )
  const [photoLoading, setPhotoLoading] = useState(false)
  const [locLoading,   setLocLoading]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const needsPhoto = !photo
  const needsLoc   = !latlng
  const visible    = needsPhoto || needsLoc

  useEffect(() => {
    if (!visible || !needsLoc) return
    captureLocation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoLoading(true); setError('')
    try { setPhoto(await compressImage(f, 200, 600)) }
    catch (e: any) { setError(e?.message || 'Failed to process image') }
    setPhotoLoading(false)
  }

  function captureLocation() {
    if (!('geolocation' in navigator)) { setError('Location not supported'); return }
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      p => { setLatlng({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocLoading(false); setError('') },
      err => { setLocLoading(false); setError(err.message || 'Location denied — enable in device settings') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function save() {
    if (needsPhoto || needsLoc) { setError('Both photo and location are required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/captain/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ avatar: photo, lat: latlng!.lat, lng: latlng!.lng }),
      })
      if (!res.ok) { setError('Failed to save — try again'); return }
      onComplete()
    } catch { setError('Network error') }
    setSaving(false)
  }

  if (!visible) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#FFFFFF', borderRadius: '24px 24px 0 0',
        padding: '24px 22px calc(28px + env(safe-area-inset-bottom))',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>

        <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', margin: '0 0 6px' }}>Finish your profile</p>
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', margin: '0 0 22px' }}>
          A photo and your live location are required to be visible on Ops.
        </p>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Profile photo <span style={{ color: '#DC2626' }}>*</span>
          </p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" style={{ display: 'none' }} onChange={handlePhoto} />
          <button onClick={() => fileRef.current?.click()}
            style={{
              width: '100%', height: photo ? 140 : 90, borderRadius: 16,
              border: `2px dashed ${photo ? '#22C55E' : 'rgba(0,0,0,0.15)'}`,
              background: photo ? 'rgba(34,197,94,0.05)' : '#F5F5F5',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', overflow: 'hidden', padding: 0,
            }}>
            {photoLoading ? <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: 'rgba(0,0,0,0.4)' }} />
              : photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <>
                  <Camera style={{ width: 26, height: 26, color: 'rgba(0,0,0,0.35)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)' }}>Tap to take selfie</span>
                </>
            }
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Live location <span style={{ color: '#DC2626' }}>*</span>
          </p>
          <button onClick={captureLocation} disabled={locLoading}
            style={{
              width: '100%', height: 56, borderRadius: 14,
              border: `2px solid ${latlng ? '#22C55E' : 'rgba(0,0,0,0.15)'}`,
              background: latlng ? 'rgba(34,197,94,0.05)' : '#F5F5F5',
              display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
              cursor: locLoading ? 'default' : 'pointer',
            }}>
            {latlng
              ? <CheckCircle style={{ width: 18, height: 18, color: '#22C55E' }} />
              : <MapPin style={{ width: 18, height: 18, color: 'rgba(0,0,0,0.5)' }} />
            }
            <span style={{ fontSize: 14, fontWeight: 700, color: latlng ? '#15803D' : 'rgba(0,0,0,0.6)' }}>
              {locLoading ? 'Detecting…'
                : latlng ? `Captured ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`
                : 'Tap to share your location'}
            </span>
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        <button onClick={save} disabled={saving || needsPhoto || needsLoc}
          style={{
            width: '100%', height: 54, borderRadius: 16, fontSize: 15, fontWeight: 800, border: 'none',
            background: !needsPhoto && !needsLoc ? '#111111' : 'rgba(0,0,0,0.08)',
            color: !needsPhoto && !needsLoc ? '#FFFFFF' : 'rgba(0,0,0,0.3)',
            cursor: !needsPhoto && !needsLoc && !saving ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {saving ? <><Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Saving…</> : 'Continue'}
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { useLanguage } from '@/app/worker/LanguageContext'

// Full-screen modal that opens immediately after slide-to-arrive succeeds
// and BEFORE the OTP popup. Uses getUserMedia with the front camera and
// uploads to POST /api/worker/arrival-selfie. On success, parent flips
// state and renders the OTP modal.
//
// We avoid `<input capture="user">` because it routes through the system
// camera app and breaks the inline confirm/retake flow. getUserMedia keeps
// the whole capture-confirm-upload loop inside one screen.
export default function ArrivalSelfieCapture({
  bookingId,
  onUploaded,
}: {
  bookingId: string
  onUploaded: () => void
}) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [preview,   setPreview]   = useState<string>('')
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [cameraOn,  setCameraOn]  = useState(false)

  async function startCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraOn(true)
    } catch {
      setError(t('selfieCameraError'))
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => () => stopCamera(), [])

  async function capture() {
    if (!videoRef.current) return
    const v = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width  = v.videoWidth  || 480
    canvas.height = v.videoHeight || 640
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror back so the saved selfie matches what the worker saw (the
    // live preview is CSS-mirrored).
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const raw = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85),
    )
    if (!raw) { setError(t('selfieCameraError')); return }
    try {
      const compressed = await compressImage(raw, 250, 800)
      setPreview(compressed)
      stopCamera()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('selfieCameraError'))
    }
  }

  async function upload() {
    if (!preview || uploading) return
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/worker/arrival-selfie', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingId, dataUrl: preview }),
      })
      if (!res.ok) {
        setError(t('selfieUploadError'))
        setUploading(false)
        return
      }
      onUploaded()
    } catch {
      setError(t('selfieUploadError'))
      setUploading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: '#000000',
        display: 'flex', flexDirection: 'column' as const,
        paddingTop: 'var(--safe-t, 0px)', paddingBottom: 'var(--safe-b, 0px)',
      }}
    >
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Camera style={{ width: 20, height: 20, color: '#FFFFFF' }} />
        <p style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          {t('selfieTitle')}
        </p>
      </div>
      <p style={{
        fontSize: 13, color: 'rgba(255,255,255,0.6)',
        padding: '0 18px 14px', margin: 0,
      }}>
        {t('selfieSubtitle')}
      </p>

      <div style={{
        flex: 1, position: 'relative' as const, overflow: 'hidden',
        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
        ) : cameraOn ? (
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: '100%', height: '100%', objectFit: 'cover' as const,
              transform: 'scaleX(-1)',
            }}
          />
        ) : (
          <button
            onClick={startCamera}
            style={{
              padding: '14px 22px', borderRadius: 14, border: 'none',
              background: '#FFFFFF', color: '#111111',
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <Camera style={{ width: 18, height: 18 }} />
            {t('selfieStartBtn')}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 18px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(220,38,38,0.12)',
          borderTop: '1px solid rgba(220,38,38,0.3)',
        }}>
          <AlertCircle style={{ width: 14, height: 14, color: '#FCA5A5' }} />
          <p style={{ fontSize: 12, color: '#FCA5A5', margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ padding: '14px 18px', display: 'flex', gap: 10 }}>
        {preview ? (
          <>
            <button
              onClick={() => { setPreview(''); startCamera() }}
              disabled={uploading}
              style={{
                flex: 1, height: 54, borderRadius: 14,
                background: 'transparent', color: '#FFFFFF',
                border: '1.5px solid rgba(255,255,255,0.25)',
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: uploading ? 'default' : 'pointer',
              }}
            >
              <RefreshCw style={{ width: 16, height: 16 }} />
              {t('selfieRetakeBtn')}
            </button>
            <button
              onClick={upload}
              disabled={uploading}
              style={{
                flex: 1.4, height: 54, borderRadius: 14, border: 'none',
                background: uploading ? 'rgba(34,197,94,0.5)' : '#22C55E',
                color: '#FFFFFF', fontSize: 14, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: uploading ? 'default' : 'pointer',
              }}
            >
              <Check style={{ width: 16, height: 16 }} />
              {uploading ? t('selfieUploadingBtn') : t('selfieUseBtn')}
            </button>
          </>
        ) : cameraOn ? (
          <button
            onClick={capture}
            style={{
              flex: 1, height: 60, borderRadius: 30, border: 'none',
              background: '#FFFFFF', color: '#111111',
              fontSize: 15, fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 11,
              border: '3px solid #111111', background: '#FFFFFF',
            }} />
            Capture
          </button>
        ) : null}
      </div>
    </div>
  )
}


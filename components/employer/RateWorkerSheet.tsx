'use client'
import { useEffect, useState } from 'react'
import { X, CheckCircle, Loader2 } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function RateWorkerSheet({ target, onClose, onSubmitted }: {
  target: { booking: any; workerName: string } | null
  onClose: () => void
  onSubmitted: (bookingId: string, score: number) => void
}) {
  const [visible,    setVisible]    = useState(false)
  const [stars,      setStars]      = useState(0)
  const [hovered,    setHovered]    = useState(0)
  const [comment,    setComment]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (target) {
      setStars(0); setHovered(0); setComment(''); setSubmitted(false); setError('')
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [target])

  function close() { setVisible(false); setTimeout(onClose, 280) }

  async function submit() {
    if (!target) return
    if (stars === 0) { setError('Pick a star rating'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/ratings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingId: target.booking.id, score: stars, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to submit')
      } else {
        setSubmitted(true)
        setTimeout(() => onSubmitted(target.booking.id, stars), 1200)
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (!target) return null
  const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!']

  return (
    <>
      <div onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81,
        background: '#0F0F0F', borderRadius: '24px 24px 0 0',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
        color: '#FFFFFF',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {!submitted && (
          <button onClick={close}
            style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.6)' }} />
          </button>
        )}

        <div style={{ padding: '20px 22px 28px', overflowY: 'auto' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <CheckCircle style={{ width: 28, height: 28, color: '#22C55E' }} />
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Rating saved</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Thanks — this helps other employers find good workers.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Rate the worker</p>
              <p style={{ fontSize: 22, fontWeight: 900, margin: '0 0 20px' }}>How was {target.workerName}?</p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n}
                    onPointerEnter={() => setHovered(n)} onPointerLeave={() => setHovered(0)}
                    onClick={() => { setStars(n); setError('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 38, opacity: n <= (hovered || stars) ? 1 : 0.25, transition: 'opacity 0.12s', lineHeight: 1, padding: 0 }}>
                    ⭐
                  </button>
                ))}
              </div>
              <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#FCD34D', minHeight: 20, marginBottom: 18 }}>
                {stars > 0 ? LABELS[stars] : 'Tap a star to rate'}
              </p>

              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                Review <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>(optional)</span>
              </p>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="What stood out — punctuality, attitude, work quality?"
                rows={3}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
                  padding: '12px 14px', fontSize: 14, color: '#FFFFFF',
                  outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 12,
                  fontFamily: 'inherit',
                }} />

              {error && <p style={{ fontSize: 13, color: '#FCA5A5', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{error}</p>}

              <button onClick={submit} disabled={submitting || stars === 0}
                style={{
                  width: '100%', height: 52, borderRadius: 14, fontSize: 15, fontWeight: 800, border: 'none',
                  background: stars > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
                  color: stars > 0 ? '#000000' : 'rgba(255,255,255,0.3)',
                  cursor: stars > 0 && !submitting ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {submitting ? <><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Submitting…</> : 'Submit Rating'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

'use client'
import { useState } from 'react'
import { Star, CheckCircle, AlertCircle } from 'lucide-react'
import { useLang } from '@/lib/lang'

// Auto-pops once the employer's booking flips to COMPLETED (worker slid to
// end the shift). POSTs to /api/ratings; the server validates that the
// caller is the booking's employer and that the booking is COMPLETED.
// Mirrors the worker-side RateEmployerModal but uses lib/lang.tsx (the
// employer-side i18n system).
export default function RateWorkerModal({
  bookingId,
  workerName,
  onDone,
}: {
  bookingId: string
  workerName: string
  onDone: () => void
}) {
  const { t } = useLang()
  const [score, setScore] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (score < 1 || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/ratings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingId, score, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        // Surface the server's reason when available (e.g. "you have
        // already rated this booking", "booking is not COMPLETED yet")
        // instead of the generic catch-all — the employer otherwise has
        // no way to tell a real failure from an already-rated booking
        // and may keep retrying.
        const d = await res.json().catch(() => null) as { error?: string } | null
        setError(d?.error || t.rate_failed)
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setTimeout(onDone, 1200)
    } catch {
      setError(t.rate_failed)
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#111111',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: '1px solid rgba(255,255,255,0.12)',
        borderBottom: 'none',
        padding: '20px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
        color: '#FFFFFF',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 16px',
        }} />

        {submitted ? (
          <div style={{ textAlign: 'center' as const, padding: '24px 0 12px' }}>
            <CheckCircle style={{ width: 48, height: 48, color: '#22C55E', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.rate_thanks}</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>{t.rate_worker_title}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' }}>{t.rate_worker_sub}</p>
            {workerName && (
              <p style={{ fontSize: 14, fontWeight: 700, color: '#FCD34D', margin: '0 0 14px' }}>
                {workerName}
              </p>
            )}

            <p style={{
              fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
              margin: '4px 0 8px', letterSpacing: 0.5, textTransform: 'uppercase' as const,
            }}>
              {t.rate_stars_label}
            </p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const active = n <= (hover || score)
                return (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} star`}
                    style={{
                      width: 52, height: 52, borderRadius: 12, border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'transform 0.1s',
                      transform: active ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <Star
                      style={{
                        width: 38, height: 38,
                        color: active ? '#FCD34D' : 'rgba(255,255,255,0.18)',
                        fill:  active ? '#FCD34D' : 'transparent',
                        strokeWidth: 1.5,
                      }}
                    />
                  </button>
                )
              })}
            </div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 300))}
              placeholder={t.rate_review_ph}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box' as const,
                padding: '12px 14px', borderRadius: 12,
                border: '1.5px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#FFFFFF', fontSize: 14,
                fontFamily: 'inherit', resize: 'none' as const,
                outline: 'none', marginBottom: 14,
              }}
            />

            {error && (
              <p style={{
                fontSize: 13, color: '#FF6B6B', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                margin: '0 0 12px',
              }}>
                <AlertCircle style={{ width: 14, height: 14 }} />
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onDone}
                disabled={submitting}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  background: 'transparent',
                  border: '1.5px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer',
                }}
              >
                {t.rate_skip}
              </button>
              <button
                onClick={submit}
                disabled={score < 1 || submitting}
                style={{
                  flex: 1.6, height: 50, borderRadius: 14, border: 'none',
                  background: score >= 1 ? '#22C55E' : 'rgba(255,255,255,0.10)',
                  color: score >= 1 ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  fontSize: 14, fontWeight: 800,
                  cursor: score >= 1 && !submitting ? 'pointer' : 'default',
                }}
              >
                {submitting ? t.rate_submitting : t.rate_submit}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Star, CheckCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/app/worker/LanguageContext'

// Shown automatically once the worker slides-to-end (status flipped to
// COMPLETED). POST to /api/ratings — role check + uniqueness already
// enforced server-side. Modal cannot be dismissed by tapping outside;
// only the explicit Skip button closes without submitting.
export default function RateEmployerModal({
  bookingId,
  employerName,
  onDone,
}: {
  bookingId: string
  employerName: string
  onDone: () => void
}) {
  const { t } = useLanguage()
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
        setError(t('rateFailed'))
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setTimeout(onDone, 1200)
    } catch {
      setError(t('rateFailed'))
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
        padding: '20px 18px calc(20px + var(--safe-b, 0px))',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 16px',
        }} />

        {submitted ? (
          <div style={{ textAlign: 'center' as const, padding: '24px 0 12px' }}>
            <CheckCircle style={{ width: 48, height: 48, color: '#22C55E', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              {t('rateThanks')}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', margin: '0 0 4px' }}>
              {t('rateEmployerTitle')}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' }}>
              {t('rateEmployerSub')}
            </p>
            {employerName && (
              <p style={{ fontSize: 14, fontWeight: 700, color: '#FCD34D', margin: '0 0 14px' }}>
                {employerName}
              </p>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', margin: '4px 0 8px', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>
              {t('rateStarsLabel')}
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
              placeholder={t('rateReviewPlaceholder')}
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
                {t('rateSkipBtn')}
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
                {submitting ? t('rateSubmittingBtn') : t('rateSubmitBtn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

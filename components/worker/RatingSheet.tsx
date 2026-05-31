'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, X, Loader2 } from 'lucide-react'
import JobIcon from './JobIcon'

// Bottom-sheet 5-star rating modal for completed shifts. Extracted from
// app/worker/shifts/page.tsx so it can be reused (active shift end-flow,
// earnings page, Jyoti voice flow) without duplicating the UI.
//
// `required={true}` blocks dismissal until a star is selected — used after
// shift completion where rating is mandatory before the worker can pick up
// another job.

function jobEmoji(title: string) {
  const s = (title || '').toLowerCase()
  if (s.includes('shop') || s.includes('helper'))     return '🏪'
  if (s.includes('delivery') || s.includes('rider'))  return '🚴'
  if (s.includes('warehouse'))                         return '🏭'
  if (s.includes('security') || s.includes('guard'))  return '🔒'
  if (s.includes('kitchen') || s.includes('cook'))    return '🍳'
  if (s.includes('driver'))                           return '🚗'
  if (s.includes('clean'))                            return '🧹'
  if (s.includes('pack'))                             return '📦'
  if (s.includes('cashier'))                          return '🛒'
  return '💼'
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!']

export default function RatingSheet({
  bookingId, title, company, required, onClose, onSubmit,
}: {
  bookingId: string | null
  title:     string
  company:   string
  required?: boolean
  onClose:   () => void
  onSubmit:  (bookingId: string, score: number, comment: string) => void
}) {
  const [stars,      setStars]      = useState(0)
  const [hovered,    setHovered]    = useState(0)
  const [comment,    setComment]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [visible,    setVisible]    = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (bookingId) {
      setStars(0); setHovered(0); setComment('')
      setSubmitted(false); setError('')
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [bookingId])

  function close() {
    if (required && !submitted) {
      setError('Please give a star rating before closing.')
      return
    }
    setVisible(false)
    setTimeout(onClose, 300)
  }

  async function submit() {
    if (stars === 0) { setError('Please select a star rating.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/ratings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bookingId, score: stars, comment: comment.trim() || undefined }),
      })
      if (res.ok) {
        setSubmitted(true)
        if (bookingId) onSubmit(bookingId, stars, comment)
        setTimeout(() => { setVisible(false); setTimeout(onClose, 300) }, 1800)
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to submit')
      }
    } catch {
      setError('Network error. Try again.')
    }
    setSubmitting(false)
  }

  if (!bookingId) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={close}
        style={{
          background: 'rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
        }}>
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>

        {!submitted && (
          <button
            onClick={close}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.07)' }}>
            <X style={{ width: 14, height: 14, color: 'rgba(0,0,0,0.5)' }} />
          </button>
        )}

        <div className="px-5 overflow-y-auto flex-1" style={{ paddingBottom: 'var(--safe-b)' }}>
          {submitted ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(0,0,0,0.06)' }}>
                <CheckCircle style={{ width: 28, height: 28, color: '#111111' }} />
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#111111', marginBottom: 4 }}>Thanks for rating!</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.38)' }}>Your feedback helps improve the platform</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 mt-2">
                <JobIcon emoji={jobEmoji(title)} size={44} radius={12} />
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#111111' }}>{title}</p>
                  <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.38)', marginTop: 2 }}>{company}</p>
                </div>
              </div>

              {required && (
                <div style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 12, padding: '8px 12px', marginBottom: 12,
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#D97706' }}>
                    ⭐ Rating required to complete your shift
                  </p>
                </div>
              )}

              <p style={{ fontSize: 16, fontWeight: 800, color: '#111111', marginBottom: 12 }}>
                How was your experience?
              </p>
              <div className="flex gap-2 justify-center mb-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n}
                    onPointerEnter={() => setHovered(n)}
                    onPointerLeave={() => setHovered(0)}
                    onClick={() => { setStars(n); setError('') }}
                    style={{
                      fontSize: 36,
                      opacity: n <= (hovered || stars) ? 1 : 0.2,
                      transition: 'opacity 0.1s', lineHeight: 1,
                    }}>⭐</button>
                ))}
              </div>
              <p className="text-center mb-4"
                style={{ fontSize: 14, fontWeight: 700, color: '#D97706', minHeight: 22 }}>
                {stars > 0 ? LABELS[stars] : 'Tap a star to rate'}
              </p>

              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>
                Review <span style={{ color: 'rgba(0,0,0,0.28)', fontWeight: 400 }}>(optional)</span>
              </p>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Tell others about this job…"
                rows={3}
                style={{
                  width: '100%',
                  background: '#F5F5F5',
                  border: '1px solid rgba(0,0,0,0.09)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  fontSize: 14, color: '#111111',
                  outline: 'none', resize: 'none', marginBottom: 10,
                }} />

              {error && (
                <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>{error}</p>
              )}

              <button
                onClick={submit}
                disabled={submitting || stars === 0}
                style={{
                  width: '100%', height: 52, borderRadius: 14,
                  fontSize: 16, fontWeight: 800, border: 'none',
                  background: stars > 0 ? '#111111' : 'rgba(0,0,0,0.08)',
                  color:      stars > 0 ? '#FFFFFF' : 'rgba(0,0,0,0.3)',
                  cursor:     stars > 0 && !submitting ? 'pointer' : 'not-allowed',
                  boxShadow:  stars > 0 ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.2s', marginBottom: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {submitting
                  ? <><Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> Submitting…</>
                  : 'Submit Rating'
                }
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

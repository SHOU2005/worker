'use client'
import { useState } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { useLang } from '@/lib/lang'

// Confirm-and-refund modal for the employer. Only shown by the parent when
// the shift is OPEN with no accepted bookings — the server enforces the
// same rule defensively (returns SHIFT_NOT_OPEN / WORKER_ALREADY_ACCEPTED).
export default function CancelShiftModal({
  shiftId,
  onCancelled,
  onClose,
}: {
  shiftId: string
  onCancelled: () => void
  onClose: () => void
}) {
  const { t } = useLang()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/employer/jobs/${shiftId}/cancel-refund`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || t.cancel_shift_failed)
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setTimeout(onCancelled, 1500)
    } catch {
      setError(t.cancel_shift_failed)
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#111111', color: '#FFFFFF',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: '1px solid rgba(255,255,255,0.12)', borderBottom: 'none',
        padding: '20px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 16px',
        }} />

        {submitted ? (
          <div style={{ textAlign: 'center' as const, padding: '24px 0 12px' }}>
            <CheckCircle style={{ width: 48, height: 48, color: '#22C55E', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.cancel_shift_done}</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 18, fontWeight: 900, margin: '0 0 6px' }}>{t.cancel_shift_title}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 14px', lineHeight: 1.4 }}>
              {t.cancel_shift_sub}
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 300))}
              placeholder={t.cancel_shift_reason_ph}
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
                onClick={onClose}
                disabled={submitting}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  background: 'transparent',
                  border: '1.5px solid rgba(255,255,255,0.18)',
                  color: '#FFFFFF', fontSize: 14, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer',
                }}
              >
                {t.cancel_shift_back}
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  flex: 1.4, height: 50, borderRadius: 14, border: 'none',
                  background: '#DC2626', color: '#FFFFFF',
                  fontSize: 14, fontWeight: 800,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? '…' : t.cancel_shift_confirm}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/app/worker/LanguageContext'

// Bottom-sheet reason picker shown when the worker taps "Cancel this job"
// on the post-accept screen. Submits to PATCH /api/bookings/[id] with
// status=CANCELLED and the chosen reason. All copy is i18n'd via the
// worker translations (app/worker/i18n.ts).
export default function CancelJobSheet({
  bookingId,
  onCancelled,
  onClose,
}: {
  bookingId: string
  onCancelled: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [reasonKey, setReasonKey] = useState<string>('')
  const [otherText, setOtherText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const REASONS: Array<{ key: string; label: string }> = [
    { key: 'NOT_AVAILABLE', label: t('reasonNotAvailable') },
    { key: 'TOO_FAR',       label: t('reasonTooFar') },
    { key: 'LOW_PAY',       label: t('reasonLowPay') },
    { key: 'CHANGED_MIND',  label: t('reasonChangedMind') },
    { key: 'HEALTH',        label: t('reasonHealth') },
    { key: 'OTHER',         label: t('reasonOther') },
  ]

  async function submit() {
    if (!reasonKey || submitting) return
    setSubmitting(true)
    setError('')
    // Compose a reason string in the form "KEY: optional freetext" so server
    // logs stay machine-parseable while still capturing nuance. The picker
    // label itself is locale-specific and not stored.
    const composedReason = reasonKey === 'OTHER' && otherText.trim()
      ? `OTHER: ${otherText.trim()}`
      : reasonKey
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'CANCELLED', cancelReason: composedReason }),
      })
      if (!res.ok) {
        setError(t('cancelFailed'))
        setSubmitting(false)
        return
      }
      onCancelled()
    } catch {
      setError(t('cancelFailed'))
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#111111',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: '1px solid rgba(255,255,255,0.12)',
        borderBottom: 'none',
        padding: '18px 18px calc(20px + var(--safe-b, 0px))',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 14px',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>
              {t('cancelTitle')}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '4px 0 0', lineHeight: 1.4 }}>
              {t('cancelSubtitle')}
            </p>
          </div>
          {!submitting && (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32, height: 32, borderRadius: 16, border: 'none',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {REASONS.map(r => {
            const selected = reasonKey === r.key
            return (
              <button
                key={r.key}
                onClick={() => { setReasonKey(r.key); setError('') }}
                disabled={submitting}
                style={{
                  width: '100%', textAlign: 'left' as const,
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: `1.5px solid ${selected ? '#22C55E' : 'rgba(255,255,255,0.12)'}`,
                  background: selected ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)',
                  color: '#FFFFFF',
                  fontSize: 14, fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}
              >
                <span>{r.label}</span>
                <span style={{
                  width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                  border: `2px solid ${selected ? '#22C55E' : 'rgba(255,255,255,0.3)'}`,
                  background: selected ? '#22C55E' : 'transparent',
                }} />
              </button>
            )
          })}
        </div>

        {reasonKey === 'OTHER' && (
          <textarea
            value={otherText}
            onChange={e => setOtherText(e.target.value.slice(0, 200))}
            placeholder={t('reasonOtherPlaceholder')}
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box' as const,
              padding: '12px 14px', borderRadius: 12,
              border: '1.5px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#FFFFFF', fontSize: 14,
              fontFamily: 'inherit', resize: 'none' as const,
              outline: 'none', marginBottom: 12,
            }}
          />
        )}

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
            {t('cancelBackBtn')}
          </button>
          <button
            onClick={submit}
            disabled={!reasonKey || submitting}
            style={{
              flex: 1.4, height: 50, borderRadius: 14, border: 'none',
              background: reasonKey ? '#DC2626' : 'rgba(255,255,255,0.10)',
              color: reasonKey ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
              fontSize: 14, fontWeight: 800,
              cursor: reasonKey && !submitting ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            {submitting ? t('cancellingBtn') : t('cancelConfirmBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

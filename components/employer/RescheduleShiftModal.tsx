'use client'
import { useState } from 'react'
import { AlertCircle, CheckCircle, Calendar } from 'lucide-react'
import { useLang } from '@/lib/lang'

// Primary employer action while a shift is OPEN — pick a new date + time,
// keep the payment + worker search alive. Cancel-and-refund is reachable
// as a secondary link inside this modal so cancellation isn't the easy
// path. Server (POST /api/employer/jobs/[id]/reschedule) enforces the
// same OPEN-only rule defensively.
export default function RescheduleShiftModal({
  shiftId,
  currentDate,
  currentStartTime,
  currentEndTime,
  onRescheduled,
  onClose,
  onSwitchToCancel,
}: {
  shiftId: string
  currentDate: string                // ISO date (Shift.date)
  currentStartTime: string           // "HH:MM"
  currentEndTime?: string            // "HH:MM"
  onRescheduled: () => void
  onClose: () => void
  onSwitchToCancel: () => void
}) {
  const { t } = useLang()
  // Seed inputs with the current schedule so the employer can tweak just
  // one field instead of re-entering all three. Shift.date stores a full
  // datetime; we slice to YYYY-MM-DD for the date <input>.
  const seedDate = currentDate ? currentDate.slice(0, 10) : ''
  const [date, setDate] = useState(seedDate)
  const [startTime, setStartTime] = useState(currentStartTime || '09:00')
  const [endTime, setEndTime] = useState(currentEndTime || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (submitting || !date || !startTime) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/employer/jobs/${shiftId}/reschedule`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date, startTime, endTime: endTime || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || t.reschedule_failed)
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setTimeout(onRescheduled, 1400)
    } catch {
      setError(t.reschedule_failed)
      setSubmitting(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box' as const,
    padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: '#FFFFFF', fontSize: 15,
    fontFamily: 'inherit',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
    margin: '14px 0 6px', letterSpacing: 0.4, textTransform: 'uppercase' as const,
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
        maxHeight: '90vh', overflowY: 'auto' as const,
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 16px',
        }} />

        {submitted ? (
          <div style={{ textAlign: 'center' as const, padding: '24px 0 12px' }}>
            <CheckCircle style={{ width: 48, height: 48, color: '#22C55E', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.reschedule_done}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Calendar style={{ width: 20, height: 20, color: '#FCD34D' }} />
              <p style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.reschedule_title}</p>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 4px', lineHeight: 1.4 }}>
              {t.reschedule_sub}
            </p>

            <label style={labelStyle}>{t.reschedule_date_label}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={submitting}
              style={fieldStyle}
            />

            <label style={labelStyle}>{t.reschedule_start_label}</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              disabled={submitting}
              style={fieldStyle}
            />

            <label style={labelStyle}>{t.reschedule_end_label}</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              disabled={submitting}
              style={fieldStyle}
            />

            {error && (
              <p style={{
                fontSize: 13, color: '#FF6B6B', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                margin: '14px 0 0',
              }}>
                <AlertCircle style={{ width: 14, height: 14 }} />
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
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
                {t.reschedule_back}
              </button>
              <button
                onClick={submit}
                disabled={submitting || !date || !startTime}
                style={{
                  flex: 1.4, height: 50, borderRadius: 14, border: 'none',
                  background: '#FFFFFF', color: '#000000',
                  fontSize: 14, fontWeight: 800,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? t.reschedule_submitting : t.reschedule_confirm}
              </button>
            </div>

            <button
              onClick={() => { if (!submitting) onSwitchToCancel() }}
              disabled={submitting}
              style={{
                marginTop: 14, width: '100%', padding: '10px 0',
                background: 'transparent', border: 'none',
                color: 'rgba(255,107,107,0.85)',
                fontSize: 12, fontWeight: 600,
                textDecoration: 'underline',
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.reschedule_or_cancel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

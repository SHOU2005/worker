'use client'
import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Clock, Zap, Star, CheckCircle, XCircle } from 'lucide-react'
import { getJobPhoto } from './JobIcon'
import { useLang } from '@/lib/lang'

type UrgentJob = {
  id: number; emoji: string; title: string; company: string
  pay: number; hours: number; totalPay: number
  distance: string; time: string; day: string
  urgent: boolean; rating: number; slots: number; tag: string
  address?: string
}

type Props = {
  job: UrgentJob | null
  onView: (job: UrgentJob) => void
  onDismiss: () => void
}

/* Classic telephone bell: 480Hz + 440Hz sine mix, repeating tring-tring pattern */
function startTelephoneBell(): () => void {
  if (typeof window === 'undefined') return () => {}
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()

    function ring(startTime: number, duration: number) {
      const compress = ctx.createDynamicsCompressor()
      compress.threshold.value = -3
      compress.ratio.value = 8
      compress.connect(ctx.destination)

      for (const freq of [480, 440]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(compress)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.008)
        gain.gain.setValueAtTime(0.5, startTime + duration - 0.01)
        gain.gain.linearRampToValueAtTime(0, startTime + duration)
        osc.start(startTime)
        osc.stop(startTime + duration + 0.05)
      }
    }

    function scheduleCycle(baseTime: number) {
      ring(baseTime,        0.42)   // tring
      ring(baseTime + 0.57, 0.42)   // tring  (pair)
    }

    scheduleCycle(ctx.currentTime)
    const id = setInterval(() => scheduleCycle(ctx.currentTime), 2000)

    return () => {
      clearInterval(id)
      try { ctx.close() } catch {}
    }
  } catch {
    return () => {}
  }
}

function showOsNotification(job: UrgentJob) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  const show = () => {
    try {
      new Notification('⚡ Urgent Job Nearby!', {
        body: `${job.title} at ${job.company} — ₹${job.totalPay.toLocaleString('en-IN')}`,
        icon: '/favicon.ico',
        tag: `urgent-${job.id}`,
        requireInteraction: true,
      })
    } catch {}
  }
  if (Notification.permission === 'granted') show()
  else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') show() })
}

function registerSW() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

export default function UrgentJobPopup({ job, onView, onDismiss }: Props) {
  const { t } = useLang()
  const [visible,   setVisible]   = useState(false)
  const [countdown, setCountdown] = useState(60)
  const stopBellRef = useRef<(() => void) | null>(null)

  useEffect(() => { registerSW() }, [])

  useEffect(() => {
    if (job) {
      setCountdown(60)
      requestAnimationFrame(() => setVisible(true))
      navigator.vibrate?.([200, 100, 200, 100, 200])
      showOsNotification(job)
      stopBellRef.current = startTelephoneBell()
    } else {
      setVisible(false)
      stopBellRef.current?.()
      stopBellRef.current = null
    }
    return () => {
      stopBellRef.current?.()
      stopBellRef.current = null
    }
  }, [job])

  useEffect(() => {
    if (!job) return
    if (countdown <= 0) { onDismiss(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, job, onDismiss])

  if (!job) return null

  function dismiss() {
    stopBellRef.current?.()
    stopBellRef.current = null
    setVisible(false)
    setTimeout(onDismiss, 280)
  }
  function accept() {
    stopBellRef.current?.()
    stopBellRef.current = null
    setVisible(false)
    setTimeout(() => onView(job!), 280)
  }

  const pct   = (countdown / 60) * 100
  const photo = getJobPhoto(job.title)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[58] transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0 }}
        onClick={dismiss}
      />

      {/* Center modal */}
      <div
        className="fixed z-[60] flex flex-col overflow-hidden"
        style={{
          top: '50%', left: '50%',
          transform: visible
            ? 'translate(-50%,-50%) scale(1)'
            : 'translate(-50%,-50%) scale(0.88)',
          opacity: visible ? 1 : 0,
          width: 'min(88vw, 380px)',
          maxHeight: '86vh',
          background: '#FFFFFF',
          borderRadius: 28,
          boxShadow: '0 32px 96px rgba(0,0,0,0.22)',
          transition: 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
        }}
      >
        {/* Countdown bar */}
        <div style={{ height: 3, background: 'rgba(220,38,38,0.12)', flexShrink: 0, borderRadius: '28px 28px 0 0' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#DC2626', transition: 'width 1s linear', borderRadius: '28px 0 0 0' }} />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 pb-2 pt-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)' }}>
                <Zap style={{ width: 12, height: 12, color: '#DC2626', fill: '#DC2626' }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', letterSpacing: '0.05em' }}>URGENT</span>
              </div>
              <div className="px-2.5 py-1 rounded-full" style={{ background: '#111111' }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{countdown}s</span>
              </div>
            </div>
            <button onClick={dismiss}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: '#F0F0F0' }}>
              <X style={{ width: 16, height: 16, color: 'rgba(0,0,0,0.5)' }} />
            </button>
          </div>

          {/* Job photo hero */}
          <div style={{ height: 160, borderRadius: 18, overflow: 'hidden', position: 'relative', marginBottom: 14 }}>
            <img src={photo} alt={job.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.7) 100%)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 14px 14px' }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{job.title}</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{job.company}</p>
            </div>
          </div>

          {/* Pay card */}
          <div className="rounded-2xl p-4 mb-3"
            style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.4)', marginBottom: 3 }}>Total you earn</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: '#111111', lineHeight: 1 }}>
              ₹{job.totalPay.toLocaleString('en-IN')}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 5 }}>
              ₹{job.pay}/hr × {job.hours} hours
            </p>
          </div>

          {/* Meta chips */}
          <div className="flex gap-2 mb-2">
            {[
              { icon: Clock,  label: 'SHIFT',  value: job.time },
              { icon: MapPin, label: 'AWAY',   value: job.distance },
              { icon: Star,   label: 'RATING', value: String(job.rating) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex-1 flex flex-col rounded-xl p-2.5"
                style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.38)', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', lineHeight: 1.2 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pinned footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <div className="flex gap-2.5">
            <button onClick={dismiss}
              className="flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{ width: 60, height: 60, background: '#F0F0F0', border: '1.5px solid rgba(220,38,38,0.2)' }}>
              <XCircle style={{ width: 24, height: 24, color: '#DC2626' }} />
            </button>
            <button onClick={accept}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl"
              style={{ height: 60, background: '#111111', boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }}>
              <CheckCircle style={{ width: 20, height: 20, color: '#FFFFFF' }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>{t.accept_job as string}</span>
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.32)', textAlign: 'center', marginTop: 8 }}>
            Auto-dismisses in {countdown}s
          </p>
        </div>
      </div>
    </>
  )
}

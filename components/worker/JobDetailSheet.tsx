'use client'
import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Clock, Star, Users, IndianRupee, Calendar, ArrowRight, CheckCircle, Zap } from 'lucide-react'
import JobIcon from './JobIcon'
import { useLang } from '@/lib/lang'

type Job = {
  id:number; emoji:string; title:string; company:string
  pay:number; hours:number; totalPay:number
  distance:string; time:string; day:string
  urgent:boolean; rating:number; slots:number; tag:string
  address?:string
}

/* ── Slide to Accept ─────────────────────────── */
function SlideToAccept({ onConfirm, label }: { onConfirm:()=>void; label:string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const startX   = useRef(0)
  const curX     = useRef(0)
  const [x, setX]      = useState(0)
  const [done, setDone] = useState(false)

  const THUMB_W = 52
  const PAD     = 5
  const maxX    = () => (trackRef.current?.offsetWidth ?? 320) - THUMB_W - PAD * 2

  function onDown(e: React.PointerEvent) {
    if (done) return
    startX.current = e.clientX - curX.current
    thumbRef.current?.setPointerCapture(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!thumbRef.current?.hasPointerCapture(e.pointerId)) return
    const nx = Math.max(0, Math.min(e.clientX - startX.current, maxX()))
    curX.current = nx; setX(nx)
  }
  function onUp() {
    if (curX.current >= maxX() * 0.82) {
      setX(maxX()); setDone(true); setTimeout(onConfirm, 350)
    } else { curX.current = 0; setX(0) }
  }

  const pct   = x / Math.max(maxX(), 1)
  const fillW = x + THUMB_W + PAD * 2

  return (
    <div ref={trackRef} className="relative select-none"
      style={{
        height: 64, borderRadius: 32, overflow: 'hidden',
        background: done ? '#111111' : 'rgba(0,0,0,0.07)',
        border: `2px solid ${done ? '#111111' : 'rgba(0,0,0,0.12)'}`,
        transition: 'background 0.4s, border-color 0.3s',
      }}>

      {!done && (
        <div className="absolute inset-y-0 left-0 pointer-events-none"
          style={{ width: fillW, background: 'linear-gradient(90deg,rgba(0,0,0,0.12),rgba(0,0,0,0.2))', borderRadius: 32, transition: 'none' }} />
      )}

      {!done ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ paddingLeft: THUMB_W + PAD * 2 + 8, paddingRight: 16, opacity: Math.max(0, 1 - pct * 1.8) }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(0,0,0,0.55)' }}>{label}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
          <CheckCircle style={{ width: 20, height: 20, color: '#FFFFFF' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>Accepted!</span>
        </div>
      )}

      <div ref={thumbRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        className="absolute flex items-center justify-center z-10"
        style={{
          top: PAD, bottom: PAD, width: THUMB_W,
          left: x + PAD,
          borderRadius: THUMB_W / 2,
          background: done ? 'rgba(255,255,255,0.25)' : '#111111',
          boxShadow: '0 3px 14px rgba(0,0,0,0.2)',
          touchAction: 'none', cursor: done ? 'default' : 'grab',
          transition: done ? 'left 0.35s ease' : 'none',
        }}>
        {done
          ? <CheckCircle style={{ width: 22, height: 22, color: '#FFFFFF' }} />
          : <ArrowRight  style={{ width: 20, height: 20, color: '#FFFFFF' }} />
        }
      </div>
    </div>
  )
}

/* ── Sheet ───────────────────────────────────── */
export default function JobDetailSheet({ job, onClose, onAccepted }: { job:Job|null; onClose:()=>void; onAccepted:(j:Job)=>void }) {
  const [visible, setVisible] = useState(false)
  const { t } = useLang()

  useEffect(() => {
    if (job) requestAnimationFrame(() => setVisible(true))
    else setVisible(false)
  }, [job])

  function close()  { setVisible(false); setTimeout(onClose, 320) }
  function accept() { if (job) { setVisible(false); setTimeout(() => onAccepted(job), 320) } }

  if (!job) return null

  const INFO = [
    { icon: Calendar,    label: t.date_when, value: `${job.day} · ${job.time}` },
    { icon: Clock,       label: t.duration,  value: `${job.hours} hours` },
    { icon: IndianRupee, label: t.pay_lbl,   value: `₹${job.pay}/hr · ₹${job.totalPay.toLocaleString('en-IN')} total` },
    { icon: MapPin,      label: t.distance,  value: job.distance },
    { icon: Users,       label: t.slots,     value: t.spots_left(job.slots) },
    { icon: Star,        label: t.rating,    value: `${job.rating} / 5.0` },
  ]

  return (
    <>
      <div className="fixed inset-0 z-[54] transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.75)', opacity: visible ? 1 : 0 }}
        onClick={close} />

      <div className="fixed left-0 right-0 bottom-0 z-[55] flex flex-col overflow-hidden"
        style={{
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          maxHeight: '92vh',
          paddingBottom: 'var(--safe-b)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
        }}>

        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(0,0,0,0.15)' }} />
        </div>

        <div className="overflow-y-auto flex-1">

          <div className="flex items-start justify-between px-5 pt-3 pb-4">
            <div className="flex items-center gap-3">
              <JobIcon emoji={job.emoji} size={56} radius={16} />
              <div>
                <p style={{ fontSize: 20, fontWeight: 900, color: '#111111' }}>{job.title}</p>
                <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{job.company}</p>
                {job.urgent && (
                  <div className="flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', display: 'inline-flex' }}>
                    <Zap style={{ width: 11, height: 11, color: '#DC2626' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>Urgent – Fill fast!</span>
                  </div>
                )}
              </div>
            </div>
            <button onClick={close} className="w-9 h-9 rounded-full flex items-center justify-center mt-1"
              style={{ background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.09)' }}>
              <X style={{ width: 18, height: 18, color: 'rgba(0,0,0,0.5)' }} />
            </button>
          </div>

          <div className="mx-5 mb-4 p-4 rounded-2xl flex items-center justify-between"
            style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)' }}>
            <div>
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', marginBottom: 4 }}>{t.you_will_earn}</p>
              <p style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: '#111111' }}>
                ₹{job.totalPay.toLocaleString('en-IN')}
              </p>
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>₹{job.pay}/hr × {job.hours} hours</p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.09)' }}>
              <IndianRupee style={{ width: 28, height: 28, color: '#111111', strokeWidth: 1.8 }} />
            </div>
          </div>

          {job.address && (
            <div className="mx-5 mb-4">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-3 p-4 rounded-2xl"
                style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)', textDecoration: 'none', display: 'flex' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#111111' }}>
                  <MapPin style={{ width: 18, height: 18, color: '#FFFFFF' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em', marginBottom: 4 }}>
                    LOCATION · TAP TO OPEN MAP
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', lineHeight: 1.4 }}>{job.address}</p>
                  <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.38)', marginTop: 4 }}>{job.distance} from you</p>
                </div>
              </a>
            </div>
          )}

          <div className="mx-5 mb-4">
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 10 }}>
              {t.job_details}
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.09)' }}>
              {INFO.map(({ icon: Icon, label, value }, i) => (
                <div key={label}>
                  <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: '#F5F5F5' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(0,0,0,0.07)' }}>
                      <Icon style={{ width: 16, height: 16, color: 'rgba(0,0,0,0.6)', strokeWidth: 1.8 }} />
                    </div>
                    <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', flex: 1 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', textAlign: 'right' }}>{value}</p>
                  </div>
                  {i < INFO.length - 1 && <div className="mx-4 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />}
                </div>
              ))}
            </div>
          </div>

          <div className="mx-5 mb-5">
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: 10 }}>
              {t.what_to_bring}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(t.what_bring_items as string[]).map(item => (
                <div key={item} className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl"
                  style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)' }}>
                  <CheckCircle style={{ width: 14, height: 14, color: '#111111', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111111', lineHeight: 1.3 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-4" />
        </div>

        <div className="flex-shrink-0 px-5 pt-4 pb-6"
          style={{ borderTop: '1px solid rgba(0,0,0,0.08)', background: '#FFFFFF' }}>
          <div className="flex items-center justify-between mb-4 px-1">
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t.you_will_earn}</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#111111' }}>₹{job.totalPay.toLocaleString('en-IN')}</p>
          </div>
          <SlideToAccept onConfirm={accept} label={t.slide_to_accept as string} />
          <p className="text-center mt-3" style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}>{t.money_note}</p>
        </div>
      </div>
    </>
  )
}

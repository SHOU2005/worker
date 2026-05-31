'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, MapPin, Clock, IndianRupee, Navigation } from 'lucide-react'
import JobIcon from './JobIcon'
import { useLang } from '@/lib/lang'

type Job = {
  id:number; emoji:string; title:string; company:string
  pay:number; hours:number; totalPay:number
  distance:string; time:string; day:string
  urgent:boolean; rating:number; slots:number; tag:string
}

export default function ShiftConfirmed({ job, onDone }: { job:Job|null; onDone:()=>void }) {
  const [show, setShow] = useState(false)
  const { t } = useLang()

  useEffect(() => {
    if (job) requestAnimationFrame(() => setShow(true))
    else setShow(false)
  }, [job])

  // Auto-dismiss after 5 seconds so the Active Job Banner appears automatically
  useEffect(() => {
    if (!job) return
    const timer = setTimeout(() => onDone(), 5000)
    return () => clearTimeout(timer)
  }, [job, onDone])

  if (!job) return null

  function goToWork() {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job!.company)}`
    window.open(url, '_blank')
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col"
      style={{
        background: '#FFFFFF',
        paddingTop: 'var(--safe-t)', paddingBottom: 'var(--safe-b)',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1)',
      }}>

      {/* Auto-dismiss progress bar */}
      <div style={{ height: 3, background: 'rgba(0,0,0,0.08)' }}>
        <div style={{
          height: '100%',
          background: '#111111',
          animation: 'shrinkBar 5s linear forwards',
        }} />
      </div>
      <style>{`@keyframes shrinkBar { from { width:100% } to { width:0% } }`}</style>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* Big tick */}
        <div className="w-28 h-28 flex items-center justify-center mb-6"
          style={{
            background: '#111111',
            borderRadius: 36,
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
            animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
          <CheckCircle style={{ width: 56, height: 56, color: '#FFFFFF', strokeWidth: 1.6 }} />
        </div>

        <p style={{ fontSize: 28, fontWeight: 900, color: '#111111', marginBottom: 6, letterSpacing: -0.5 }}>
          {t.confirm_job_ttl}
        </p>
        <p style={{ fontSize: 16, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>{t.confirm_job_sub}</p>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}>Returning to home in 5 seconds…</p>

        {/* Shift card */}
        <div className="w-full mt-6 p-5 rounded-3xl text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <JobIcon emoji={job.emoji} size={48} radius={14} />
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text1)' }}>{job.title}</p>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{job.company}</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              { Icon: Clock,       text: `${job.day} · ${job.time}` },
              { Icon: IndianRupee, text: `₹${job.totalPay.toLocaleString('en-IN')} — paid after shift` },
              { Icon: MapPin,      text: `${job.distance} from you` },
            ].map(({ Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sur2)' }}>
                  <Icon style={{ width: 14, height: 14, color: 'var(--text3)', strokeWidth: 1.8 }} />
                </div>
                <span style={{ fontSize: 14, color: 'var(--text2)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-3 flex-shrink-0">
        {/* Primary: Go to Work */}
        <button
          onClick={goToWork}
          className="btn btn-full"
          style={{
            height: 60, fontSize: 16, fontWeight: 800, borderRadius: 18,
            background: '#111111',
            border: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            color: '#FFFFFF',
          }}>
          <Navigation style={{ width: 20, height: 20 }} />
          Get Directions &amp; Go!
        </button>

        {/* Secondary: skip to banner */}
        <button
          onClick={onDone}
          className="w-full text-center py-3"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)' }}>
          {t.back_to_jobs}
        </button>
      </div>
    </div>
  )
}

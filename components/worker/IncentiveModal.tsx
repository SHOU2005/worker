'use client'
import { useEffect, useState } from 'react'
import { X, TrendingUp } from 'lucide-react'
import { getProgress, getMilestone, getNextMilestone } from '@/lib/milestones'

const STORAGE_KEY = 'sw_incentive_seen_'

export default function IncentiveModal({ totalShifts, weeklyEarnings }: {
  totalShifts: number
  weeklyEarnings?: number
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    if (localStorage.getItem(STORAGE_KEY + today)) return
    // Small delay so it doesn't pop instantly
    const t = setTimeout(() => setOpen(true), 800)
    return () => clearTimeout(t)
  }, [])

  function close() {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(STORAGE_KEY + today, '1')
    setOpen(false)
  }

  if (!open) return null

  const current = getMilestone(totalShifts)
  const next    = getNextMilestone(totalShifts)
  const prog    = getProgress(totalShifts)

  return (
    <div onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#111111', borderRadius: '24px 24px 0 0',
          padding: '22px 22px calc(28px + env(safe-area-inset-bottom))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.5)', color: '#FFFFFF',
          animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(252,211,77,0.15)', border: '1px solid rgba(252,211,77,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              {next ? next.emoji : current.emoji}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Daily Boost
              </p>
              <p style={{ fontSize: 18, fontWeight: 900, margin: '2px 0 0' }}>
                {next ? `Reach ${next.label} tier` : 'Top tier achieved!'}
              </p>
            </div>
          </div>
          <button onClick={close}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.55)' }} />
          </button>
        </div>

        {next ? (
          <>
            <p style={{ fontSize: 22, fontWeight: 900, margin: '8px 0 4px', letterSpacing: -0.3 }}>
              <span style={{ color: '#FCD34D' }}>{prog.remaining}</span> more {prog.remaining === 1 ? 'shift' : 'shifts'} → <span style={{ color: '#FCD34D' }}>+{next.bonusPct}%</span> on your hourly rate
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Every hour at the {next.label} tier earns you {next.bonusPct}% more than now. Stack shifts this week to unlock it.
            </p>

            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{current.emoji} {current.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>{totalShifts}/{next.minJobs}</span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${prog.pct}%`, background: 'linear-gradient(90deg,#FCD34D,#F59E0B)', borderRadius: 8, transition: 'width 0.5s' }} />
              </div>
            </div>

            {weeklyEarnings != null && weeklyEarnings > 0 && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp style={{ width: 14, height: 14, color: '#22C55E' }} />
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                  You earned <span style={{ fontWeight: 800, color: '#FFF' }}>₹{weeklyEarnings.toLocaleString('en-IN')}</span> last week
                </p>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', margin: '0 0 16px' }}>
            You're a {current.label} worker — earning {current.bonusPct}% extra on every hour. Keep going!
          </p>
        )}

        <a href="/worker/jobs"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 52, borderRadius: 14, background: '#FFFFFF', color: '#000000',
            fontWeight: 800, fontSize: 15, textDecoration: 'none',
          }}>
          Find Jobs Now
        </a>
        <button onClick={close}
          style={{ width: '100%', height: 40, marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600 }}>
          Maybe later
        </button>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { getService, getServicesInCategory } from '@/lib/service-catalog'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const PINK  = '#FFFFFF'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

interface Props {
  service: string
  mode:    'home' | 'business'
  slot:    string
  imgFor:  (name: string) => string
  onClose: () => void
}

export default function ServiceDetailSheet({ service, mode, slot, imgFor, onClose }: Props) {
  const router = useRouter()
  const [active, setActive] = useState(service)

  // Lock background scroll while the sheet is open so the page behind
  // doesn't drift on mobile when the user scrolls inside the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const def       = getService(active)
  const related   = [
    def,
    ...getServicesInCategory(def.cat, active),
  ].slice(0, 6)

  function goSchedule() {
    onClose()
    router.push(`/employer/schedule/${encodeURIComponent(active)}?mode=${mode}&slot=${slot}`)
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: BG, borderRadius: '26px 26px 0 0', width: '100%', maxWidth: 560,
          border: `1px solid ${BD}`, borderBottom: 'none',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          animation: 'sheet-rise 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}>
        <style>{`
          @keyframes sheet-rise { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .svc-tabs::-webkit-scrollbar { display: none; }
        `}</style>

        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: BD, margin: '12px auto 8px' }} />

        <div style={{ overflowY: 'auto', padding: '12px 18px 20px', flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: T1, letterSpacing: -0.6, marginBottom: 16 }}>What is included?</div>

          {/* Related services tabs */}
          <div className="svc-tabs"
            style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 20, marginLeft: -2, marginRight: -2 }}>
            {related.map(r => {
              const isActive = r.id === active
              return (
                <button key={r.id} onClick={() => setActive(r.id)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px 8px 8px', borderRadius: 14,
                    background: isActive ? 'rgba(255,255,255,0.06)' : SURF,
                    border: `1.5px solid ${isActive ? PINK : BD}`,
                    color: T1, fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
                    cursor: 'pointer', maxWidth: 220,
                  }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: SURF2, flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgFor(r.id)} alt={r.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%', display: 'block' }} />
                  </div>
                  <span style={{ whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                </button>
              )
            })}
          </div>

          {/* The expert is trained to */}
          <div style={{ fontSize: 18, fontWeight: 800, color: T1, marginBottom: 14, letterSpacing: -0.3 }}>The expert is trained to</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
            {def.includes.map(item => (
              <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Check style={{ width: 13, height: 13, color: '#fff', strokeWidth: 3 }} />
                </div>
                <span style={{ fontSize: 15, color: T1, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* What is not included */}
          <div style={{ fontSize: 18, fontWeight: 800, color: T1, marginBottom: 14, letterSpacing: -0.3 }}>What is not included</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
            {def.excludes.map(item => (
              <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <X style={{ width: 13, height: 13, color: '#fff', strokeWidth: 3 }} />
                </div>
                <span style={{ fontSize: 15, color: T1, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Equipment notice */}
          <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 22, lineHeight: 1, marginTop: -1 }}>🧹</div>
            <div style={{ flex: 1, fontSize: 13, color: T1, lineHeight: 1.45 }}>{def.equipment}</div>
          </div>
        </div>

        {/* Action bar — Schedule only */}
        <div style={{
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
          borderTop: `1px solid ${BD}`,
          background: BG,
        }}>
          <button onClick={goSchedule}
            style={{ width: '100%', padding: '15px', borderRadius: 14, background: T1, border: 'none', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: FONT, boxShadow: '0 10px 24px rgba(255,255,255,0.10)' }}>
            Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

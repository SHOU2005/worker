'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Search } from 'lucide-react'
import ServiceDetailSheet from '@/components/employer/ServiceDetailSheet'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.30)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

const STD_RATE = 149
const STD_UNIT = '/hr'

// Mirror of SERVICE_META in app/employer/page.tsx so the two surfaces look
// identical. Keep both in sync if you add a new service.
// Honest review counts (sub-200) and tight 4.5–4.9 star band, matching the
// dashboard SERVICE_META.  Keep both in sync.
const SERVICE_META: Record<string, { rate: number; unit: string; rating: string; reviews: string; iconPath: string }> = {
  'Maid':             { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '187', iconPath: 'M3 21h18M5 21V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13M9 12h6M9 16h6' },
  'Cook':             { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '142', iconPath: 'M4 13h16l-1 8H5l-1-8zM6 13a6 6 0 0 1 12 0M12 4v3' },
  'Kitchen Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '98',  iconPath: 'M14 3l5 5-7 7-5-5 7-7zM9 14l-4 4 2 2 4-4' },
  'Driver':           { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '156', iconPath: 'M5 10l1.5-4h11L19 10M3 10h18v6h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3v-6z' },
  'General Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '76',  iconPath: 'M9 7l3-3 3 3M12 4v12M5 14l3 3h8l3-3' },
  'Caretaker':        { rate: STD_RATE, unit: STD_UNIT, rating: '4.9', reviews: '52',  iconPath: 'M12 21s-7-4-7-10a7 7 0 1 1 14 0c0 6-7 10-7 10z' },
  'Waiter':           { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '88',  iconPath: 'M12 3v3M5 9h14a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4zM12 13v8M8 21h8' },
  'Bartender':        { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '47',  iconPath: 'M5 4h14l-6 7v6h3v3H8v-3h3v-6L5 4z' },
  'Security Guard':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '109', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
  'Bouncer':          { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '34',  iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  'Promoter':         { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '41',  iconPath: 'M3 11l18-8-5 18-3-8-3 3-7-5z' },
  'Factory Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.5', reviews: '28',  iconPath: 'M3 21h18M4 21V10l5-3v3l5-3v3l5-3v14M9 15h2M14 15h2' },
}

const IMG = (f: string) => `/icons/services/${f}.jpg?v=6`

const ROLES: Record<string, { img: string; cat: string }> = {
  'Maid':            { img: IMG('sw-maid'),           cat: 'Home'     },
  'Cook':            { img: IMG('sw-cook'),           cat: 'Kitchen'  },
  'Kitchen Helper':  { img: IMG('sw-kitchen-helper'), cat: 'Kitchen'  },
  'Caretaker':       { img: IMG('sw-maid'),           cat: 'Home'     },
  'Waiter':          { img: IMG('sw-waiter'),         cat: 'Events'   },
  'Bartender':       { img: IMG('sw-bartender'),      cat: 'Events'   },
  'Security Guard':  { img: IMG('sw-security-guard'), cat: 'Security' },
  'Bouncer':         { img: IMG('sw-security-guard'), cat: 'Security' },
  'Driver':          { img: IMG('sw-driver'),         cat: 'Driver'   },
  'Promoter':        { img: IMG('sw-waiter'),         cat: 'Events'   },
  'General Helper':  { img: IMG('sw-maid'),           cat: 'Home'     },
  'Factory Helper':  { img: IMG('sw-driver'),         cat: 'Driver'   },
}

const CATS = ['All', 'Home', 'Kitchen', 'Events', 'Security', 'Driver'] as const
type Cat = typeof CATS[number]

export default function AllServicesPage() {
  return <Suspense fallback={null}><AllServicesInner /></Suspense>
}

function AllServicesInner() {
  const router = useRouter()
  const search_ = useSearchParams()
  const initialCat = (search_?.get('cat') || 'All') as Cat
  const [cat, setCat]       = useState<Cat>(CATS.includes(initialCat) ? initialCat : 'All')
  const [search, setSearch] = useState('')
  const [previewService, setPreviewService] = useState<string | null>(null)

  // Keep the category in sync when the user lands here with a ?cat= query.
  useEffect(() => {
    const next = (search_?.get('cat') || 'All') as Cat
    if (CATS.includes(next) && next !== cat) setCat(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search_])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.entries(ROLES)
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .filter(([, info]) => cat === 'All' || info.cat === cat)
  }, [search, cat])

  return (
    <div style={{ minHeight: '100dvh' as any, background: BG, fontFamily: FONT, color: T1, paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
      <style>{`
        @keyframes svc-pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .svc-card { animation: svc-pop 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .svc-cats::-webkit-scrollbar { display: none; }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(14px + env(safe-area-inset-top)) 14px 8px' }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>All Services</div>
          <div style={{ fontSize: 13, color: T2, marginTop: 3 }}>{visible.length} services available</div>
        </div>
      </header>

      {/* Search */}
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: SURF, border: `1px solid ${search ? BDH : BD}`, borderRadius: 14, padding: '12px 14px' }}>
          <Search style={{ width: 16, height: 16, color: T2, flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search any service…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: T1, fontSize: 14, fontFamily: FONT }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: T2, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="svc-cats" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 14px 4px' }}>
        {CATS.map(c => {
          const sel = c === cat
          return (
            <button key={c} onClick={() => setCat(c)}
              style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 99, background: sel ? T1 : SURF, color: sel ? '#000' : T1, border: `1.5px solid ${sel ? T1 : BD}`, fontFamily: FONT, fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: -0.1 }}>
              {c}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 14px 28px' }}>
        {visible.map(([name, info], idx) => {
          const meta = SERVICE_META[name] || { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '100', iconPath: 'M12 2v20M2 12h20' }
          return (
            <button key={name} onClick={() => setPreviewService(name)}
              className="svc-card"
              style={{
                animationDelay: `${Math.min(idx, 10) * 35}ms`,
                background: '#0E1014', border: `1px solid ${BD}`,
                borderRadius: 18, padding: 0, overflow: 'hidden', cursor: 'pointer',
                textAlign: 'left' as const, fontFamily: FONT, color: T1,
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 22px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '5/6', overflow: 'hidden', background: '#0A0B0E' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={info.img} alt={name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }} />
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.92) 100%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 10, bottom: 56, width: 32, height: 32, borderRadius: 16, background: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.30)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0A0B0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={meta.iconPath}/>
                  </svg>
                </div>
                <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8 }}>
                  <div style={{ fontSize: 19, fontWeight: 900, color: T1, letterSpacing: -0.4, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: 600, marginTop: 3 }}>
                    Starting at <span style={{ color: T1, fontWeight: 800 }}>₹{meta.rate}{meta.unit}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderTop: `1px solid ${BD}` }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: T1, fontWeight: 800 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={T1}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  {meta.rating}
                  <span style={{ color: 'rgba(255,255,255,0.50)', fontWeight: 600, fontSize: 11 }}>({meta.reviews})</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'rgba(255,255,255,0.72)', fontWeight: 700 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Verified
                </span>
              </div>
              <div style={{ padding: '0 8px 8px' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '9px 12px', borderRadius: 10, background: T1, color: '#000', fontWeight: 600, fontSize: 15, letterSpacing: -0.1 }}>
                  <span>Book Now</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {visible.length === 0 && (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: T2, fontSize: 14 }}>No services match your search.</div>
      )}

      {previewService && (
        <ServiceDetailSheet
          service={previewService}
          mode={'home'}
          slot={'8h'}
          imgFor={(name) => ROLES[name]?.img ?? IMG('house-cleaner')}
          onClose={() => setPreviewService(null)}
        />
      )}
    </div>
  )
}

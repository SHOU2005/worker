'use client'
import { usePathname, useRouter } from 'next/navigation'

const BG   = '#0E0E0E'
const BD   = 'rgba(255,255,255,0.07)'
const T1   = '#FFFFFF'
const T3   = 'rgba(255,255,255,0.32)'
const FONT = '"DM Sans", -apple-system, "system-ui", Roboto, sans-serif'

const TABS = [
  {
    label: 'Home', path: '/employer',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? T1 : 'none'} stroke={active ? T1 : T3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    label: 'Bookings', path: '/employer/jobs',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? T1 : T3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Wallet', path: '/employer/wallet',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? T1 : T3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M16 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill={active ? T1 : T3}/>
        <line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Profile', path: '/employer/profile',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? T1 : T3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

export default function EmpBottomNav() {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: BG, borderTop: `1px solid ${BD}`,
      display: 'flex', zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
      fontFamily: FONT,
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.path
          || (tab.path !== '/employer' && pathname?.startsWith(tab.path) === true)
        return (
          <button
            key={tab.path}
            className="emp-press"
            onClick={() => { if (!active) router.push(tab.path) }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, padding: '10px 0 8px',
              border: 'none', background: 'none', cursor: 'pointer', position: 'relative',
              fontFamily: FONT,
            }}
          >
            {active && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 24, height: 2, background: T1, borderRadius: '0 0 3px 3px',
              }} />
            )}
            {tab.icon(active)}
            <span style={{
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? T1 : T3,
            }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Briefcase, BookOpen, TrendingUp, MessageSquare, Settings, Map, Plus, Send, Wallet, Tag } from 'lucide-react'

const S1  = '#0F0F0F'
const BD  = 'rgba(255,255,255,0.08)'
const T1  = '#FFFFFF'
const T2  = 'rgba(255,255,255,0.35)'

const LINKS = [
  { href: '/ops',             label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/ops/live-map',    label: 'Live Map',  Icon: Map              },
  { href: '/ops/jobs/new',    label: 'Post Job',  Icon: Plus             },
  { href: '/ops/shifts',      label: 'Shifts',    Icon: Briefcase        },
  { href: '/ops/broadcast',   label: 'Broadcast', Icon: Send             },
  { href: '/ops/captains',    label: 'Captains',  Icon: Users            },
  { href: '/ops/workers',     label: 'Workers',   Icon: Briefcase        },
  { href: '/ops/bookings',    label: 'Bookings',  Icon: BookOpen         },
  { href: '/ops/commissions', label: 'Finance',   Icon: TrendingUp       },
  { href: '/ops/withdrawals', label: 'Withdrawals', Icon: Wallet         },
  { href: '/ops/promos',      label: 'Promos',    Icon: Tag              },
  { href: '/ops/complaints',  label: 'Complaints',Icon: MessageSquare    },
  { href: '/ops/settings',    label: 'Settings',  Icon: Settings         },
]

export default function OpsNav() {
  const pathname = usePathname()

  return (
    <>
      {/* Sidebar — desktop */}
      <nav style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, background: S1, borderRight: `1px solid ${BD}`, display: 'none', flexDirection: 'column', zIndex: 50, padding: '20px 0' }} className="ops-sidebar">
        <div style={{ padding: '0 16px 20px', borderBottom: `1px solid ${BD}` }}>
          <p style={{ color: T1, fontWeight: 800, fontSize: 18, margin: 0, letterSpacing: -0.5 }}>Switch Ops</p>
          <p style={{ color: T2, fontSize: 12, margin: '4px 0 0' }}>Operations Portal</p>
        </div>
        {LINKS.map(({ href, label, Icon }) => {
          const on = pathname === href || (href !== '/ops' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', margin: '2px 8px', borderRadius: 10, background: on ? 'rgba(255,255,255,0.08)' : 'transparent', textDecoration: 'none' }}>
              <Icon style={{ width: 17, height: 17, color: on ? T1 : T2 }} />
              <span style={{ fontSize: 14, fontWeight: on ? 700 : 400, color: on ? T1 : T2 }}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom nav — mobile */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: S1, borderTop: `1px solid ${BD}`, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }} className="ops-bottomnav">
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0 4px' }}>
          {LINKS.slice(0, 5).map(({ href, label, Icon }) => {
            const on = pathname === href || (href !== '/ops' && pathname.startsWith(href))
            return (
              <Link key={href} href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', flex: 1 }}>
                <Icon style={{ width: 22, height: 22, color: on ? T1 : T2 }} />
                <span style={{ fontSize: 10, fontWeight: on ? 700 : 400, color: on ? T1 : T2 }}>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <style>{`
        @media (min-width: 768px) {
          .ops-sidebar    { display: flex !important; }
          .ops-bottomnav  { display: none !important; }
        }
      `}</style>
    </>
  )
}

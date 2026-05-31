'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, Users, Wallet, Building2 } from 'lucide-react'

const TABS = [
  { href: '/employer',          label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/employer/jobs',     label: 'Jobs',      Icon: Briefcase       },
  { href: '/employer/workers',  label: 'Workers',   Icon: Users           },
  { href: '/employer/payments', label: 'Payments',  Icon: Wallet          },
  { href: '/employer/profile',  label: 'Profile',   Icon: Building2       },
]

export default function EmployerBottomNav({ active }: { active?: string }) {
  const pathname = usePathname()
  const current  = active ?? pathname

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {TABS.map(({ href, label, Icon }) => {
          const on = current === href || (href !== '/employer' && current.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-[3px] flex-1 py-1 relative"
            >
              {on && (
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 h-0.5 rounded-full"
                  style={{ width: 28, background: '#14B8A6' }}
                />
              )}
              <Icon
                style={{
                  width: 24, height: 24,
                  color: on ? '#5EEAD4' : 'var(--text3)',
                  strokeWidth: on ? 2.2 : 1.7,
                  transition: 'color 0.2s',
                }}
              />
              <span
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: on ? '#5EEAD4' : 'var(--text3)',
                  transition: 'color 0.2s',
                }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

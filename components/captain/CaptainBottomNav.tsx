'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, CheckSquare, User } from 'lucide-react'
import { useLanguage } from '@/app/captain/LanguageContext'

export default function CaptainBottomNav({ active }: { active?: string }) {
  const pathname = usePathname()
  const { t }    = useLanguage()
  const current  = active ?? pathname

  const TABS = [
    { href: '/captain',           label: t('home'),      Icon: Home        },
    { href: '/captain/referrals', label: t('referrals'), Icon: Users       },
    { href: '/captain/tasks',     label: t('tasks'),     Icon: CheckSquare },
    { href: '/captain/profile',   label: t('profile'),   Icon: User        },
  ]

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {TABS.map(({ href, label, Icon }) => {
          const on = current === href || (href !== '/captain' && current.startsWith(href))
          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-[3px] flex-1 py-1 relative">
              <Icon style={{ width: 24, height: 24, color: on ? '#111111' : 'rgba(0,0,0,0.3)', strokeWidth: on ? 2.2 : 1.7, transition: 'color 0.2s' }} />
              <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? '#111111' : 'rgba(0,0,0,0.3)', transition: 'color 0.2s' }}>
                {label}
              </span>
              {on && <span className="absolute -top-2 left-1/2 -translate-x-1/2 h-0.5 rounded-full" style={{ width: 20, background: '#111111' }} />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

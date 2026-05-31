'use client'
import { Bell } from 'lucide-react'
import Link from 'next/link'

interface Props {
  name?: string
  unread?: number
  title?: string
}

export default function TopBar({ name, unread = 0, title }: Props) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = (name && name.trim()) ? name : ''
  const initial = displayName ? displayName[0].toUpperCase() : '·'

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{ paddingTop: 'var(--safe-t)', background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center justify-between px-5 h-14">
        {title ? (
          <p className="text-[18px] font-black" style={{ color: '#111111' }}>{title}</p>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-black flex-shrink-0"
              style={{ background: '#111111', color: '#FFFFFF', fontSize: 15 }}
            >
              {initial}
            </div>
            <div className="leading-none">
              <p className="font-medium" style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginBottom: 2 }}>
                {greeting} 👋
              </p>
              {displayName ? (
                <p className="font-bold" style={{ fontSize: 16, color: '#111111' }}>{displayName}</p>
              ) : (
                <div style={{ width: 90, height: 14, borderRadius: 6, background: 'rgba(0,0,0,0.08)' }} />
              )}
            </div>
          </div>
        )}

        <Link
          href="/worker/notifications"
          className="relative w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.1)' }}
        >
          <Bell style={{ width: 19, height: 19, color: 'rgba(0,0,0,0.6)', strokeWidth: 1.8 }} />
          {unread > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
              style={{ background: '#FF3B30', borderColor: '#FFFFFF' }}
            />
          )}
        </Link>
      </div>
    </header>
  )
}

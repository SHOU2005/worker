'use client'
import Link from 'next/link'
import { Bell, Building2 } from 'lucide-react'

interface Props {
  title: string
  unread?: number
}

export default function EmployerTopBar({ title, unread = 0 }: Props) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{ paddingTop: 'var(--safe-t)', background: '#111827', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)' }}
          >
            <Building2 style={{ width: 17, height: 17, color: '#14B8A6', strokeWidth: 2 }} />
          </div>
          <p className="text-[18px] font-black" style={{ color: '#fff' }}>{title}</p>
        </div>

        <Link
          href="/employer/jobs"
          className="relative w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'var(--surface)' }}
        >
          <Bell style={{ width: 19, height: 19, color: 'var(--text2)', strokeWidth: 1.8 }} />
          {unread > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
              style={{ background: '#EF4444', borderColor: '#111827' }}
            />
          )}
        </Link>
      </div>
    </header>
  )
}

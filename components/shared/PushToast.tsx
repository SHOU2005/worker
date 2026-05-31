'use client'
import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'

interface Toast {
  id:    number
  title: string
  body:  string
  url?:  string
}

export default function PushToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    function handle(e: Event) {
      const n = (e as CustomEvent).detail
      const id = Date.now()
      setToasts(t => [...t, { id, title: n.title || 'Switch', body: n.body || '', url: n.data?.url }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
    }
    window.addEventListener('sw-push', handle)
    return () => window.removeEventListener('sw-push', handle)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 12, left: 12, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => { if (t.url) window.location.href = t.url }}
          style={{
            background: '#111827',
            borderRadius: 16,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            pointerEvents: 'all',
            cursor: t.url ? 'pointer' : 'default',
            animation: 'slideIn 0.25s ease',
          }}
        >
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(20,184,166,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell style={{ width: 16, height: 16, color: '#14B8A6' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, lineHeight: '18px' }}>{t.title}</p>
            {t.body && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '2px 0 0', lineHeight: '16px' }}>{t.body}</p>}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setToasts(ts => ts.filter(x => x.id !== t.id)) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>
      ))}
      <style>{`@keyframes slideIn{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}

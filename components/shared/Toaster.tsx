'use client'
/**
 * Renders toasts dispatched via lib/toast.ts. Mount once at the top of each
 * role's layout (worker, employer, captain, ops) — it listens to the
 * window 'sw-toast' event bus and stacks up to 4 toasts at a time.
 *
 * Distinct from PushToast.tsx (which renders FCM-arriving notifications).
 * Could be merged later but the visual treatments diverged enough that
 * keeping them separate is cheaper than a generalised toast.
 */
import { useEffect, useState } from 'react'
import { CheckCircle, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { TOAST_EVENT, ToastDetail } from '@/lib/toast'

interface MountedToast extends ToastDetail { id: number }

const KIND_STYLE: Record<ToastDetail['kind'], { bg: string; border: string; icon: typeof CheckCircle; iconColor: string; title: string }> = {
  success: { bg: '#ECFDF5', border: 'rgba(16,185,129,0.35)',  icon: CheckCircle,    iconColor: '#10B981', title: 'Success' },
  error:   { bg: '#FEF2F2', border: 'rgba(220,38,38,0.30)',   icon: AlertCircle,    iconColor: '#DC2626', title: 'Something went wrong' },
  warning: { bg: '#FFFBEB', border: 'rgba(245,158,11,0.35)',  icon: AlertTriangle,  iconColor: '#F59E0B', title: 'Heads up' },
  info:    { bg: '#EFF6FF', border: 'rgba(14,165,233,0.30)',  icon: Info,           iconColor: '#0EA5E9', title: 'Info' },
}

export default function Toaster() {
  const [toasts, setToasts] = useState<MountedToast[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail
      if (!detail || !detail.message) return
      const id = Date.now() + Math.random()
      setToasts(prev => {
        // Cap at 4 — drop the oldest if a flood comes in
        const next = [...prev, { ...detail, id }]
        return next.length > 4 ? next.slice(-4) : next
      })
      const ttl = detail.durationMs ?? 4000
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ttl)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      left: 16, right: 16,
      zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const meta = KIND_STYLE[t.kind] || KIND_STYLE.info
        const Icon = meta.icon
        return (
          <div key={t.id}
            role="alert"
            style={{
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              pointerEvents: 'all',
              animation: 'swToastIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
              maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', width: '100%',
            }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon style={{ width: 18, height: 18, color: meta.iconColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#111111', margin: 0 }}>{t.title || meta.title}</p>
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', margin: '2px 0 0', lineHeight: 1.35, wordBreak: 'break-word' }}>
                {t.message}
              </p>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              aria-label="Dismiss"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, marginTop: -2 }}>
              <X style={{ width: 14, height: 14, color: 'rgba(0,0,0,0.45)' }} />
            </button>
          </div>
        )
      })}
      <style>{`@keyframes swToastIn { from { opacity: 0; transform: translateY(-12px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }`}</style>
    </div>
  )
}

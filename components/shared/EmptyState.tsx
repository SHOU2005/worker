'use client'
/**
 * Standard empty-state card. One pattern across worker / employer / ops
 * pages so the visual tone of "nothing to see yet" stays consistent.
 *
 * <EmptyState
 *   icon="🔍"
 *   title="No shifts yet"
 *   message="Accept your first job and start earning"
 *   actionLabel="Browse Jobs"
 *   onAction={() => router.push('/worker/jobs')}
 * />
 */
import { ReactNode } from 'react'

interface Props {
  icon?:        ReactNode  // emoji string or <Icon /> element
  title:        string
  message?:     string
  actionLabel?: string
  onAction?:    () => void
  variant?:     'light' | 'dark'  // light = white card, dark = ops/captain
}

export default function EmptyState({ icon = '✨', title, message, actionLabel, onAction, variant = 'light' }: Props) {
  const isDark = variant === 'dark'
  return (
    <div style={{
      padding: '40px 24px',
      borderRadius: 20,
      background: isDark ? '#0F0F0F' : '#FFFFFF',
      border:     isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
      boxShadow:  isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.04)',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 44, marginBottom: 12,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 72, borderRadius: '50%',
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      }}>
        {icon}
      </div>
      <p style={{
        fontSize: 18, fontWeight: 800,
        color: isDark ? '#FFFFFF' : '#111111',
        margin: '0 0 6px',
      }}>{title}</p>
      {message && (
        <p style={{
          fontSize: 14,
          color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
          margin: '0 auto 20px',
          maxWidth: 320,
          lineHeight: 1.4,
        }}>{message}</p>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '12px 28px', borderRadius: 14, border: 'none',
            background: isDark ? '#FFFFFF' : '#111111',
            color:      isDark ? '#000000' : '#FFFFFF',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

'use client'
import { useEffect } from 'react'

/**
 * Generic error boundary content for route-level error.tsx files.
 * Next.js calls this when a server or client error bubbles up.
 */
export default function RouteError({ error, reset, theme = 'light' }: {
  error: Error & { digest?: string }
  reset: () => void
  theme?: 'light' | 'dark'
}) {
  useEffect(() => {
    console.error('[RouteError]', error)
  }, [error])

  const dark = theme === 'dark'
  const bg   = dark ? '#000' : '#FFF'
  const t1   = dark ? '#FFF' : '#111'
  const t2   = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const surf = dark ? 'rgba(255,255,255,0.05)' : '#F5F5F5'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg, padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, background: surf,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 30,
        }}>⚠️</div>
        <p style={{ fontSize: 22, fontWeight: 900, color: t1, margin: '0 0 8px' }}>Something went wrong</p>
        <p style={{ fontSize: 14, color: t2, margin: '0 0 20px', lineHeight: 1.5 }}>
          We hit an unexpected error. Please try again — the issue has been logged.
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: t2, margin: '0 0 20px', fontFamily: 'monospace' }}>
            Error ID: {error.digest}
          </p>
        )}
        <button onClick={reset}
          style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none',
            background: t1, color: bg, fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}>
          Try again
        </button>
      </div>
    </div>
  )
}

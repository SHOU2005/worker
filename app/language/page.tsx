'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LANGUAGES, Lang } from '@/lib/lang'

function LanguageInner() {
  const router = useRouter()
  const search = useSearchParams()
  const [selected, setSelected] = useState<Lang | null>(null)
  const [isChange, setIsChange] = useState(false)

  useEffect(() => {
    const current = localStorage.getItem('sw_lang') as Lang | null
    if (current && LANGUAGES.find(l => l.code === current)) {
      setSelected(current)
      setIsChange(true)
    }
  }, [])

  function handleContinue() {
    if (!selected) return
    localStorage.setItem('sw_lang', selected)
    // First-launch flow passes ?next=/login so we land back on the
    // login page (not via history.back, which is a no-op on a fresh
    // app boot where /language is the first route). Strict allowlist
    // of local paths so a crafted query can't open-redirect elsewhere.
    const next = search?.get('next') || ''
    if (next.startsWith('/') && !next.startsWith('//')) {
      router.replace(next)
    } else {
      router.back()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000000',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 'calc(env(safe-area-inset-top) + 48px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
      paddingLeft: 24,
      paddingRight: 24,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: '#111111',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>S</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', letterSpacing: -0.5 }}>Switch</span>
      </div>

      {/* Heading */}
      <p style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.2, marginBottom: 8 }}>
        {isChange ? 'Change Language' : 'Choose your language'}
      </p>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.45)', marginBottom: 36 }}>
        अपनी भाषा चुनें · আপনার ভাষা বেছে নিন
      </p>

      {/* Language grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        flex: 1,
      }}>
        {LANGUAGES.map(lang => {
          const active = selected === lang.code
          return (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code)}
              dir={lang.dir}
              style={{
                borderRadius: 20,
                padding: '20px 16px',
                background: active ? '#FFFFFF' : '#111111',
                border: `2px solid ${active ? '#FFFFFF' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: lang.dir === 'rtl' ? 'flex-end' : 'flex-start',
                gap: 6,
                transition: 'all 0.18s ease',
                cursor: 'pointer',
                outline: 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#000000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 11, color: '#FFFFFF', lineHeight: 1 }}>✓</span>
                </div>
              )}
              <span style={{
                fontSize: 26,
                fontWeight: 800,
                color: active ? '#000000' : '#FFFFFF',
                lineHeight: 1.1,
              }}>
                {lang.native}
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)',
              }}>
                {lang.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!selected}
        style={{
          marginTop: 28,
          height: 58,
          borderRadius: 18,
          background: selected ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
          border: 'none',
          fontSize: 17,
          fontWeight: 800,
          color: selected ? '#000000' : 'rgba(255,255,255,0.3)',
          cursor: selected ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          letterSpacing: 0.2,
        }}
      >
        {selected
          ? isChange
            ? `Save — ${LANGUAGES.find(l => l.code === selected)?.label}`
            : `Continue in ${LANGUAGES.find(l => l.code === selected)?.label}`
          : 'Select a language to continue'
        }
      </button>
    </div>
  )
}

export default function LanguagePage() {
  return <Suspense fallback={null}><LanguageInner /></Suspense>
}

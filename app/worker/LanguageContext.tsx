'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Lang, TKey, translations, LANGUAGES } from './i18n'

// Single shared key with /language picker page and lib/lang.tsx. Previously
// this file used 'worker_lang' which meant the /language page (writes
// sw_lang) and the worker UI (reads worker_lang) were on different keys —
// picking a language did nothing.
const STORAGE_KEY     = 'sw_lang'
const LEGACY_KEY      = 'worker_lang'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}

const Ctx = createContext<LangCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => translations.en[k] ?? k,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang,       setLangState] = useState<Lang>('en')
  const [langReady,  setLangReady] = useState(false)
  const [langPicked, setLangPicked] = useState(true)

  useEffect(() => {
    let stored = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (!stored || !translations[stored]) {
      // One-time migration: pick up a language that was previously stored
      // under the legacy worker_lang key so existing users don't get reset.
      const legacy = localStorage.getItem(LEGACY_KEY) as Lang | null
      if (legacy && translations[legacy]) {
        stored = legacy
        localStorage.setItem(STORAGE_KEY, legacy)
        localStorage.removeItem(LEGACY_KEY)
      }
    }
    if (stored && translations[stored]) {
      setLangState(stored)
      setLangPicked(true)
    } else {
      setLangPicked(false)
    }
    setLangReady(true)
  }, [])

  // React to live language changes: when the user picks Hindi at /language
  // and navigates back to /worker/*, the storage event fires in this tab if
  // it happened in another tab; for same-tab navigation we also listen on
  // visibilitychange to re-read the value on return.
  useEffect(() => {
    function syncFromStorage() {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (stored && translations[stored] && stored !== lang) {
        setLangState(stored)
      }
    }
    window.addEventListener('storage', syncFromStorage)
    document.addEventListener('visibilitychange', syncFromStorage)
    return () => {
      window.removeEventListener('storage', syncFromStorage)
      document.removeEventListener('visibilitychange', syncFromStorage)
    }
  }, [lang])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
    setLangPicked(true)
  }

  function t(key: TKey): string {
    return (translations[lang] as Record<TKey, string>)[key] ?? translations.en[key] ?? key
  }

  return (
    <Ctx.Provider value={{ lang, setLang, t }}>
      {langReady && !langPicked && <LanguageSelectOverlay onSelect={setLang} />}
      {children}
    </Ctx.Provider>
  )
}

export function useLanguage() {
  return useContext(Ctx)
}

function LanguageSelectOverlay({ onSelect }: { onSelect: (l: Lang) => void }) {
  const [selected, setSelected] = useState<Lang | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111111',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '24px 20px',
      paddingTop: 'calc(24px + env(safe-area-inset-top))',
      paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      overflowY: 'auto',
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .wlang-btn { transition: all 0.15s; }
        .wlang-btn:hover { background: rgba(255,255,255,0.12) !important; }
        .wlang-btn:active { transform: scale(0.96); }
      `}</style>

      <div style={{ animation: 'fadeUp 0.5s ease forwards' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 22,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18,
          boxShadow: '0 0 40px rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: 46, fontWeight: 900, color: '#111111', lineHeight: 1, letterSpacing: -2, fontFamily: '"DM Sans", sans-serif' }}>S</span>
        </div>
      </div>

      <div style={{ animation: 'fadeUp 0.5s ease 0.08s both', textAlign: 'center', marginBottom: 32 }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', margin: '0 0 6px', letterSpacing: -0.5 }}>Switch</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Choose your language / भाषा चुनें</p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 10, width: '100%', maxWidth: 360,
        animation: 'fadeUp 0.5s ease 0.16s both',
        marginBottom: 20,
      }}>
        {LANGUAGES.map(({ code, name, native }) => {
          const isSelected = selected === code
          return (
            <button
              key={code}
              className="wlang-btn"
              onClick={() => setSelected(code)}
              style={{
                padding: '14px 12px',
                borderRadius: 14,
                border: `1.5px solid ${isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.12)'}`,
                background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: '0 0 2px' }}>{native}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{name}</p>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => selected && onSelect(selected)}
        disabled={!selected}
        style={{
          width: '100%', maxWidth: 360, height: 54, borderRadius: 16,
          border: 'none',
          background: selected ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
          color: selected ? '#111111' : 'rgba(255,255,255,0.3)',
          fontSize: 16, fontWeight: 800,
          cursor: selected ? 'pointer' : 'default',
          transition: 'all 0.2s',
          animation: 'fadeUp 0.5s ease 0.24s both',
        }}
      >
        {selected ? `Continue in ${LANGUAGES.find(l => l.code === selected)?.native}` : 'Select a language'}
      </button>
    </div>
  )
}

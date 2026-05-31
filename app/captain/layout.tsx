import type { Metadata, Viewport } from 'next'
import { LanguageProvider } from './LanguageContext'
import PWAGate from '@/components/shared/PWAGate'

export const metadata: Metadata = {
  title: 'Switch Captain',
  description: 'Field executive portal — onboard workers & employers, earn commissions.',
  manifest: '/captain-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Switch Captain',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function CaptainLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="captain-theme">
        <PWAGate
          appName="Switch Captain"
          tagline="Onboard workers & employers. Earn commissions."
          swPath="/captain-sw.js"
          swScope="/captain/"
          dismissalKey="captain_pwa_dismissed"
          features={['💸 Daily commissions', '📋 Track referrals', '🏆 Leaderboard']}
        >
          {children}
        </PWAGate>
      </div>
    </LanguageProvider>
  )
}

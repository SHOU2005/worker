import type { Metadata, Viewport } from 'next'
import { LanguageProvider } from './LanguageContext'
import PWAGate from '@/components/shared/PWAGate'
import WorkerLocationTracker from '@/components/worker/WorkerLocationTracker'
import AadhaarGate from '@/components/worker/AadhaarGate'
import UrgentJobAlert from '@/components/worker/UrgentJobAlert'
import Toaster from '@/components/shared/Toaster'
import LocationBootstrap from '@/components/shared/LocationBootstrap'

export const metadata: Metadata = {
  title: 'Switch Players',
  description: 'Find verified part-time shifts near you. Earn daily.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Switch Players',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="worker-theme">
        <PWAGate
          appName="Switch Players"
          tagline="Find verified shifts near you. Earn daily."
          swPath="/worker-sw.js"
          swScope="/"
          dismissalKey="worker_pwa_dismissed"
          features={['⚡ Instant pay', '📍 Jobs nearby', '🔔 Job alerts']}
        >
          {children}
          <AadhaarGate />
          <LocationBootstrap />
          <WorkerLocationTracker />
          {/* UrgentJobAlert is mounted on every worker page — it both
              registers the FCM token AND renders the foreground alert
              when a real-time push comes in. Don't add WorkerPWA here
              too or the urgent overlay double-renders. */}
          <UrgentJobAlert />
        </PWAGate>
        <Toaster />
      </div>
    </LanguageProvider>
  )
}

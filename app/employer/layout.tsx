import type { Metadata, Viewport } from 'next'
import PWAGate from '@/components/shared/PWAGate'
import Toaster from '@/components/shared/Toaster'
import LocationBootstrap from '@/components/shared/LocationBootstrap'

export const metadata: Metadata = {
  title: 'Switch',
  description: 'Post jobs and hire verified part-time workers.',
  manifest: '/employer-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Switch',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"DM Sans", -apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 16,
      lineHeight: '24px',
      letterSpacing: 'normal',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility',
      background: '#000000',
      minHeight: '100vh',
      color: '#FFFFFF',
    } as React.CSSProperties}>
      <PWAGate
        appName="Switch"
        tagline="Hire verified workers in minutes."
        swPath="/employer-sw.js"
        swScope="/employer/"
        dismissalKey="employer_pwa_dismissed"
        features={['⚡ Instant hire', '🔒 Verified workers', '🔔 Live job updates']}
      >
        {children}
        <LocationBootstrap />
      </PWAGate>
      <Toaster />
    </div>
  )
}

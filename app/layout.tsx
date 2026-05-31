import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { LangProvider } from '@/lib/lang'
import PushToast from '@/components/shared/PushToast'
import PermissionGate from '@/components/shared/PermissionGate'
import PostHogProvider from '@/components/shared/PostHogProvider'

export const metadata: Metadata = {
  title:       'Switch Players',
  description: 'Find verified part-time shifts near you. Earn daily.',
  manifest:    '/manifest.json',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-512.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Switch Players' },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  userScalable: false, themeColor: '#111827', viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className="antialiased">
        <LangProvider>
          <PostHogProvider />
          <PermissionGate />
          {children}
          <PushToast />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1F2937', color: '#F9FAFB',
                borderRadius: 14, padding: '12px 16px',
                fontSize: 14, fontWeight: 500,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
              },
              success: { iconTheme: { primary: '#3B82F6', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
        </LangProvider>
      </body>
    </html>
  )
}

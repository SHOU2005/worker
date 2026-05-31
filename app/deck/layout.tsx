import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Switch — Pre-Seed',
  description: 'Verified labour. Paid in 60 seconds.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Switch — Pre-Seed',
    description: 'Verified labour. Paid in 60 seconds.',
    url: 'https://app.switchlocally.com/deck',
    siteName: 'Switch',
    type: 'website',
  },
}

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

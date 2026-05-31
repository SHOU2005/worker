'use client'
import RouteError from '@/components/shared/RouteError'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <RouteError error={error} reset={reset} theme="light" />
      </body>
    </html>
  )
}

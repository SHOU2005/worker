'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getPostHog, identify, pageview } from '@/lib/posthog'

function PageviewTracker() {
  const pathname = usePathname()
  const params   = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const url = pathname + (params?.toString() ? `?${params.toString()}` : '')
    pageview(url)
  }, [pathname, params])

  return null
}

function IdentifyTracker() {
  const identified = useRef(false)
  useEffect(() => {
    let cancelled = false
    getPostHog().then(ph => {
      if (!ph || cancelled || identified.current) return
      // Identify the logged-in user once on mount; reset on logout
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled) return
          if (d?.user?.id) {
            identify(d.user.id, {
              role:  d.user.role,
              phone: d.user.phone,
              name:  d.user.name,
            })
            identified.current = true
          } else {
            identify(null) // reset anonymous if previously identified
          }
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
  }, [])
  return null
}

/**
 * Mount inside the root layout. Initializes PostHog (lazily — no-op without env keys),
 * captures pageviews on route change, and identifies the logged-in user.
 * Wrapped in Suspense because useSearchParams is suspense-bound in app router.
 */
export default function PostHogProvider() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
      <IdentifyTracker />
    </Suspense>
  )
}

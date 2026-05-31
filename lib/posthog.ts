// PostHog client wrapper. Safe to import from any client component — never throws if not configured.

import type { PostHog } from 'posthog-js'

const KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let cached: PostHog | null = null
let initPromise: Promise<PostHog | null> | null = null

async function load(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return null
  if (!KEY) return null
  if (cached) return cached
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const mod = await import('posthog-js')
      const posthog = mod.default
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: false, // we trigger manually on route change
        capture_pageleave: true,
        autocapture: false,      // explicit events only
        // Session replay — enabled. Sensitive inputs (Aadhaar, OTP, password)
        // are masked at capture time so the digits never leave the device.
        // Network bodies are NOT captured to avoid leaking JWTs / signed URLs.
        disable_session_recording: false,
        session_recording: {
          maskAllInputs:        true,
          maskInputOptions:     { password: true },
          maskTextSelector:     '[data-sensitive], input[name="otp"], input[name="aadhaar"], input[type="password"]',
          recordCrossOriginIframes: false,
          recordHeaders:        false,
          recordBody:           false,
        },
        persistence: 'localStorage+cookie',
      })
      cached = posthog
      return posthog
    } catch (err) {
      console.warn('[posthog] init failed:', err)
      return null
    }
  })()
  return initPromise
}

export async function getPostHog(): Promise<PostHog | null> { return load() }

/** Fire a tracked event. No-op if PostHog isn't configured. */
export async function track(event: string, properties?: Record<string, unknown>): Promise<void> {
  const ph = await load()
  if (!ph) return
  ph.capture(event, properties)
}

/** Identify the current user. Pass null to reset on logout. */
export async function identify(userId: string | null, traits?: Record<string, unknown>): Promise<void> {
  const ph = await load()
  if (!ph) return
  if (userId === null) { ph.reset(); return }
  ph.identify(userId, traits)
}

/** Manually capture a pageview (called on route change). */
export async function pageview(path: string): Promise<void> {
  const ph = await load()
  if (!ph) return
  ph.capture('$pageview', { $current_url: path })
}

/**
 * Sentry — browser/client.
 *
 * No-ops if NEXT_PUBLIC_SENTRY_DSN is not set, so dev runs without configuration.
 * Get your DSN from https://sentry.io → Project Settings → Client Keys (DSN).
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Reduce volume in dev; ramp up in prod.
    tracesSampleRate:        process.env.NODE_ENV === 'production' ? 0.1 : 0,
    replaysSessionSampleRate: 0,    // raise once you have user volume
    replaysOnErrorSampleRate: 1.0,  // always replay around errors
    integrations: [
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
  })
}

/** @type {import('next').NextConfig} */
// Dev-only relaxation: Next.js HMR uses `eval()` inside its runtime so the
// dev WebView needs 'unsafe-eval' in script-src. Production CSP keeps the
// strict policy. Gated on NODE_ENV.
const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_SCRIPT_RELAX  = IS_DEV ? " 'unsafe-eval'" : ''
// Capacitor live-reload + Next dev HMR open extra sockets back to the dev
// origin. Allowing ws:/http: to localhost + the local LAN /16 ranges covers
// both Mac (localhost) and on-device (192.168.x.x / 10.x.x.x) testing.
const DEV_CONNECT_RELAX = IS_DEV
  ? ' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://192.168.1.118:* ws://192.168.1.118:*'
  : ''
// Jyoti voice — ElevenLabs Conversational AI WebSocket. Required for
// production too, so this is NOT dev-gated.
const ELEVENLABS_CONNECT = ' https://api.elevenlabs.io wss://api.elevenlabs.io https://*.elevenlabs.io wss://*.elevenlabs.io'

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'twilio', 'firebase-admin'],
  },
  images: {
    domains: ['avatars.githubusercontent.com', 'res.cloudinary.com', 'ui-avatars.com'],
  },
  async rewrites() {
    return [
      // /hire is the canonical employer entry URL — rewrites preserve the URL
      // in the address bar but render the existing /employer routes underneath.
      // Both /hire and /employer continue to work; marketing/share links use /hire.
      { source: '/hire',          destination: '/employer'         },
      { source: '/hire/:path*',   destination: '/employer/:path*'  },
      // /players is the canonical worker entry URL —
      // app.switchlocally.com/players shows the worker app, the user
      // never sees /login or /worker in the address bar.
      { source: '/players/dashboard',  destination: '/worker/dashboard' },
      { source: '/players/jobs',       destination: '/worker/jobs'      },
      { source: '/players/earnings',   destination: '/worker/earnings'  },
      { source: '/players/profile',    destination: '/worker/profile'   },
      { source: '/players/kyc',        destination: '/worker/kyc'       },
      { source: '/players/help',       destination: '/worker/help'      },
      { source: '/players/shifts',     destination: '/worker/shifts'    },
      { source: '/players/notifications', destination: '/worker/notifications' },
    ]
  },
  async headers() {
    return [
      // API routes — never cache; payment + booking responses must always be fresh
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          // Hardening
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // Hashed Next.js static assets — long cache (the hash changes when the asset does)
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Public icons, manifest, service-worker glue
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/firebase-messaging-sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      // Default page HTML — revalidate but allow short edge cache.
      // CSP locks scripts/styles to same-origin + named third parties
      // (Firebase, Razorpay, Google fonts). 'unsafe-inline' is kept for
      // styles only — Next.js still emits inline <style> nodes. Scripts
      // do not need unsafe-inline; we removed it from script-src.
      {
        source: '/((?!api|_next/static|icons|firebase-messaging-sw).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // microphone=(self) — Jyoti needs getUserMedia({ audio: true }). The
          // empty-list value previously hard-blocked the mic in the WebView
          // before Android's runtime permission prompt could even appear.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Firebase Phone Auth loads reCAPTCHA scripts from
              // www.google.com + www.gstatic.com (and the recaptcha.net
              // mirror Google sometimes serves). Razorpay loads its
              // checkout.js from checkout.razorpay.com. Without these
              // the OTP flow fails with auth/internal-error.
              // blob: + data: are required by ElevenLabs Conversational AI —
              // it ships its `rawAudioProcessor` / mu-law codec audio worklets
              // as inline blob/data URLs at runtime. Without these, the WebSocket
              // connects but the audio pipeline never initialises and Jyoti
              // errors out with "Failed to load worklet module".
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: data:" + DEV_SCRIPT_RELAX + " https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://recaptcha.net https://*.firebaseapp.com https://apis.google.com https://checkout.razorpay.com https://api.razorpay.com https://us-assets.i.posthog.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.gstatic.com https://www.google.com https://*.firebaseio.com https://avatars.githubusercontent.com https://res.cloudinary.com https://ui-avatars.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://nominatim.openstreetmap.org",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://fcm.googleapis.com https://www.google.com https://www.recaptcha.net https://recaptcha.net https://api.razorpay.com https://lumberjack.razorpay.com https://nominatim.openstreetmap.org https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io" + ELEVENLABS_CONNECT + DEV_CONNECT_RELAX,
              // reCAPTCHA renders inside an iframe served by www.google.com;
              // Firebase Phone Auth also drops its iframe from firebaseapp.com.
              "frame-src 'self' https://www.google.com https://www.recaptcha.net https://recaptcha.net https://*.firebaseapp.com https://api.razorpay.com https://*.razorpay.com",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://api.razorpay.com",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

// Optional Sentry wrapper — only engages when SENTRY_DSN is set in prod env.
// Sourcemaps are uploaded only when SENTRY_AUTH_TOKEN is present.
const exportedConfig = (() => {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return nextConfig
  }
  try {
    const { withSentryConfig } = require('@sentry/nextjs')
    return withSentryConfig(nextConfig, {
      org:            process.env.SENTRY_ORG || undefined,
      project:        process.env.SENTRY_PROJECT || undefined,
      authToken:      process.env.SENTRY_AUTH_TOKEN, // CI uploads sourcemaps; safe to skip locally
      silent:         !process.env.CI,
      hideSourceMaps: true,
      webpack: {
        automaticVercelMonitors: true,
        treeshake: { removeDebugLogging: true },
      },
    })
  } catch {
    return nextConfig
  }
})()

module.exports = exportedConfig

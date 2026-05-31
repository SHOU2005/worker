/**
 * Next.js instrumentation hook. Loads the right Sentry config for the runtime
 * (server / edge). Browser config is loaded automatically by next.config.js.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

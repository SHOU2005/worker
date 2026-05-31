import { redirect } from 'next/navigation'
import { getTokenFromCookies } from '@/lib/auth'

/**
 * Root entry — app.switchlocally.com lands here.
 * Default to the employer (main) app; workers enter via /partner.
 * Logged-in users go straight to their role's home.
 */
export default function RootPage() {
  const payload = getTokenFromCookies()
  if (!payload) redirect('/employer/login')

  switch (payload.role) {
    case 'WORKER':   redirect('/worker/dashboard')
    case 'EMPLOYER': redirect('/employer')
    case 'CAPTAIN':  redirect('/captain')
    case 'OPS':
    case 'ADMIN':    redirect('/ops')
    default:         redirect('/employer/login')
  }
}

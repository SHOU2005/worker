import { redirect } from 'next/navigation'
import { getTokenFromCookies } from '@/lib/auth'

/**
 * Worker entry point — app.switchlocally.com/players.
 * Marketing / PWA install links point here.
 *   - logged-out → /login (worker login)
 *   - logged-in worker → /worker/dashboard
 *   - logged-in non-worker → their own home
 */
export default function PlayersPage() {
  const payload = getTokenFromCookies()
  if (!payload) redirect('/login')

  switch (payload.role) {
    case 'WORKER':   redirect('/worker/dashboard')
    case 'EMPLOYER': redirect('/employer')
    case 'CAPTAIN':  redirect('/captain')
    case 'OPS':
    case 'ADMIN':    redirect('/ops')
    default:         redirect('/login')
  }
}

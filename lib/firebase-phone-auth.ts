'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth'

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCk1e3yCrlsn0V6qDa43OwTeLaYuNKX2sE',
  authDomain:        'hearus-4f2fe.firebaseapp.com',
  projectId:         'hearus-4f2fe',
  storageBucket:     'hearus-4f2fe.appspot.com',
  messagingSenderId: '616412616901',
  appId:             '1:616412616901:web:5f83157adc3e01fd1478ac',
}

const CONTAINER_ID = 'sw-rc-root'
const COOLDOWN_MS  = 60_000

let _auth: ReturnType<typeof getAuth> | null = null
let _verifier: RecaptchaVerifier | null = null
let _lastSentAt = 0

export function getOtpCooldown(): number {
  const remaining = COOLDOWN_MS - (Date.now() - _lastSentAt)
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

function getAuth_() {
  if (_auth) return _auth
  const app = getApps().find(a => a.name === 'switchnow') ?? initializeApp(FIREBASE_CONFIG, 'switchnow')
  _auth = getAuth(app)
  return _auth
}

function getContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = CONTAINER_ID
    el.style.cssText = 'position:fixed;bottom:0;right:0;z-index:-1;opacity:0;pointer-events:none;width:1px;height:1px'
    document.body.appendChild(el)
  }
  return el
}

function resetVerifier() {
  if (_verifier) {
    try { _verifier.clear() } catch {}
    _verifier = null
  }
  // Clear inner html so reCAPTCHA can re-render fresh
  const el = document.getElementById(CONTAINER_ID)
  if (el) el.innerHTML = ''
}

function buildVerifier(): RecaptchaVerifier {
  const auth = getAuth_()
  getContainer() // ensure container exists in DOM
  return new RecaptchaVerifier(auth, CONTAINER_ID, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': resetVerifier,
  })
}

const ERROR_MAP: Record<string, string> = {
  'auth/invalid-phone-number':      'Invalid phone number.',
  'auth/too-many-requests':         'Too many attempts. Please wait a few minutes and try again.',
  'auth/captcha-check-failed':      'Verification check failed. Tap Send OTP again.',
  'auth/invalid-recaptcha-token':   'Verification check failed. Tap Send OTP again.',
  'auth/missing-recaptcha-token':   'Verification check failed. Tap Send OTP again.',
  'auth/invalid-app-credential':    'Verification check failed. Tap Send OTP again.',
  'auth/quota-exceeded':            'SMS quota exceeded. Try again later.',
  'auth/billing-not-enabled':       'Firebase billing not enabled.',
  'auth/user-disabled':             'This number has been disabled.',
  'auth/invalid-verification-code': 'Wrong OTP. Please check and try again.',
  'auth/code-expired':              'OTP expired. Please request a new one.',
  'auth/session-expired':           'Session expired. Please request a new OTP.',
  'auth/missing-verification-code': 'Please enter the 6-digit OTP.',
}

// Errors that mean the reCAPTCHA token is unusable — a single retry with
// a fresh verifier almost always works because the previous token was
// already consumed or expired by the time the user tapped Send OTP.
const RECAPTCHA_RETRY_CODES = new Set([
  'auth/invalid-recaptcha-token',
  'auth/missing-recaptcha-token',
  'auth/captcha-check-failed',
  'auth/invalid-app-credential',
])

export async function sendPhoneCode(phoneDigits: string): Promise<void> {
  const cooldown = getOtpCooldown()
  if (cooldown > 0) throw new Error(`Please wait ${cooldown}s before requesting another OTP.`)

  resetVerifier()
  _verifier = buildVerifier()
  try {
    const result = await signInWithPhoneNumber(getAuth_(), `+91${phoneDigits}`, _verifier)
    ;(window as any).__fbConfirm = result
    _lastSentAt = Date.now()
  } catch (err: any) {
    resetVerifier()
    // Recapture once on transient reCAPTCHA errors — the first verifier
    // sometimes posts a stale token from a previous page session that
    // Google's edge has already retired. A clean re-init fixes it
    // without surfacing the scary "Firebase error" to the user.
    if (RECAPTCHA_RETRY_CODES.has(err?.code)) {
      try {
        _verifier = buildVerifier()
        const retry = await signInWithPhoneNumber(getAuth_(), `+91${phoneDigits}`, _verifier)
        ;(window as any).__fbConfirm = retry
        _lastSentAt = Date.now()
        return
      } catch (e: any) {
        resetVerifier()
        throw new Error(ERROR_MAP[e?.code] ?? 'Verification check failed. Reload the page and try again.')
      }
    }
    throw new Error(ERROR_MAP[err?.code] ?? err?.message ?? 'Failed to send OTP. Please try again.')
  }
}

export async function confirmPhoneCode(code: string): Promise<{ idToken: string; phone: string }> {
  const result = (window as any).__fbConfirm
  if (!result) throw new Error('Session expired. Please request a new OTP.')
  try {
    const cred    = await result.confirm(code)
    const idToken = await cred.user.getIdToken()
    const phone   = (cred.user.phoneNumber ?? '').replace(/^\+91/, '')
    ;(window as any).__fbConfirm = null
    resetVerifier()
    return { idToken, phone }
  } catch (err: any) {
    throw new Error(ERROR_MAP[err?.code] ?? err?.message ?? 'OTP verification failed.')
  }
}

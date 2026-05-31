const WA_PHONE_ID = process.env.SWITCH_PHONE_NUMBER_ID || '937143829489912'
const WA_TOKEN    = process.env.META_SYS_USER_TOKEN    || ''

function url() {
  return `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`
}

function authHeaders() {
  return {
    Authorization: `Bearer ${WA_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// Send a plain-text WhatsApp message. Works only within a 24-hour customer-service
// window (the recipient must have messaged the business number recently OR have
// opted in via a registered template). For our ops alerts, founders have messaged
// the number for OTP testing, so the 24h window is effectively always open.
export async function sendWhatsAppText(toDigits10: string, body: string): Promise<boolean> {
  if (!WA_TOKEN) {
    console.warn('[WA] META_SYS_USER_TOKEN not set, skipping send')
    return false
  }
  const payload = {
    messaging_product: 'whatsapp',
    to:                `91${toDigits10}`,
    type:              'text',
    text:              { body },
  }
  try {
    const r = await fetch(url(), { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
    if (r.status !== 200) {
      console.warn(`[WA] text send to ${toDigits10}: ${r.status} ${await r.text()}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[WA] send error:', err)
    return false
  }
}

// Fire WhatsApp text to multiple recipients in parallel. Never throws —
// returns the count of successful sends so callers can log it.
export async function broadcastWhatsAppText(toDigits10List: string[], body: string): Promise<number> {
  const results = await Promise.all(toDigits10List.map(d => sendWhatsAppText(d, body)))
  return results.filter(Boolean).length
}

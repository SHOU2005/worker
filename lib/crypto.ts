import crypto from 'crypto'

/**
 * AES-256-GCM encryption for sensitive fields (Aadhaar number, etc).
 *
 * Key source: PII_ENC_KEY env var, base64-encoded 32 bytes.
 *   Generate one with: openssl rand -base64 32
 *
 * Output format: base64(iv || ciphertext || authTag)  — single column, easy to store.
 */

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.PII_ENC_KEY
  if (!raw) {
    throw new Error(
      'PII_ENC_KEY is not set. Generate with: openssl rand -base64 32. ' +
      'Required for storing PII (Aadhaar) per DPDP Act.'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(`PII_ENC_KEY must decode to 32 bytes (got ${key.length}). Use: openssl rand -base64 32`)
  }
  cachedKey = key
  return key
}

const IV_LEN = 12 // GCM standard
const TAG_LEN = 16

export function encryptPII(plaintext: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, enc, tag]).toString('base64')
}

export function decryptPII(b64: string): string {
  const key = getKey()
  const buf = Buffer.from(b64, 'base64')
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('Ciphertext too short')
  const iv  = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc).toString('utf8') + decipher.final('utf8')
}

/**
 * Returns "XXXX-XXXX-1234" given a 12-digit Aadhaar (or any string ending in 4 digits).
 * Always safe to log / display.
 */
export function maskAadhaar(plain: string): string {
  const digits = plain.replace(/\D/g, '')
  if (digits.length < 4) return 'XXXX-XXXX-XXXX'
  return `XXXX-XXXX-${digits.slice(-4)}`
}

/**
 * Helper: from a 12-digit Aadhaar, return the encrypted blob + last4 to store.
 */
export function prepareAadhaarForStorage(plain: string): { aadhaarNumber: string; aadhaarLast4: string } {
  const digits = plain.replace(/\D/g, '')
  if (!/^\d{12}$/.test(digits)) throw new Error('Aadhaar must be exactly 12 digits')
  return {
    aadhaarNumber: encryptPII(digits),
    aadhaarLast4:  digits.slice(-4),
  }
}

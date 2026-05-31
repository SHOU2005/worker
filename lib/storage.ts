import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Supabase Storage wrapper. Two buckets:
 *
 *  - `public-avatars`  : worker selfies, captain photos, employer logos
 *                        public-readable; URL embedded in user payloads.
 *
 *  - `private-kyc`     : Aadhaar front + back, any future ID docs.
 *                        Not publicly accessible. Reads go through a signed-URL
 *                        endpoint that records an audit log entry.
 *
 * Required env vars (server-side):
 *   SUPABASE_URL                 (the project URL — usually same host as DATABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    (service_role key from Supabase dashboard → Settings → API)
 *
 * Optional bucket-name overrides (use these if you created buckets with
 * different names instead of renaming):
 *   SUPABASE_BUCKET_PUBLIC       (defaults to "public-avatars")
 *   SUPABASE_BUCKET_PRIVATE      (defaults to "private-kyc")
 *
 * The buckets must exist. Create them once in the dashboard:
 *   - public-avatars : Public bucket
 *   - private-kyc    : Private bucket
 */

const PUBLIC_BUCKET  = process.env.SUPABASE_BUCKET_PUBLIC  || 'public-avatars'
const PRIVATE_BUCKET = process.env.SUPABASE_BUCKET_PRIVATE || 'private-kyc'

let cached: SupabaseClient | null = null
function client(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn('[storage] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — uploads will fail')
    return null
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}

export function isStorageConfigured(): boolean {
  return !!client()
}

/** Throws a clean error if Supabase Storage is not configured. */
export function assertStorageReady(): void {
  if (!client()) {
    throw new Error('STORAGE_NOT_CONFIGURED: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env, and create the public-avatars and private-kyc buckets in Supabase Storage.')
  }
}

interface DataUrlParts { mime: string; ext: string; bytes: Buffer }
function parseDataUrl(s: string): DataUrlParts | null {
  if (!s.startsWith('data:')) return null
  // Accept optional charset / extra params (some Android WebViews insert them).
  // e.g. data:image/jpeg;charset=utf-8;base64,...
  const m = /^data:(image\/[a-z+0-9.-]+)(?:;[^;,]+)*;base64,(.*)$/i.exec(s)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const ext  = mime === 'image/jpeg' ? 'jpg'
              : mime === 'image/jpg'  ? 'jpg'
              : mime.split('/')[1].replace('+', '_')
  let bytes: Buffer
  try {
    bytes = Buffer.from(m[2], 'base64')
  } catch {
    return null
  }
  if (bytes.length === 0) return null
  return { mime, ext, bytes }
}

function pathFor(prefix: string, ext: string) {
  const id = crypto.randomBytes(16).toString('hex')
  return `${prefix}/${id}.${ext}`
}

// Result type lets the caller surface the real Supabase error to the user
// instead of swallowing it as a generic "upload failed".
export interface UploadResult {
  url:  string | null
  path: string | null
  error?: string
  code?:  'NOT_CONFIGURED' | 'INVALID_INPUT' | 'BUCKET_MISSING' | 'UPLOAD_FAILED'
}

/**
 * Upload base64-encoded image (or pass-through https URL) to public bucket.
 * If `dataUrlOrUrl` is already an http(s) URL, returns it unchanged.
 * Returns { url, error?, code? } — caller MUST check `error` and bubble it up.
 */
export async function uploadPublicImage(
  dataUrlOrUrl: string,
  prefix: 'workers' | 'captains' | 'employers',
): Promise<UploadResult> {
  if (!dataUrlOrUrl) {
    return { url: null, path: null, error: 'No image data', code: 'INVALID_INPUT' }
  }
  if (dataUrlOrUrl.startsWith('http://') || dataUrlOrUrl.startsWith('https://')) {
    return { url: dataUrlOrUrl, path: null }
  }
  const parts = parseDataUrl(dataUrlOrUrl)
  if (!parts) {
    return { url: null, path: null, error: 'Image is not a valid base64 data URL', code: 'INVALID_INPUT' }
  }
  const sb = client()
  if (!sb) {
    return { url: null, path: null, error: 'Storage not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)', code: 'NOT_CONFIGURED' }
  }

  const path = pathFor(prefix, parts.ext)
  // upsert:true so a (very rare) path collision doesn't surface as a confusing error.
  const { error } = await sb.storage.from(PUBLIC_BUCKET).upload(path, parts.bytes, {
    contentType: parts.mime,
    upsert: true,
  })
  if (error) {
    const msg = error.message || 'Supabase upload error'
    console.error(`[storage] public upload failed (bucket=${PUBLIC_BUCKET}, path=${path}, mime=${parts.mime}, bytes=${parts.bytes.length}):`, msg)
    const lower = msg.toLowerCase()
    let code: UploadResult['code'] = 'UPLOAD_FAILED'
    let userMsg: string
    if (lower.includes('not found') || lower.includes('does not exist') || lower.includes('bucket not found')) {
      code = 'BUCKET_MISSING'
      userMsg = `Bucket "${PUBLIC_BUCKET}" not found in Supabase. Create it (Storage → New bucket → Public) or set SUPABASE_BUCKET_PUBLIC env var.`
    } else if (lower.includes('mime') || lower.includes('content type')) {
      userMsg = `Supabase rejected the file type "${parts.mime}". Add it to the bucket's Allowed MIME Types in the Supabase dashboard.`
    } else if (lower.includes('size') || lower.includes('payload too large') || lower.includes('limit')) {
      userMsg = `Image is too large for the "${PUBLIC_BUCKET}" bucket (${(parts.bytes.length / 1024).toFixed(0)}KB). Raise the bucket file size limit or compress the image more.`
    } else if (lower.includes('jwt') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
      userMsg = `Supabase rejected the API key. Make sure SUPABASE_SERVICE_ROLE_KEY is the service_role key (NOT the anon key) and matches the SUPABASE_URL project.`
    } else {
      userMsg = `Supabase rejected the upload to "${PUBLIC_BUCKET}": ${msg}`
    }
    return { url: null, path: null, error: userMsg, code }
  }
  const { data } = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/**
 * Upload base64 to PRIVATE bucket (Aadhaar etc). Returns the storage path
 * (NOT a public URL). Read this back via signedUrlForPrivate() with audit logging.
 */
export async function uploadPrivateImage(
  dataUrlOrPath: string,
  prefix: 'aadhaar' | 'docs',
): Promise<UploadResult> {
  if (!dataUrlOrPath) {
    return { url: null, path: null, error: 'No image data', code: 'INVALID_INPUT' }
  }
  // Already a storage path — pass through
  if (dataUrlOrPath.startsWith('aadhaar/') || dataUrlOrPath.startsWith('docs/')) {
    return { url: null, path: dataUrlOrPath }
  }
  const parts = parseDataUrl(dataUrlOrPath)
  if (!parts) {
    return { url: null, path: null, error: 'Image is not a valid base64 data URL', code: 'INVALID_INPUT' }
  }
  const sb = client()
  if (!sb) {
    return { url: null, path: null, error: 'Storage not configured', code: 'NOT_CONFIGURED' }
  }

  const path = pathFor(prefix, parts.ext)
  const { error } = await sb.storage.from(PRIVATE_BUCKET).upload(path, parts.bytes, {
    contentType: parts.mime,
    upsert: true,
  })
  if (error) {
    const msg = error.message || 'Supabase upload error'
    console.error(`[storage] private upload failed (bucket=${PRIVATE_BUCKET}, path=${path}, mime=${parts.mime}, bytes=${parts.bytes.length}):`, msg)
    const lower = msg.toLowerCase()
    let code: UploadResult['code'] = 'UPLOAD_FAILED'
    let userMsg: string
    if (lower.includes('not found') || lower.includes('does not exist') || lower.includes('bucket not found')) {
      code = 'BUCKET_MISSING'
      userMsg = `Bucket "${PRIVATE_BUCKET}" not found in Supabase. Create it (Storage → New bucket → Private) or set SUPABASE_BUCKET_PRIVATE env var.`
    } else if (lower.includes('mime') || lower.includes('content type')) {
      userMsg = `Supabase rejected the file type "${parts.mime}". Add it to the "${PRIVATE_BUCKET}" bucket's Allowed MIME Types.`
    } else if (lower.includes('size') || lower.includes('payload too large') || lower.includes('limit')) {
      userMsg = `Image is too large for "${PRIVATE_BUCKET}" (${(parts.bytes.length / 1024).toFixed(0)}KB). Raise the bucket file size limit.`
    } else if (lower.includes('jwt') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
      userMsg = `Supabase rejected the API key. Use the service_role key, not the anon key.`
    } else {
      userMsg = `Supabase rejected the upload to "${PRIVATE_BUCKET}": ${msg}`
    }
    return { url: null, path: null, error: userMsg, code }
  }
  return { url: null, path }
}

/**
 * Mint a short-lived signed URL for a private object. Caller MUST audit-log
 * who is accessing what.
 */
export async function signedUrlForPrivate(path: string, ttlSeconds = 60): Promise<string | null> {
  const sb = client()
  if (!sb) return null
  // Robustness: if the value is still a base64 data URL (legacy row, never migrated),
  // return it as-is so the UI keeps working until the user re-uploads.
  if (path.startsWith('data:')) return path
  const { data, error } = await sb.storage.from(PRIVATE_BUCKET).createSignedUrl(path, ttlSeconds)
  if (error) {
    console.error('[storage] sign failed:', error.message)
    return null
  }
  return data.signedUrl
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSession } from '@/lib/session'

// ADMIN-only diagnostic. Was open to any logged-in user — leaks
// SUPABASE_SERVICE_ROLE_KEY length (which lets an attacker confirm the key
// type / version), bucket internals, and round-trip upload behaviour. Now
// gated to admins; ops/employer/worker sessions get 403.
export async function GET() {
  const sess = await requireSession(['ADMIN'])
  if (sess instanceof NextResponse) return sess

  const url    = process.env.SUPABASE_URL
  const key    = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pubBkt = process.env.SUPABASE_BUCKET_PUBLIC  || 'public-avatars'
  const prvBkt = process.env.SUPABASE_BUCKET_PRIVATE || 'private-kyc'

  const out: Record<string, unknown> = {
    role: sess.user.role,
    env: {
      SUPABASE_URL_set:               !!url,
      SUPABASE_URL_preview:           url ? `${url.slice(0, 30)}…` : null,
      SUPABASE_SERVICE_ROLE_KEY_set:  !!key,
      SUPABASE_SERVICE_ROLE_KEY_len:  key?.length ?? 0,
      // Service role JWT starts with "eyJ" and is ~250+ chars; anon key is ~150-200.
      // If the length is 100-200, you almost certainly used the anon key by mistake.
      looksLikeServiceRole:           !!key && key.length > 220 && key.startsWith('eyJ'),
      SUPABASE_BUCKET_PUBLIC:         pubBkt,
      SUPABASE_BUCKET_PRIVATE:        prvBkt,
    },
    buckets:   { public: null, private: null },
    testWrite: { public: null, private: null },
  }

  if (!url || !key) {
    out.diagnosis = 'Missing env vars. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, then redeploy.'
    return NextResponse.json(out, { status: 503 })
  }

  if (key.length < 220 || !key.startsWith('eyJ')) {
    out.diagnosis = 'SUPABASE_SERVICE_ROLE_KEY looks wrong. You probably pasted the anon key. Service-role keys start with "eyJ" and are ≥220 chars. Find it in Supabase dashboard → Settings → API → "Project API keys" → service_role.'
    return NextResponse.json(out, { status: 502 })
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: buckets, error: lstErr } = await sb.storage.listBuckets()
  if (lstErr) {
    out.diagnosis = `listBuckets() failed: ${lstErr.message}. Most likely the SUPABASE_SERVICE_ROLE_KEY is for a different project than SUPABASE_URL, or the key was rotated.`
    return NextResponse.json(out, { status: 502 })
  }

  const pubExists = buckets?.find(b => b.name === pubBkt)
  const prvExists = buckets?.find(b => b.name === prvBkt)
  out.buckets = {
    public:  pubExists  ? { name: pubExists.name,  public: pubExists.public  } : `MISSING: bucket "${pubBkt}" does not exist. Create it in Supabase → Storage → New bucket → Public, OR set SUPABASE_BUCKET_PUBLIC env var to the bucket you actually have.`,
    private: prvExists  ? { name: prvExists.name,  public: prvExists.public  } : `MISSING: bucket "${prvBkt}" does not exist. Create it in Supabase → Storage → New bucket → Private, OR set SUPABASE_BUCKET_PRIVATE env var.`,
    allBucketsInProject: buckets?.map(b => `${b.name}${b.public ? ' (public)' : ' (private)'}`) ?? [],
  }

  // Round-trip test: 1×1 JPEG, ~125 bytes
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z',
    'base64'
  )

  if (pubExists) {
    const path = `_diagnostic/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: upErr } = await sb.storage.from(pubBkt).upload(path, tinyJpeg, { contentType: 'image/jpeg', upsert: true })
    if (upErr) {
      out.testWrite = { ...(out.testWrite as object), public: { ok: false, error: upErr.message, path } }
      out.diagnosis = `Upload to "${pubBkt}" failed: ${upErr.message}. Check the bucket's allowed MIME types include image/jpeg, and that file-size limit is at least 1KB.`
    } else {
      // Get the public URL to verify the bucket is actually publicly accessible
      const { data } = sb.storage.from(pubBkt).getPublicUrl(path)
      await sb.storage.from(pubBkt).remove([path]).catch(() => {})
      out.testWrite = { ...(out.testWrite as object), public: { ok: true, sampleUrl: data.publicUrl } }
    }
  }
  if (prvExists) {
    const path = `_diagnostic/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: upErr } = await sb.storage.from(prvBkt).upload(path, tinyJpeg, { contentType: 'image/jpeg', upsert: true })
    if (upErr) {
      out.testWrite = { ...(out.testWrite as object), private: { ok: false, error: upErr.message, path } }
    } else {
      await sb.storage.from(prvBkt).remove([path]).catch(() => {})
      out.testWrite = { ...(out.testWrite as object), private: { ok: true } }
    }
  }

  if (!out.diagnosis) out.diagnosis = 'Storage looks healthy. If uploads are still failing, check the browser console for client-side errors.'
  return NextResponse.json(out)
}

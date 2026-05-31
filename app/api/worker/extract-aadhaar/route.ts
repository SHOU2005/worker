import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'

const CREDS_B64 = process.env.HEARUS_FIREBASE_CREDENTIALS_BASE64 || ''

async function getOAuthToken(): Promise<string> {
  const creds = JSON.parse(Buffer.from(CREDS_B64, 'base64').toString('utf-8'))
  const crypto = await import('crypto')
  const now = Math.floor(Date.now() / 1000)

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url')

  const signing  = `${header}.${payload}`
  const sign     = crypto.createSign('RSA-SHA256')
  sign.update(signing)
  const signature = sign.sign(creds.private_key, 'base64url')
  const jwt       = `${signing}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  if (!tokenRes.ok) throw new Error('Failed to get OAuth token')
  const data = await tokenRes.json()
  return data.access_token as string
}

async function extractTextFromImage(base64Image: string): Promise<string> {
  const token     = await getOAuthToken()
  const imageData = base64Image.replace(/^data:image\/[a-z+]+;base64,/, '')

  const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      requests: [{
        image:    { content: imageData },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      }],
    }),
  })
  if (!res.ok) throw new Error('Vision API call failed')
  const data = await res.json()
  return data.responses?.[0]?.fullTextAnnotation?.text || ''
}

function extractAadhaarNumber(text: string): string | null {
  // Aadhaar is 12 digits, often in groups of 4
  const matches = text.match(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/g)
  if (!matches) return null
  return matches[0].replace(/[\s-]/g, '')
}

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { image } = await req.json()
    if (!image) return NextResponse.json({ error: 'image required' }, { status: 400 })

    const text          = await extractTextFromImage(image)
    const aadhaarNumber = extractAadhaarNumber(text)

    return NextResponse.json({ success: true, aadhaarNumber, text })
  } catch (err) {
    console.error('OCR error:', err)
    return NextResponse.json({ error: 'OCR failed', aadhaarNumber: null }, { status: 500 })
  }
}

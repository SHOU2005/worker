import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SWITCH_WA_PHONE_ID = process.env.SWITCH_PHONE_NUMBER_ID || '937143829489912'
const SWITCH_WA_TOKEN    = process.env.META_SYS_USER_TOKEN    || ''
const RATE_LIMIT_SECONDS = 60

async function sendWhatsAppOtp(to: string, otp: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v21.0/${SWITCH_WA_PHONE_ID}/messages`
  const headers = {
    Authorization: `Bearer ${SWITCH_WA_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const templatePayload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: 'switch_otp',
      language: { code: 'en' },
      components: [
        { type: 'BODY', parameters: [{ type: 'text', text: otp }] },
        {
          type: 'BUTTON',
          sub_type: 'COPY_CODE',
          index: '0',
          parameters: [{ type: 'COUPON_CODE', coupon_code: otp }],
        },
      ],
    },
  }

  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(templatePayload) })
  console.log(`[WA_OTP] template send to ${to}: ${r.status}`)
  if (r.status === 200) return true

  const body = await r.text()
  // Template not registered — fall back to plain text (works within 24-hr window)
  if ((r.status === 400 || r.status === 404) && body.includes('132001')) {
    console.log('[WA_OTP] template not registered, falling back to text')
    const fallback = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `*${otp}* is your Switch OTP. Valid for 5 minutes. Do not share.` },
    }
    const r2 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(fallback) })
    console.log(`[WA_OTP] fallback text send to ${to}: ${r2.status}`)
    return r2.status === 200
  }

  return false
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }

    if (!SWITCH_WA_TOKEN) {
      return NextResponse.json({ error: 'WhatsApp OTP service not configured' }, { status: 500 })
    }

    // Rate limit: one OTP per RATE_LIMIT_SECONDS
    const recent = await prisma.otpLog.findFirst({
      where: {
        phone,
        createdAt: { gt: new Date(Date.now() - RATE_LIMIT_SECONDS * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recent) {
      const waitSecs = Math.ceil(
        (recent.createdAt.getTime() + RATE_LIMIT_SECONDS * 1000 - Date.now()) / 1000,
      )
      return NextResponse.json(
        { error: `Please wait ${waitSecs}s before requesting another OTP` },
        { status: 429 },
      )
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await prisma.otpLog.updateMany({
      where: { phone, verified: false },
      data: { verified: true },
    })
    await prisma.otpLog.create({ data: { phone, otp, expiresAt } })

    const waPhone = `91${phone}`
    const ok = await sendWhatsAppOtp(waPhone, otp)
    if (!ok) {
      return NextResponse.json({ error: 'Failed to send WhatsApp OTP. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-whatsapp-otp error:', err)
    return NextResponse.json({ error: 'Failed to send OTP. Try again.' }, { status: 500 })
  }
}

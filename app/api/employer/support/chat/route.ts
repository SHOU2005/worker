import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'
import { hit } from '@/lib/rate-limit'
import { chat, ChatMessage, AnthropicNotConfiguredError } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  const payload = getTokenFromCookies()
  if (!payload || payload.role !== 'EMPLOYER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = hit(`support:chat:${payload.userId}`, 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many messages. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = Array.isArray(body?.messages) ? body.messages : []
  // Cap conversation length to keep prompt cost predictable. The last
  // ~12 turns are more than enough for FAQ-style support.
  const messages: ChatMessage[] = raw
    .slice(-12)
    .filter((m: any) => typeof m?.text === 'string' && m.text.trim() && (m.role === 'user' || m.role === 'bot'))
    .map((m: any) => ({ role: m.role, text: String(m.text).slice(0, 2000) }))

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })
  }

  const language = typeof body?.language === 'string' && body.language.trim().length > 0
    ? body.language.trim().slice(0, 40)
    : undefined

  try {
    const result = await chat(messages, { language })
    return NextResponse.json(result)
  } catch (err: any) {
    if (err instanceof AnthropicNotConfiguredError) {
      console.error('[support/chat] ANTHROPIC_API_KEY missing on this deployment')
      return NextResponse.json(
        {
          reply:  "Our AI assistant isn't connected on this deployment yet. Tap below to raise a ticket and our ops team will reply directly.",
          action: 'suggest_escalation' as const,
        },
        { status: 200, headers: { 'X-Jyoti-Status': 'no_key' } },
      )
    }
    console.error('[support/chat] anthropic error:', err?.message || err)
    return NextResponse.json(
      {
        reply:  "I'm having trouble responding right now. Want me to connect you with our team?",
        action: 'suggest_escalation' as const,
      },
      { status: 200, headers: { 'X-Jyoti-Status': 'api_error' } },
    )
  }
}

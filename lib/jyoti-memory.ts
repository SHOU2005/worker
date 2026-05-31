// Jyoti's long-term memory of a worker.
//
// Two jobs:
//   1. readMemoryVars()  — load a worker's JyotiMemory row and shape it into
//      the dynamic variables the ElevenLabs agent prompt interpolates, so a
//      returning worker is greeted with continuity instead of "Namaste, kaun?".
//   2. rememberConversation() — after a call ends, take the transcript turns,
//      summarise them together with the EXISTING memory via Claude, and upsert
//      the compressed result. We re-summarise (not append) so the row stays
//      small and the prompt cost bounded no matter how many times a worker calls.
//
// Memory is intentionally a SHORT natural-language summary + a coarse mood +
// a small facts blob — never raw transcripts. That keeps a vulnerable user's
// verbatim speech from being retained, and keeps what we feed back into the
// agent prompt tight.

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'

// Reuse the same lightweight model the employer support bot uses — summarising
// a short call is well within Haiku's wheelhouse and keeps cost negligible.
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 700

// Hard ceiling on what we persist + feed back, so a chatty history can never
// blow up the agent prompt or the row. The summariser is told to compress to
// fit; this is the defensive truncation if it doesn't.
const MAX_SUMMARY_CHARS = 1500
const MAX_FACTS_CHARS    = 800

let _client: Anthropic | null = null
function client(): Anthropic | null {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  _client = new Anthropic({ apiKey: key })
  return _client
}

export interface TranscriptTurn {
  role: 'worker' | 'jyoti'
  text: string
}

/** Dynamic variables describing what Jyoti remembers about this worker.
 *  Names must match the {{placeholders}} on the ElevenLabs agent prompt —
 *  keep in sync with the Vance-prod agent script. */
export interface MemoryVars {
  is_first_call:        'yes' | 'no'
  jyoti_memory_summary: string   // '' on first ever call
  worker_mood:          string   // '' until first summary
  days_since_last_call: string   // '' if never, else integer as string
  call_count:           string   // integer as string
}

const EMPTY_VARS: MemoryVars = {
  is_first_call:        'yes',
  jyoti_memory_summary: '',
  worker_mood:          '',
  days_since_last_call: '',
  call_count:           '0',
}

/** Load a worker's memory and shape it for the agent prompt. Never throws —
 *  a missing row, missing table, or DB blip just yields the empty (first-call)
 *  vars so Jyoti still connects and greets warmly. */
export async function readMemoryVars(userId: string): Promise<MemoryVars> {
  try {
    const mem = await prisma.jyotiMemory.findUnique({ where: { userId } })
    if (!mem || mem.callCount === 0) return EMPTY_VARS

    let daysSince = ''
    if (mem.lastCallAt) {
      const ms = Date.now() - mem.lastCallAt.getTime()
      daysSince = String(Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000))))
    }

    return {
      is_first_call:        'no',
      jyoti_memory_summary: mem.summary || '',
      worker_mood:          mem.mood || '',
      days_since_last_call: daysSince,
      call_count:           String(mem.callCount),
    }
  } catch (err) {
    console.error('[JYOTI memory] read failed', err)
    return EMPTY_VARS
  }
}

interface SummaryResult {
  summary: string
  mood:    string
  facts:   string
}

/** Ask Claude to merge the prior memory with the new transcript into a single
 *  compact summary + mood + facts. Returns null if the model is unavailable or
 *  the output is unusable, so callers can skip the write rather than corrupt
 *  the existing memory. */
async function summarise(
  prior: { summary: string; mood: string | null; facts: string | null },
  turns: TranscriptTurn[],
): Promise<SummaryResult | null> {
  const c = client()
  if (!c) return null

  const transcript = turns
    .map(t => `${t.role === 'worker' ? 'Worker' : 'Jyoti'}: ${t.text}`)
    .join('\n')
    .slice(0, 6000) // bound the input; calls are short but cap defensively

  const system = `You maintain Jyoti's memory of a gig worker she talks to on voice calls. Jyoti is a warm Hindi/Hinglish-speaking friend-assistant in the Switch app for Indian gig workers.

You are given the PRIOR memory and the LATEST call transcript. Merge them into an UPDATED memory. Rules:
- Write the summary in simple English (it's internal context, not shown to the worker). Keep it under ${MAX_SUMMARY_CHARS} characters. Compress and drop stale details — do NOT just append.
- Capture durable, friend-worthy things: their name / what they like to be called, recurring struggles (money, transport, health, family), wins, work patterns, personality, anything that helps Jyoti pick up where they left off and feel like she remembers them.
- Do NOT store sensitive identifiers (Aadhaar, full bank/UPI, OTP codes, passwords) or verbatim addresses.
- mood: ONE word for how the worker seemed on THIS call: happy | tired | stressed | frustrated | anxious | hopeful | neutral.
- facts: a tiny JSON object of stable key facts (e.g. {"call_them":"Ramesh bhaiya","city":"Indore","kids":2}). Keep under ${MAX_FACTS_CHARS} chars. Merge with prior facts; omit if nothing stable.

Return ONLY valid JSON, no markdown fences:
{"summary":"...","mood":"...","facts":"{...}"}`

  const userMsg = `PRIOR MEMORY:
summary: ${prior.summary || '(none yet)'}
mood: ${prior.mood || '(none)'}
facts: ${prior.facts || '(none)'}

LATEST CALL TRANSCRIPT:
${transcript || '(empty)'}`

  try {
    const res = await c.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages:   [{ role: 'user', content: userMsg }],
    })
    const block = res.content.find(b => b.type === 'text')
    const raw   = block && block.type === 'text' ? block.text.trim() : ''
    const obj   = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim())

    const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, MAX_SUMMARY_CHARS) : ''
    if (!summary) return null
    const mood  = typeof obj.mood === 'string' ? obj.mood.toLowerCase().slice(0, 20) : ''
    const facts = typeof obj.facts === 'string'
      ? obj.facts.slice(0, MAX_FACTS_CHARS)
      : (obj.facts ? JSON.stringify(obj.facts).slice(0, MAX_FACTS_CHARS) : '')

    return { summary, mood, facts }
  } catch (err) {
    console.error('[JYOTI memory] summarise failed', err)
    return null
  }
}

/** Summarise a finished call and persist it into the worker's memory.
 *  Always bumps callCount + lastCallAt (so "days_since_last_call" and the
 *  greeting work even if summarisation failed). Never throws — memory is a
 *  best-effort enhancement, never a reason to fail the call teardown. */
export async function rememberConversation(
  userId: string,
  turns: TranscriptTurn[],
): Promise<void> {
  try {
    const prior = await prisma.jyotiMemory.findUnique({ where: { userId } })

    // Nothing said worth remembering — still record that a call happened so
    // continuity / cadence vars stay accurate.
    const meaningful = turns.filter(t => t.text.trim().length > 0)
    const summarised = meaningful.length >= 2
      ? await summarise(
          {
            summary: prior?.summary ?? '',
            mood:    prior?.mood ?? null,
            facts:   prior?.facts ?? null,
          },
          meaningful,
        )
      : null

    const data = summarised
      ? {
          summary:       summarised.summary,
          mood:          summarised.mood || prior?.mood || null,
          facts:         summarised.facts || prior?.facts || null,
          lastSummaryAt: new Date(),
        }
      : {} // keep existing summary/mood/facts untouched

    await prisma.jyotiMemory.upsert({
      where:  { userId },
      create: {
        userId,
        summary:    summarised?.summary ?? '',
        mood:       summarised?.mood ?? null,
        facts:      summarised?.facts ?? null,
        callCount:  1,
        lastCallAt: new Date(),
        lastSummaryAt: summarised ? new Date() : null,
      },
      update: {
        ...data,
        callCount:  { increment: 1 },
        lastCallAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[JYOTI memory] remember failed', err)
  }
}

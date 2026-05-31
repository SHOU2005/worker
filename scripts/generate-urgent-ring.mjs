// Generates urgent_ring.wav — a classic two-beep "trin tring" phone-ring tone.
// Output: 16-bit PCM, 22050 Hz, mono, ~1.5 seconds. Small enough (~65 KB) to
// ship inside the APK at android/app/src/main/res/raw/urgent_ring.wav and
// also at public/urgent-ring.wav for PWA foreground use.
//
// Run: node scripts/generate-urgent-ring.mjs
import { writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

const SAMPLE_RATE = 22050
const DURATION_S  = 1.5
const N           = Math.floor(SAMPLE_RATE * DURATION_S)

// Two ring bursts, each made of two stacked tones (440Hz + 480Hz — the actual
// frequencies a North-American/Indian dial tone uses for ring-back) plus a
// subtle 880Hz overtone for "phone bell" brightness. Each burst is shaped by
// a 20 Hz tremolo so it sounds like a mechanical bell rather than a flat tone.
const samples = new Int16Array(N)
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE

  // Burst envelope: ON during [0.00–0.55] and [0.75–1.30], OFF otherwise.
  const inFirst  = t >= 0.00 && t < 0.55
  const inSecond = t >= 0.75 && t < 1.30
  const active   = inFirst || inSecond
  if (!active) { samples[i] = 0; continue }

  // Local time inside the burst, for fade-in/out shaping
  const localT  = inFirst ? t : t - 0.75
  const burstLen = 0.55
  const fade    = Math.min(localT, burstLen - localT) / 0.05
  const env     = Math.max(0, Math.min(1, fade))

  // 20 Hz tremolo — produces the classic "trin trin trin" buzz
  const tremolo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 20 * localT)

  // Three stacked sines: 440 + 480 (American ring) + 880 (bell sparkle)
  const tone =
    0.40 * Math.sin(2 * Math.PI * 440 * t) +
    0.40 * Math.sin(2 * Math.PI * 480 * t) +
    0.20 * Math.sin(2 * Math.PI * 880 * t)

  // Total amplitude — clamp to avoid clipping past int16 range
  const amp = env * tremolo * tone
  samples[i] = Math.max(-32767, Math.min(32767, Math.round(amp * 28000)))
}

// WAV header — 44 bytes for PCM mono int16
const dataBytes = samples.byteLength
const header    = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + dataBytes, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)               // fmt chunk size
header.writeUInt16LE(1, 20)                // PCM format
header.writeUInt16LE(1, 22)                // mono
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28)  // byte rate
header.writeUInt16LE(2, 32)                // block align
header.writeUInt16LE(16, 34)               // bits per sample
header.write('data', 36)
header.writeUInt32LE(dataBytes, 40)

const wav = Buffer.concat([header, Buffer.from(samples.buffer)])

const outAndroid = join(ROOT, 'android/app/src/main/res/raw/urgent_ring.wav')
const outPublic  = join(ROOT, 'public/urgent-ring.wav')
writeFileSync(outAndroid, wav)
writeFileSync(outPublic,  wav)
console.log(`Wrote urgent_ring.wav (${wav.length} bytes) to:\n  ${outAndroid}\n  ${outPublic}`)

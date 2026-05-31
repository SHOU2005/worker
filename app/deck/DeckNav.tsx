'use client'

import { useEffect } from 'react'
import { track } from '@/lib/posthog'

export default function DeckNav() {
  useEffect(() => {
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'))
    if (!slides.length) return

    const pad = (n: number) => String(n).padStart(2, '0')
    const total = pad(slides.length)
    slides.forEach((s, i) => {
      const p = s.querySelector<HTMLElement>('.pageno')
      if (p) p.textContent = `${pad(i + 1)} / ${total}`
    })

    let idx = 0
    const go = (n: number) => {
      idx = Math.max(0, Math.min(slides.length - 1, n))
      slides[idx].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(idx + 1) }
      if (['ArrowLeft', 'PageUp'].includes(e.key))         { e.preventDefault(); go(idx - 1) }
      if (e.key === 'Home') go(0)
      if (e.key === 'End') go(slides.length - 1)
    }
    document.addEventListener('keydown', onKey)

    const seen = new Set<number>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return
          const target = entry.target as HTMLElement
          const i = slides.indexOf(target) + 1
          if (seen.has(i)) return
          seen.add(i)
          const chapter = target.querySelector('.chapter')?.textContent?.trim() || `Slide ${i}`
          track('deck_slide_view', { slide_index: i, slide_chapter: chapter })
        })
      },
      { threshold: [0.6] }
    )
    slides.forEach((s) => io.observe(s))

    return () => {
      document.removeEventListener('keydown', onKey)
      io.disconnect()
    }
  }, [])

  return null
}

'use client'
/**
 * Shared skeleton loaders. Replaces ad-hoc "Loading..." text across the
 * worker / employer / ops apps. The shimmer animation lives in globals.css
 * under `.skel` so themes (worker / captain) can override the gradient.
 *
 * Use case 1 — single placeholder line / block:
 *   <Skel h={20} w="60%" />
 *
 * Use case 2 — pre-built page shells:
 *   <DashboardSkeleton />     — header card + stats grid + 3 list rows
 *   <JobCardSkeleton />       — single swipe card placeholder
 *   <ListRowSkeleton count={5} />
 *
 * One CSS class everywhere: `skel`. No inline animation, no component-
 * level <style>. Keeps rendering cost near-zero even with 30 rows.
 */
import { CSSProperties } from 'react'

interface SkelProps {
  h?:   number | string
  w?:   number | string
  br?:  number  // border radius
  mb?:  number  // margin-bottom
  className?: string
  style?: CSSProperties
}

export function Skel({ h = 16, w = '100%', br = 8, mb = 0, className, style }: SkelProps) {
  return (
    <div
      className={`skel ${className || ''}`}
      style={{
        height: typeof h === 'number' ? `${h}px` : h,
        width:  typeof w === 'number' ? `${w}px` : w,
        borderRadius: br,
        marginBottom: mb,
        ...style,
      }}
    />
  )
}

interface DarkProp { dark?: boolean }

export function ListRowSkeleton({ count = 4, dark = false }: { count?: number } & DarkProp) {
  const bg     = dark ? '#0F0F0F' : '#F5F5F5'
  const border = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)'
  const sep    = dark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.05)'
  return (
    <div style={{ background: bg, borderRadius: 16, overflow: 'hidden', border }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < count - 1 ? sep : 'none' }}>
          <Skel h={42} w={42} br={12} />
          <div style={{ flex: 1 }}>
            <Skel h={14} w="65%" mb={8} />
            <Skel h={11} w="40%" />
          </div>
          <div style={{ textAlign: 'right' }}>
            <Skel h={16} w={64} mb={6} />
            <Skel h={11} w={48} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ h = 180, dark = false }: { h?: number } & DarkProp) {
  const bg     = dark ? '#0F0F0F' : '#F5F5F5'
  const border = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)'
  return (
    <div style={{ height: h, borderRadius: 20, padding: 16, background: bg, border }}>
      <Skel h={20} w="55%" mb={10} />
      <Skel h={12} w="40%" mb={20} />
      <Skel h={56} w="100%" br={14} mb={12} />
      <Skel h={12} w="80%" />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <Skel h={120} br={20} mb={12} />
      <CardSkeleton />
      <div style={{ height: 12 }} />
      <ListRowSkeleton count={5} />
    </div>
  )
}

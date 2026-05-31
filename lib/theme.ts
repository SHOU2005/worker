/**
 * Design tokens — single source of truth for the visual language.
 * Inline `BG = '#080808'` / `T2 = 'rgba(255,255,255,0.45)'` constants exist
 * in nearly every page right now (worker is light theme, employer/captain/
 * ops are dark theme). Migrating callers one by one is a long road; this
 * file is the canonical reference everything new should pull from.
 *
 * Usage:
 *   import { color, font, space } from '@/lib/theme'
 *   <div style={{ background: color.dark.bg, padding: space[4] }} />
 */

export const color = {
  // Worker / employer-PWA-pre-login (light theme)
  light: {
    bg:        '#FFFFFF',
    surface:   '#F5F5F5',
    surfaceAlt:'#FAFAFA',
    border:    'rgba(0,0,0,0.08)',
    borderLg:  'rgba(0,0,0,0.12)',
    t1:        '#111111',
    t2:        'rgba(0,0,0,0.45)',
    t3:        'rgba(0,0,0,0.28)',
  },
  // Employer / captain / ops (dark theme)
  dark: {
    bg:        '#080808',
    surface:   '#0F0F0F',
    surfaceAlt:'#181818',
    border:    'rgba(255,255,255,0.08)',
    borderLg:  'rgba(255,255,255,0.12)',
    t1:        '#FFFFFF',
    t2:        'rgba(255,255,255,0.45)',
    t3:        'rgba(255,255,255,0.20)',
  },
  // Semantic — work the same on either theme
  brand:     '#111111',
  brandInv:  '#FFFFFF',
  success:   '#10B981',
  successBg: 'rgba(16,185,129,0.12)',
  warning:   '#F59E0B',
  warningBg: 'rgba(245,158,11,0.12)',
  danger:    '#DC2626',
  dangerBg:  'rgba(220,38,38,0.10)',
  info:      '#0EA5E9',
  infoBg:    'rgba(14,165,233,0.10)',
  gold:      '#F5C518',
} as const

// 4px-based spacing scale. Use as space[4] for 16px, space[6] for 24px, etc.
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64,
} as const

// Border radius scale.
export const radius = {
  none: 0, sm: 6, md: 10, lg: 14, xl: 18, '2xl': 22, full: 9999,
} as const

export const font = {
  family:   '"DM Sans", system-ui, -apple-system, sans-serif',
  // Sizes line up with Tailwind's tw-text-* scale.
  size: {
    xs: 11, sm: 13, base: 14, md: 15, lg: 16, xl: 18, '2xl': 22, '3xl': 28, '4xl': 36,
  },
  weight: {
    regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
  },
} as const

// Common shadow presets so cards / pills look the same everywhere.
export const shadow = {
  card:     '0 2px 12px rgba(0,0,0,0.04)',
  cardHi:   '0 4px 20px rgba(0,0,0,0.10)',
  pill:     '0 4px 16px rgba(0,0,0,0.18)',
  modal:    '0 12px 40px rgba(0,0,0,0.22)',
  // For dark themes — inset glow looks better than a drop shadow
  glowOk:   '0 4px 20px rgba(16,185,129,0.18)',
  glowWarn: '0 4px 20px rgba(245,158,11,0.18)',
} as const

// Animation durations + easings — keep transitions consistent in feel.
export const motion = {
  fast:     '0.12s',
  base:     '0.18s',
  slow:     '0.32s',
  spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot springs
  ease:     'cubic-bezier(0.4, 0, 0.2, 1)',       // material standard
} as const

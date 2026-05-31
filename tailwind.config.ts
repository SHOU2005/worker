import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary – deep indigo (trust, modern)
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          400: '#93C5FD',
          500: '#3B82F6',
          600: '#1D4ED8',
          700: '#4338ca',
          800: '#3730a3',
          900: '#1e1b4b',
          950: '#0f0e2a',
        },
        // Accent – vivid orange (energy, earnings, urgency)
        accent: {
          50:  '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        // Success green
        success: {
          50:  '#f0fdf4',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px rgba(0,0,0,0.08)',
        'glow':    '0 4px 20px rgba(29,78,216,0.4)',
        'glow-or': '0 4px 20px rgba(249,115,22,0.4)',
        'btn':     '0 2px 8px rgba(0,0,0,0.15)',
      },
      backgroundImage: {
        'grad-primary': 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)',
        'grad-accent':  'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
        'grad-dark':    'linear-gradient(160deg, #0f0e2a 0%, #1e1b4b 50%, #2d2b6b 100%)',
        'grad-earn':    'linear-gradient(135deg, #16a34a 0%, #059669 100%)',
      },
      animation: {
        'fade-up':    'fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':    'fadeIn 0.3s ease-out both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'bounce-sm':  'bounceSm 1s ease-in-out infinite',
        'shimmer':    'shimmer 1.6s linear infinite',
        'slide-up':   'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        fadeUp:   { from:{ opacity:'0', transform:'translateY(20px)' }, to:{ opacity:'1', transform:'translateY(0)' } },
        fadeIn:   { from:{ opacity:'0' },                               to:{ opacity:'1' } },
        bounceSm: { '0%,100%':{ transform:'translateY(0)' },           '50%':{ transform:'translateY(-4px)' } },
        shimmer:  { from:{ backgroundPosition:'-200% 0' },             to:{ backgroundPosition:'200% 0' } },
        slideUp:  { from:{ opacity:'0', transform:'translateY(100%)' }, to:{ opacity:'1', transform:'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
export default config

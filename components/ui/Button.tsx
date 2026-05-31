'use client'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger'
  size?:    'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-95 select-none disabled:opacity-50 disabled:pointer-events-none rounded-2xl'

  const variants = {
    primary:   'bg-gradient-brand text-white shadow-glow',
    secondary: 'bg-surface-100 text-surface-900 border border-surface-200',
    gold:      'bg-gradient-gold text-white shadow-glow-gold',
    ghost:     'text-brand-600 hover:bg-brand-50',
    danger:    'bg-red-500 text-white hover:bg-red-600',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3.5 text-sm',
    lg: 'px-8 py-4 text-base',
  }

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
})
Button.displayName = 'Button'
export default Button

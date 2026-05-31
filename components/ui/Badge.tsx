import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  className?: string
}

const variants = {
  default: 'bg-surface-100 text-surface-700 border-surface-200',
  success: 'bg-green-50  text-green-700  border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  danger:  'bg-red-50    text-red-700    border-red-200',
  info:    'bg-blue-50   text-blue-700   border-blue-200',
  purple:  'bg-brand-50  text-brand-700  border-brand-200',
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('badge', variants[variant], className)}>
      {children}
    </span>
  )
}

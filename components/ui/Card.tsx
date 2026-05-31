import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CardProps {
  children:  ReactNode
  className?: string
  glass?:    boolean
  onClick?:  () => void
}

export default function Card({ children, className, glass, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'card p-4',
        glass && 'glass',
        onClick && 'cursor-pointer active:scale-[0.98] transition-transform duration-150',
        className
      )}
    >
      {children}
    </div>
  )
}

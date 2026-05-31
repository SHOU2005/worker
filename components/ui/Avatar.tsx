import { cn, getInitials } from '@/lib/utils'

interface AvatarProps {
  name:       string
  src?:       string | null
  size?:      'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  xs: 'w-6  h-6  text-xs',
  sm: 'w-8  h-8  text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
}

export default function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <div className={cn('rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0', sizes[size], className)}>
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" />
        : <span>{getInitials(name)}</span>
      }
    </div>
  )
}

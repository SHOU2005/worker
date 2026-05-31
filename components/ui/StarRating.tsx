'use client'
import { Star } from 'lucide-react'
import { useState } from 'react'

interface StarRatingProps {
  value:      number
  onChange?:  (v: number) => void
  readonly?:  boolean
  size?:      'sm' | 'md' | 'lg'
}

export default function StarRating({ value, onChange, readonly, size = 'md' }: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-7 h-7' }

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          className="disabled:cursor-default"
        >
          <Star
            className={`${sizes[size]} transition-colors duration-100 ${
              n <= (hover || value) ? 'fill-gold-500 text-gold-500' : 'fill-transparent text-surface-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

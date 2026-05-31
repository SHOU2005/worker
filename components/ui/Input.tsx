'use client'
import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?:  string
  error?:  string
  prefix?: ReactNode
  suffix?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  className, label, error, prefix, suffix, ...props
}, ref) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-surface-700">{label}</label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <div className="absolute left-4 text-surface-400 flex items-center">{prefix}</div>
        )}
        <input
          ref={ref}
          className={cn(
            'input',
            prefix && 'pl-10',
            suffix && 'pr-10',
            error && 'border-red-400 focus:ring-red-300 focus:border-red-400',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-4 text-surface-400 flex items-center">{suffix}</div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
})
Input.displayName = 'Input'
export default Input

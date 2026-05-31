import Link from 'next/link'
import { MapPin, Clock, Users, Zap, IndianRupee } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatDate, formatTime, formatCurrency, ROLES } from '@/lib/utils'

interface ShiftCardProps {
  shift: {
    id:           string
    title:        string
    role:         string
    address:      string
    city:         string
    date:         string | Date
    startTime:    string
    endTime:      string
    duration:     number
    workersNeeded: number
    hourlyRate:   number
    isUrgent:     boolean
    status:       string
    _count?:      { bookings: number }
  }
  href?: string
}

export default function ShiftCard({ shift, href }: ShiftCardProps) {
  const Wrapper = href ? Link : 'div'
  const props   = href ? { href } : {}

  return (
    // @ts-expect-error polymorphic wrapper
    <Wrapper {...props} className="block">
      <div className="card p-4 active:scale-[0.98] transition-transform duration-150 cursor-pointer">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-surface-900">{shift.title}</span>
              {shift.isUrgent && (
                <span className="flex items-center gap-0.5 text-[10px] bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-semibold">
                  <Zap className="w-3 h-3" /> URGENT
                </span>
              )}
            </div>
            <span className="text-xs text-surface-500 font-medium">
              {ROLES[shift.role as keyof typeof ROLES] ?? shift.role}
            </span>
          </div>
          <StatusBadge status={shift.status} />
        </div>

        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-surface-600">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
            <span className="truncate">{shift.city}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
            <span>{formatDate(shift.date)} · {formatTime(shift.startTime)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
            <span>{shift.workersNeeded} worker{shift.workersNeeded > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
            <span className="font-semibold text-surface-900">{formatCurrency(shift.hourlyRate)}/hr</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between">
          <span className="text-xs text-surface-500">{shift.duration}h shift</span>
          <span className="text-sm font-bold text-brand-600">
            {formatCurrency(shift.hourlyRate * shift.duration * shift.workersNeeded)} total
          </span>
        </div>
      </div>
    </Wrapper>
  )
}

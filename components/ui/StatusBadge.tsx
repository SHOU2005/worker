import { cn, getBookingStatusColor } from '@/lib/utils'

const labels: Record<string, string> = {
  PENDING:     'Pending',
  CONFIRMED:   'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
  OPEN:        'Open',
  CLOSED:      'Closed',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('badge', getBookingStatusColor(status))}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {labels[status] ?? status}
    </span>
  )
}

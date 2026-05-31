import { Star, MapPin, Briefcase, CheckCircle } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'

interface Worker {
  id:          string
  name:        string
  avatar?:     string | null
  rating:      number
  totalShifts: number
  distance:    number
  skills:      string[]
  city?:       string | null
}

interface WorkerCardProps {
  worker:    Worker
  onSelect:  (id: string) => void
  selected?: boolean
  loading?:  boolean
}

export default function WorkerCard({ worker, onSelect, selected, loading }: WorkerCardProps) {
  return (
    <div className={`card p-4 transition-all duration-200 ${selected ? 'ring-2 ring-brand-500 bg-brand-50/30' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar name={worker.name} src={worker.avatar} size="lg" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-surface-900 truncate">{worker.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3.5 h-3.5 fill-gold-500 text-gold-500" />
                <span className="text-sm font-semibold text-surface-800">{worker.rating.toFixed(1)}</span>
                <span className="text-xs text-surface-400">({worker.totalShifts} shifts)</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-surface-500 shrink-0">
              <MapPin className="w-3 h-3" />
              <span>{worker.distance} km</span>
            </div>
          </div>

          {worker.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {worker.skills.slice(0, 3).map(skill => (
                <span key={skill} className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium border border-brand-100">
                  {skill}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-1 text-xs text-surface-500">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>Aadhaar Verified</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-surface-500">
              <Briefcase className="w-3 h-3" />
              <span>{worker.totalShifts} shifts done</span>
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={() => onSelect(worker.id)}
        variant={selected ? 'secondary' : 'primary'}
        size="sm"
        loading={loading}
        fullWidth
        className="mt-3"
      >
        {selected ? '✓ Selected' : 'Select Worker'}
      </Button>
    </div>
  )
}

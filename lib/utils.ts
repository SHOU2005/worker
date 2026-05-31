import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

// All date/time formatting is locked to Asia/Kolkata so server-rendered output
// matches what users see in India regardless of where Vercel runs the function.
const IST_TZ = 'Asia/Kolkata'

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TZ,
  }).format(new Date(date))
}

export function formatDateTimeIST(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TZ,
  }).format(new Date(date)) + ' IST'
}

// "HH:MM" 24-hour string → "9:00 AM" (no timezone conversion since these are
// already typed in the worker/employer's local time and stored as text).
export function formatTime(time: string): string {
  if (!time || !time.includes(':')) return time || ''
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

// "Today" / "Tomorrow" / "Mon, 8 May" — IST-aware.
export function relativeDateIST(date: string | Date): string {
  const d = new Date(date)
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }))
  const istDay = new Date(d.toLocaleString('en-US', { timeZone: IST_TZ }))
  const diffDays = Math.floor((istDay.getTime() - new Date(istNow.toDateString()).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: IST_TZ,
  }).format(d)
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function getAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5a5aec&color=fff&bold=true&format=svg`
}

export const ROLES = {
  helper: 'Helper',
  shopAssistant: 'Shop Assistant',
  driver: 'Driver',
  deliveryBoy: 'Delivery Boy',
  security: 'Security Guard',
  warehouseWorker: 'Warehouse Worker',
  kitchen: 'Kitchen Staff',
  cleaning: 'Cleaning Staff',
} as const

export type RoleKey = keyof typeof ROLES

export const DURATIONS = [4, 8, 12] as const

export function calculateShiftCost(hours: number, workers: number, isUrgent: boolean) {
  const base = hours * workers * 200
  const urgentFee = isUrgent ? 99 : 0
  return { base, urgentFee, total: base + urgentFee }
}

export function getBookingStatusColor(status: string) {
  switch (status) {
    case 'PENDING':    return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'CONFIRMED':  return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'IN_PROGRESS': return 'bg-green-100 text-green-700 border-green-200'
    case 'COMPLETED':  return 'bg-indigo-100 text-indigo-700 border-indigo-200'
    case 'CANCELLED':  return 'bg-red-100 text-red-700 border-red-200'
    default:           return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

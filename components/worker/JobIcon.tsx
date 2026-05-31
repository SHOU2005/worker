export function getJobPhoto(title: string): string {
  const t = (title || '').toLowerCase()
  if (t.includes('delivery') || t.includes('rider'))           return '/icons/services/delivery-rider.jpg'
  if (t.includes('security') || t.includes('guard'))           return '/icons/services/security-guard.jpg'
  if (t.includes('warehouse') || t.includes('loading') || t.includes('pack')) return '/icons/services/warehouse-staff.jpg'
  if (t.includes('kitchen') || t.includes('cook') || t.includes('chef'))       return '/icons/services/cook-chef.jpg'
  if (t.includes('driver'))                                     return '/icons/services/driver.jpg'
  if (t.includes('clean'))                                      return '/icons/services/house-cleaner.jpg'
  if (t.includes('paint'))                                      return '/icons/services/painter.jpg'
  if (t.includes('electric'))                                   return '/icons/services/electrician.jpg'
  if (t.includes('carpenter') || t.includes('construct'))       return '/icons/services/carpenter.jpg'
  if (t.includes('baby'))                                       return '/icons/services/baby-care.jpg'
  return '/icons/services/store-helper.jpg'
}

const EMOJI_TITLE: Record<string, string> = {
  '🏪': 'shop',        '🚴': 'delivery',    '🏭': 'warehouse',
  '🔒': 'security',    '🍳': 'kitchen',      '🚗': 'driver',
  '💼': 'office',      '🧹': 'cleaning',     '📦': 'packing',
  '🛒': 'cashier',     '🚛': 'loading',      '🏗️': 'construction',
}

export default function JobIcon({ emoji, size = 48, radius = 14 }: { emoji: string; size?: number; radius?: number }) {
  const mapped = EMOJI_TITLE[emoji] ?? emoji
  const photo  = getJobPhoto(mapped)
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, background: '#EFEFEF' }}>
      <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
    </div>
  )
}

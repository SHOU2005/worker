const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

export async function compressImage(
  file: File | Blob,
  maxKB = 250,
  maxSize = 800
): Promise<string> {
  if (!(file instanceof Blob)) {
    throw new Error('No file selected')
  }

  const type = (file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') {
    throw new Error('iPhone HEIC photos are not supported. Change camera format to "Most Compatible" in iPhone Settings → Camera → Formats, or upload a JPG/PNG.')
  }
  if (type && !SUPPORTED_TYPES.includes(type)) {
    throw new Error(`Unsupported format (${type}). Use JPG, PNG or WEBP.`)
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Image is too large (max 25 MB). Pick a smaller photo.')
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(url)

    img.onload = () => {
      try {
        if (!img.width || !img.height) {
          cleanup()
          return reject(new Error('Image could not be read. Try a different photo.'))
        }
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width  * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width  = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          cleanup()
          return reject(new Error('Browser cannot process this image.'))
        }
        ctx.drawImage(img, 0, 0, w, h)

        let lo = 0.3, hi = 0.85, best = ''
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2
          const data = canvas.toDataURL('image/jpeg', mid)
          const kb = Math.round((data.length * 3) / 4 / 1024)
          if (kb <= maxKB) { best = data; lo = mid } else { hi = mid }
        }
        cleanup()
        resolve(best || canvas.toDataURL('image/jpeg', 0.3))
      } catch (e) {
        cleanup()
        reject(e instanceof Error ? e : new Error('Image compression failed'))
      }
    }
    img.onerror = () => {
      cleanup()
      reject(new Error('Image could not be opened. iPhone HEIC photos are not supported — use JPG or PNG.'))
    }
    img.src = url
  })
}

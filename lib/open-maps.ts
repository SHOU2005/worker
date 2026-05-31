// Capacitor-aware Google Maps deeplink. Used by ActiveShift (arrival flow)
// and Jyoti (the `open_employer_maps` tool). Prefers lat/lng when available
// since address strings round-trip poorly through Maps search, falls back to
// the address string, and finally to a no-op when there is nothing to point at.
//
// On a Capacitor webview `window.open(..., '_system')` is the safe way to
// hand the URL off to the OS so the native Google Maps app opens. On the
// plain web build the same call opens a new tab. We never use _blank inside
// the Capacitor webview because Android intercepts it and tries to navigate
// the in-app browser, which fails for `geo:` and Maps URLs.

import { extractLatLng } from './maps-link'

export interface MapsTarget {
  /** Free-form address — preferred fallback when lat/lng unknown. */
  address?: string | null
  /** Latitude. If lng is also set, takes priority over address. */
  lat?: number | null
  /** Longitude. */
  lng?: number | null
  /** Pasted Google Maps URL — extractLatLng() is tried before falling back. */
  mapsUrl?: string | null
  /** Optional label so the pin shows a name on the destination card. */
  label?: string | null
}

/**
 * Build a Google Maps directions URL from whatever is set on the target.
 * Returns null if nothing usable is present (caller can hide the button).
 */
export function buildMapsUrl(t: MapsTarget): string | null {
  const fromUrl = extractLatLng(t.mapsUrl ?? undefined)
  const lat = t.lat ?? fromUrl?.lat
  const lng = t.lng ?? fromUrl?.lng

  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    // dir_action=navigate makes Google Maps START turn-by-turn navigation
    // immediately on launch, instead of showing the destination as a pin
    // the worker has to tap "Start" on. Driving is the default mode;
    // workers on foot just tap the mode switcher inside Maps.
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`
  }

  const addr = (t.address || '').trim()
  if (addr) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving&dir_action=navigate`
  }

  return null
}

/**
 * Open Google Maps for the target. Returns true if a window was opened, false
 * if there was nothing to point at (so callers can show a toast).
 */
export function openMaps(t: MapsTarget): boolean {
  const url = buildMapsUrl(t)
  if (!url) return false

  // _system is the Capacitor-recognised target that routes to the OS browser /
  // native Maps app. On plain web it falls back to a new tab.
  // noopener/noreferrer guard against reverse-tabnabbing when the link does
  // end up in a normal browser context.
  if (typeof window !== 'undefined') {
    window.open(url, '_system', 'noopener,noreferrer')
  }
  return true
}

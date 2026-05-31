/**
 * Tiny global toast helper. Pages call showToast({ kind, message }) and a
 * <Toaster /> mounted high in the tree (in each role's layout) renders it.
 *
 * Why a window-event channel instead of a context provider: pages already
 * import from 'lib/' freely, but contexts force every consumer to be a
 * client component AND inside a provider — and our role layouts each have
 * their own provider tree. The event bus is render-tree-agnostic and
 * server-component safe (no-op if window is undefined).
 *
 * Replaces the scatter of native alert() calls + ad-hoc red text spans.
 */

export type ToastKind = 'error' | 'success' | 'info' | 'warning'

export interface ToastDetail {
  kind:     ToastKind
  message:  string
  // Optional title shown bold above the message
  title?:   string
  // Auto-dismiss after this many ms; default 4000
  durationMs?: number
}

const EVENT = 'sw-toast'

export function showToast(detail: ToastDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastDetail>(EVENT, { detail }))
}

// Convenience kind-specific helpers — saves the kind: 'error' boilerplate
// at every callsite.
export const toastError   = (message: string, title?: string) => showToast({ kind: 'error',   message, title })
export const toastSuccess = (message: string, title?: string) => showToast({ kind: 'success', message, title })
export const toastInfo    = (message: string, title?: string) => showToast({ kind: 'info',    message, title })
export const toastWarning = (message: string, title?: string) => showToast({ kind: 'warning', message, title })

export const TOAST_EVENT = EVENT

/**
 * Trigger the OS camera permission dialog before opening a file picker
 * that may need to launch the camera. Two scenarios:
 *
 *   - Capacitor APK (native): the WebView's `<input type=file>` chooser
 *     does NOT automatically request the runtime CAMERA permission when
 *     the user picks the Camera tile. We call the Capacitor Camera
 *     plugin's checkPermissions / requestPermissions to force the
 *     system dialog the first time so the camera intent doesn't fail
 *     silently.
 *
 *   - Browser PWA: Chrome and Safari handle the camera permission
 *     inline when the user actually picks Camera from the file
 *     chooser, so we don't need to do anything here. The function
 *     short-circuits before the dynamic import.
 *
 * The @capacitor/camera import is dynamic so the web bundle stays
 * lean and the function tolerates missing plugins (e.g. when the
 * package isn't installed for the worker build). Failures are
 * swallowed — the file input still opens regardless.
 */
export async function ensureCameraPermission(): Promise<void> {
  if (typeof window === 'undefined') return
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return
  try {
    const mod = await import('@capacitor/camera')
    const Camera = mod.Camera
    const current = await Camera.checkPermissions().catch(() => null)
    if (!current || current.camera !== 'granted') {
      await Camera.requestPermissions({ permissions: ['camera'] }).catch(() => {})
    }
  } catch { /* plugin not present in this build — fall through */ }
}

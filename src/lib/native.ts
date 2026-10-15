// La app de Android TV (v0.19, carpeta tv-app/): es esta misma web dentro de un WebView con un plugin
// chiquito (SpNative) para lo que el navegador no da. En el navegador todo esto no hace nada.

interface SpNativePlugin {
  keepAwake(opts: { on: boolean }): Promise<void>
  exitApp(): Promise<void>
}

interface CapacitorLike {
  isNativePlatform?: () => boolean
  Plugins?: { SpNative?: SpNativePlugin }
}

const APP_UA = /\bSeriesPelisApp\//

function capacitor(): CapacitorLike | undefined {
  return typeof window === 'undefined' ? undefined : (window as Window & { Capacitor?: CapacitorLike }).Capacitor
}

function plugin(): SpNativePlugin | undefined {
  const cap = capacitor()
  return cap?.isNativePlatform?.() ? cap.Plugins?.SpNative : undefined
}

/** Corre dentro de la app (el User-Agent lo dice aunque el puente todavía no haya cargado). */
export function isNativeApp(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return APP_UA.test(userAgent) || !!plugin()
}

/** Pantalla prendida mientras se reproduce: el WebView no tiene `navigator.wakeLock`. */
export function nativeKeepAwake(on: boolean): boolean {
  const p = plugin()
  if (!p) return false
  p.keepAwake({ on }).catch(() => {})
  return true
}

/** "Atrás" en Inicio: la app se va al fondo, como el resto de las apps de la TV. */
export function nativeExit(): boolean {
  const p = plugin()
  if (!p) return false
  p.exitApp().catch(() => {})
  return true
}

/**
 * El botón Atrás del control lo agarra la app y llama a `window.__spNativeBack()`. Se manda a la web como la
 * tecla "GoBack" (la misma que mandan otros controles), así cada menú, el reproductor o la navegación lo
 * resuelven como siempre. Devuelve `true` si alguien lo usó; si no, la app se va al fondo.
 */
export function backFromNative(doc: Document = document): boolean {
  const target = doc.activeElement instanceof HTMLElement ? doc.activeElement : doc.body
  const event = new KeyboardEvent('keydown', { key: 'GoBack', code: 'GoBack', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

export function initNative() {
  if (typeof window === 'undefined' || !isNativeApp()) return
  ;(window as Window & { __spNativeBack?: () => boolean }).__spNativeBack = () => backFromNative()
}

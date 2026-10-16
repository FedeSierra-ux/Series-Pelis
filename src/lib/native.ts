// La app de Android TV (v0.19, carpeta tv-app/): es esta misma web dentro de un WebView con un plugin
// chiquito (SpNative) para lo que el navegador no da. En el navegador todo esto no hace nada.

interface PluginListenerHandle {
  remove(): Promise<void> | void
}

/** Lo que cuenta el APK de sí mismo. Un APK viejo no trae las claves nuevas: falta = no lo tiene. */
export interface NativeInfo {
  tv?: boolean
  version?: string
  player?: boolean
  /** v0.21: se actualiza solo desde GitHub Releases. */
  update?: boolean
  /** v0.21: la fila "A continuación" del inicio de Android TV (TvProvider) anda en este aparato. */
  home?: boolean
  fireTv?: boolean
}

export interface NativeUpdateInfo {
  available: boolean
  current: string
  latest?: string
  notes?: string
  size?: number
  error?: string
}

export type NativeUpdateEvent =
  | { state: 'downloading'; progress: number }
  | { state: 'verifying' }
  | { state: 'permission' }
  | { state: 'installer' }
  | { state: 'error'; message: string }

/** Una tarjeta de "A continuación" (Watch Next) en el inicio de la TV. */
export interface NativeHomeItem {
  key: string
  kind: 'continue' | 'next' | 'new'
  type: 'movie' | 'series'
  metaId: string
  title: string
  episodeTitle?: string
  season?: number
  episode?: number
  image?: string
  poster?: string
  /** Segundos. */
  position: number
  duration: number
  /** ms. */
  lastEngagement: number
  path: string
}

export interface NativeHomeData {
  profile: string
  continue: NativeHomeItem[]
}

export interface NativeLaunch {
  path?: string
  profile?: string
}

interface SpNativePlugin {
  getInfo(): Promise<NativeInfo>
  keepAwake(opts: { on: boolean }): Promise<void>
  exitApp(): Promise<void>
  updateCheck(opts: { force?: boolean }): Promise<NativeUpdateInfo>
  updateInstall(): Promise<void>
  homeSync(data: NativeHomeData): Promise<void>
  takeLaunch(): Promise<NativeLaunch>
  addListener(event: 'update', fn: (e: NativeUpdateEvent) => void): Promise<PluginListenerHandle> | PluginListenerHandle
  addListener(event: 'open', fn: () => void): Promise<PluginListenerHandle> | PluginListenerHandle
}

interface CapacitorLike {
  isNativePlatform?: () => boolean
  Plugins?: { SpNative?: SpNativePlugin }
}

const APP_UA = /\bFlixApp\//

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

let info: Promise<NativeInfo> | undefined

/** Lo que sabe hacer el APK (se pregunta una vez). En el navegador, vacío. */
export function nativeInfo(): Promise<NativeInfo> {
  const p = plugin()
  if (!p) return Promise.resolve({})
  info ??= p.getInfo().catch(() => ({}))
  return info
}

/** Solo para los tests. */
export function resetNativeInfo() {
  info = undefined
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

/** Busca una versión nueva del APK en GitHub Releases (`force` saltea la espera de 6 h). */
export async function nativeUpdateCheck(force = false): Promise<NativeUpdateInfo | undefined> {
  const p = plugin()
  if (!p || !(await nativeInfo()).update) return undefined
  return p.updateCheck({ force })
}

/** Baja el APK, lo verifica y abre el instalador de Android (el avance llega por `listenNative('update')`). */
export async function nativeUpdateInstall(): Promise<void> {
  const p = plugin()
  if (!p) throw new Error('Solo desde la app')
  await p.updateInstall()
}

/** Manda las filas del inicio de la TV (todas de una vez: Android saca lo que ya no está). */
export function nativeHomeSync(data: NativeHomeData): Promise<void> {
  const p = plugin()
  return p ? p.homeSync(data) : Promise.resolve()
}

/** El enlace con el que se abrió la app desde el inicio de la TV (una sola vez). */
export async function nativeTakeLaunch(): Promise<NativeLaunch> {
  const p = plugin()
  if (!p) return {}
  try {
    return (await p.takeLaunch()) ?? {}
  } catch {
    return {}
  }
}

/** Escucha un evento del APK. Devuelve la función para dejar de escuchar. */
export function listenNative(event: 'update', fn: (e: NativeUpdateEvent) => void): () => void
export function listenNative(event: 'open', fn: () => void): () => void
export function listenNative(event: 'update' | 'open', fn: (e: NativeUpdateEvent) => void): () => void {
  const p = plugin()
  if (!p) return () => {}
  let handle: PluginListenerHandle | undefined
  let removed = false
  Promise.resolve(p.addListener(event as 'update', fn))
    .then((h) => {
      handle = h
      if (removed) void Promise.resolve(h.remove()).catch(() => {})
    })
    .catch(() => {})
  return () => {
    removed = true
    if (handle) void Promise.resolve(handle.remove()).catch(() => {})
  }
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

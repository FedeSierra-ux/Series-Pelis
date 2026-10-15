// Reproductor nativo de la app de Android TV (v0.20): ExoPlayer/Media3 dentro de la app, encima de la web.
//
// La web sigue siendo la que decide (qué subtítulo, cuándo saltar, cuál es el siguiente episodio, dónde
// guardar el progreso); Android solo reproduce y muestra los botones. Se hablan por el plugin SpNative:
// - la web abre (`playerOpen`), actualiza (`playerUpdate`), manda el texto de un subtítulo (`playerSubtitleData`)
//   y cierra (`playerClose`);
// - Android avisa con el evento `player` (ver `NativePlayerEvent`).
// En el navegador, o con un APK viejo (v0.19) que no lo tiene, `nativePlayerAvailable()` da falso y queda el
// reproductor de la web.

interface PluginListenerHandle {
  remove(): Promise<void> | void
}

/** Segundos desde el principio. */
export interface NativeSegment {
  start: number
  end: number
}

/** Un subtítulo externo (de un addon o los online en latino). El texto llega aparte, ya en VTT. */
export interface NativeSubOption {
  id: string
  label: string
  lang?: string
  latino?: boolean
  forced?: boolean
}

export interface NativeSubtitleStyle {
  size: 's' | 'm' | 'l' | 'xl'
  color: 'white' | 'yellow'
  background: 'none' | 'light' | 'semi' | 'solid'
  outline: boolean
  /** Cuánto más arriba del lugar normal, en % del alto. */
  position: 0 | 10 | 20
}

export interface NativePlayerOpen {
  url: string
  /** Peli o serie. */
  title: string
  /** "T1:E3 · Nombre del episodio" (solo series). */
  subtitle?: string
  /** Segundos. */
  startAt: number
  /** Arranca en pausa ("¿Seguís viendo?"). */
  paused?: boolean
  /** Idiomas de audio preferidos, en orden (ISO 639-1 o 639-2). */
  audioLangs: string[]
  rate?: number
  subtitleStyle: NativeSubtitleStyle
}

/** Lo que no viene, no cambia. */
export interface NativePlayerUpdate {
  intro?: NativeSegment | null
  recap?: NativeSegment | null
  /** off: sin botón; button: botón "Saltar"; auto: salta solo (una vez por segmento). */
  skipMode?: 'off' | 'button' | 'auto'
  /** Falso: el resumen no se salta solo aunque `skipMode` sea auto (hace mucho que no ve la serie). */
  recapAuto?: boolean
  /** Segundos: desde cuándo se muestra la tarjeta del siguiente episodio. `null`: no hay siguiente. */
  nextAt?: number | null
  /** "T1:E4 · Nombre". */
  nextLabel?: string
  /** Con la tarjeta a la vista, cuenta 10 s y pide el siguiente solo. */
  autoplayNext?: boolean
  /** Lista completa de los subtítulos externos. */
  subtitles?: NativeSubOption[]
  /** '' apaga; `emb:<grupo>:<pista>` es uno del video; otro id es externo (después llega `playerSubtitleData`). */
  selectSub?: string
  /** La web está buscando el siguiente episodio: la tarjeta dice "Cargando…". */
  loadingNext?: boolean
  /** Mensaje corto abajo (unos segundos). */
  toast?: string
}

export interface NativeAudioTrack {
  id: string
  label: string
  lang?: string
  selected: boolean
}

export interface NativeTextTrack {
  /** `emb:<grupo>:<pista>`. */
  id: string
  label: string
  lang?: string
  forced?: boolean
}

export type NativePlayerEvent =
  | { type: 'ready'; duration: number }
  | { type: 'progress'; position: number; duration: number; playing: boolean }
  | { type: 'tracks'; audio: NativeAudioTrack[]; text: NativeTextTrack[] }
  | { type: 'audioPicked'; lang?: string }
  | { type: 'subPicked'; id: string }
  | { type: 'next'; auto: boolean }
  | { type: 'ended' }
  | { type: 'closed'; position: number; duration: number }
  | { type: 'error'; message: string; position: number }

interface PlayerPlugin {
  getInfo(): Promise<{ tv?: boolean; version?: string; player?: boolean }>
  playerOpen(opts: NativePlayerOpen): Promise<void>
  playerUpdate(opts: NativePlayerUpdate): Promise<void>
  playerSubtitleData(opts: { id: string; vtt: string }): Promise<void>
  playerClose(): Promise<void>
  addListener(event: 'player', fn: (e: NativePlayerEvent) => void): Promise<PluginListenerHandle> | PluginListenerHandle
}

interface CapacitorLike {
  isNativePlatform?: () => boolean
  Plugins?: { SpNative?: PlayerPlugin }
}

function plugin(): PlayerPlugin | undefined {
  if (typeof window === 'undefined') return undefined
  const cap = (window as Window & { Capacitor?: CapacitorLike }).Capacitor
  return cap?.isNativePlatform?.() ? cap.Plugins?.SpNative : undefined
}

let available: boolean | undefined
let probe: Promise<boolean> | undefined

/** ¿El APK tiene el reproductor? (la v0.19 no). Se pregunta una vez. */
export function probeNativePlayer(): Promise<boolean> {
  if (available !== undefined) return Promise.resolve(available)
  const p = plugin()
  if (!p) return Promise.resolve((available = false))
  probe ??= p
    .getInfo()
    .then((info) => (available = info?.player === true))
    .catch(() => (available = false))
  return probe
}

/** Ya se sabe (sin esperar): `undefined` mientras se pregunta. */
export const nativePlayerAvailable = () => available

/** Solo para los tests. */
export function resetNativePlayerProbe() {
  available = undefined
  probe = undefined
}

const call = <T>(fn: (p: PlayerPlugin) => Promise<T>) => {
  const p = plugin()
  if (p) fn(p).catch(() => {})
}

export const nativePlayer = {
  open: (opts: NativePlayerOpen) => call((p) => p.playerOpen(opts)),
  update: (opts: NativePlayerUpdate) => call((p) => p.playerUpdate(opts)),
  subtitleData: (id: string, vtt: string) => call((p) => p.playerSubtitleData({ id, vtt })),
  close: () => call((p) => p.playerClose()),
  /** Devuelve la función para dejar de escuchar. */
  listen(fn: (e: NativePlayerEvent) => void): () => void {
    const p = plugin()
    if (!p) return () => {}
    let handle: PluginListenerHandle | undefined
    let removed = false
    Promise.resolve(p.addListener('player', fn))
      .then((h) => {
        handle = h
        if (removed) void Promise.resolve(h.remove()).catch(() => {})
      })
      .catch(() => {})
    return () => {
      removed = true
      if (handle) void Promise.resolve(handle.remove()).catch(() => {})
    }
  },
}

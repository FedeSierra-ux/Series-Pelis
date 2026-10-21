import { useEffect, useMemo, useState } from 'react'
import { desktopTorrentBase } from './desktop'
import { isNativeApp, listenNative, nativeInfo, type NativeInfo } from './native'
import { settingsStore, useStore } from './store'
import { canUseLocalStremio, ensureLocalStremio, localStremioBase, useLocalStremio, STREMIO_SERVER } from './stremioServer'

// Con qué se reproducen los torrents (infoHash sin url): el servidor de Stremio que puso el usuario en
// Ajustes, el motor de la app de Windows (v0.30), en la PC el de Stremio Service que se encuentra solo (v0.29)
// o, en la app de Android con su reproductor prendido, el motor de torrents de la app (v0.25).
// La URL del motor de Android es http a 127.0.0.1: la página (https) no la puede abrir, solo el reproductor
// nativo. La de Windows sí (la app deja que la página llegue a 127.0.0.1): la abre el reproductor de la web.

/** El servidor de torrents que vale ahora. */
export interface TorrentServer {
  /** Base: `http://127.0.0.1:11470` (Stremio) o `http://127.0.0.1:<puerto>/<token>` (motor). '' = no hay. */
  url: string
  /** Es el motor de la app: la URL lleva trackers y nombre de archivo, y solo la abre el reproductor nativo. */
  engine?: boolean
  /** Sin servidor: por qué no se puede abrir un torrent (para mostrarlo en la lista de fuentes). */
  missing?: string
}

export const TORRENT_NEEDS_PLAYER = 'Torrent: activá el reproductor de Android (Ajustes → Reproductor) o usá un addon con debrid'
export const TORRENT_NEEDS_PC = 'Torrent: abrí Stremio en la PC (servidor local) o usá un addon con debrid'
/** En la PC sin Stremio Service (v0.29): arriba de la lista va el aviso con la descarga. */
export const TORRENT_NEEDS_SERVICE = 'Torrent: necesita Stremio Service abierto en esta compu (ver el aviso de arriba) o un addon con debrid'
export const TORRENT_NEEDS_UPDATE = 'Torrent: actualizá la app de Android para reproducirlo sin debrid, o usá un addon con debrid'
export const TORRENT_LOADING = 'Torrent: el motor de la app todavía está arrancando; esperá unos segundos o usá un addon con debrid'

const LOOPBACK_RE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i

/** Base del motor que cuenta el APK, si la trae y además tiene el reproductor nativo (sin él no sirve). */
export function engineBaseOf(info: NativeInfo): string | undefined {
  if (info.player !== true || typeof info.torrent !== 'string') return undefined
  const base = info.torrent.trim().replace(/\/+$/, '')
  return LOOPBACK_RE.test(`${base}/`) ? base : undefined
}

export interface TorrentContext {
  /** `settings.streamingServerUrl`. */
  explicit: string
  /** Corre dentro de la app de Android. */
  native: boolean
  /** `settings.nativePlayer` (Ajustes → Reproductor → "Usar el reproductor de Android"). */
  nativePlayer: boolean
  /** Base del motor de la app (ver `engineBaseOf`). */
  engine?: string
  /** El APK todavía no dijo si tiene motor (está arrancando): no es un APK viejo. */
  pending?: boolean
  /** v0.29: navegador de una compu (ahí se busca Stremio Service). */
  pc?: boolean
  /** v0.29: base de Stremio Service si se encontró en esta compu. */
  local?: string
  /** v0.30: base del motor de la app de Windows. */
  desktop?: string
}

/**
 * Elige el servidor: el que puso el usuario, si no el motor de la app de Windows, el de la de Android (con su
 * reproductor), Stremio Service en la compu, si no ninguno.
 */
export function pickTorrentServer(c: TorrentContext): TorrentServer {
  const explicit = c.explicit.trim()
  if (explicit) return { url: explicit }
  if (c.desktop) return { url: c.desktop }
  if (c.native && c.nativePlayer && c.engine) return { url: c.engine, engine: true }
  if (!c.native && c.local) return { url: c.local }
  if (!c.native) return { url: '', missing: c.pc ? TORRENT_NEEDS_SERVICE : TORRENT_NEEDS_PC }
  // APK con motor pero el reproductor de Android apagado; un APK viejo (sin motor) pide actualizar. Mientras
  // el motor arranca no se sabe todavía: nunca "actualizá la app" por eso.
  return { url: '', missing: c.engine ? TORRENT_NEEDS_PLAYER : c.pending ? TORRENT_LOADING : TORRENT_NEEDS_UPDATE }
}

// ---------- Estado: lo que contó el APK (se pregunta hasta que lo sabe) ----------

let engine: string | undefined
/** Ya respondió el APK (con motor o sin él). Con `torrentLoading` todavía no. */
let known = false
let probe: Promise<void> | undefined
const listeners = new Set<() => void>()

/** Mientras el motor arranca: se vuelve a preguntar cada `RETRY_MS` o apenas avisa `torrentReady`. */
export const ENGINE_RETRY_MS = 1000
/** Tras tantas vueltas se deja de insistir (sigue "arrancando"); el próximo pedido pregunta de nuevo. */
export const ENGINE_MAX_TRIES = 30

function setState(nextEngine: string | undefined, nextKnown: boolean) {
  if (nextEngine === engine && nextKnown === known) return
  engine = nextEngine
  known = nextKnown
  listeners.forEach((fn) => fn())
}

/** Espera el aviso del APK o `ms`, lo que pase primero. */
function waitReady(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let off = () => {}
    const done = () => {
      clearTimeout(timer)
      off()
      resolve()
    }
    const timer = setTimeout(done, ms)
    off = listenNative('torrentReady', done)
  })
}

async function ask(): Promise<void> {
  for (let tries = 1; ; tries++) {
    let info: NativeInfo
    try {
      info = await nativeInfo()
    } catch {
      info = {}
    }
    if (!info.torrentLoading) {
      setState(engineBaseOf(info), true)
      return
    }
    if (tries >= ENGINE_MAX_TRIES) {
      probe = undefined
      return
    }
    await waitReady(ENGINE_RETRY_MS)
  }
}

function probeEngine(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve()
  probe ??= ask()
  return probe
}

/** Solo para los tests. */
export function resetTorrentEngine() {
  engine = undefined
  known = false
  probe = undefined
}

/** El servidor que vale ahora, sin esperar (fuera de React). Arranca la pregunta al APK si hace falta. */
export function torrentServer(): TorrentServer {
  void probeEngine()
  const s = settingsStore.get()
  const native = isNativeApp()
  return pickTorrentServer({
    explicit: s.streamingServerUrl,
    native,
    nativePlayer: s.nativePlayer,
    engine,
    pending: native && !known,
    pc: canUseLocalStremio(),
    local: localStremioBase(),
    desktop: desktopTorrentBase(),
  })
}

/**
 * Igual que `torrentServer`, pero espera la respuesta del APK (para elegir el siguiente episodio). En la PC, sin
 * servidor puesto a mano, también espera la búsqueda de Stremio Service.
 */
export async function torrentServerReady(): Promise<TorrentServer> {
  await probeEngine()
  if (!settingsStore.get().streamingServerUrl.trim()) await ensureLocalStremio()
  return torrentServer()
}

/** Lo que se sabe del motor, para los hooks: se vuelve a dibujar con cada cambio. */
function useEngineState(): { base: string | undefined; known: boolean } {
  const [state, setLocal] = useState(() => ({ base: engine, known }))
  useEffect(() => {
    let alive = true
    const update = () => {
      if (alive) setLocal((prev) => (prev.base === engine && prev.known === known ? prev : { base: engine, known }))
    }
    listeners.add(update)
    update()
    void probeEngine().then(update)
    return () => {
      alive = false
      listeners.delete(update)
    }
  }, [])
  return state
}

/** Hook: base del motor de la app (o `undefined`: navegador, APK viejo o todavía no respondió). */
export function useTorrentEngine(): string | undefined {
  return useEngineState().base
}

/** Hook: el servidor que vale ahora; se vuelve a dibujar cuando responde el APK, Stremio Service o cambian los ajustes. */
export function useTorrentServer(): TorrentServer {
  const { streamingServerUrl: explicit, nativePlayer } = useStore(settingsStore)
  const { base, known: answered } = useEngineState()
  const native = isNativeApp()
  const pending = native && !answered
  const local = useLocalStremio()
  const pc = local !== 'off'
  const localBase = local === 'found' ? STREMIO_SERVER : undefined
  // La app de Windows lo cuenta al cargar la página: no cambia.
  const desktop = desktopTorrentBase()
  // Mismo objeto mientras no cambie nada: lo usan dependencias de `useMemo`.
  return useMemo(
    () => pickTorrentServer({ explicit, native, nativePlayer, engine: base, pending, pc, local: localBase, desktop }),
    [explicit, native, nativePlayer, base, pending, pc, localBase, desktop],
  )
}

/**
 * ¿Esta URL solo la puede abrir el reproductor de Android? Las del motor de la app (http a 127.0.0.1 desde una
 * página https): el de la web no puede, así que no tiene sentido pasarle el video si falla el nativo.
 */
export function needsNativePlayer(url: string): boolean {
  if (engine) return url.startsWith(`${engine}/`)
  // El APK todavía no respondió: en la app, cualquier http a la propia máquina. Sin motor (APK viejo), ninguna.
  return !known && isNativeApp() && LOOPBACK_RE.test(url)
}

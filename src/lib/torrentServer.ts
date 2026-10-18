import { useEffect, useMemo, useState } from 'react'
import { isNativeApp, nativeInfo, type NativeInfo } from './native'
import { settingsStore, useStore } from './store'

// Con qué se reproducen los torrents (infoHash sin url): el servidor de Stremio que puso el usuario en
// Ajustes o, en la app de Android con su reproductor prendido, el motor de torrents de la app (v0.25).
// La URL del motor es http a 127.0.0.1: la página (https) no la puede abrir, solo el reproductor nativo.

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
export const TORRENT_NEEDS_UPDATE = 'Torrent: actualizá la app de Android para reproducirlo sin debrid, o usá un addon con debrid'

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
}

/** Elige el servidor: el que puso el usuario, si no el motor de la app (con su reproductor), si no ninguno. */
export function pickTorrentServer(c: TorrentContext): TorrentServer {
  const explicit = c.explicit.trim()
  if (explicit) return { url: explicit }
  if (c.native && c.nativePlayer && c.engine) return { url: c.engine, engine: true }
  if (!c.native) return { url: '', missing: TORRENT_NEEDS_PC }
  // APK con motor pero el reproductor de Android apagado; un APK viejo (sin motor) pide actualizar.
  return { url: '', missing: c.engine ? TORRENT_NEEDS_PLAYER : TORRENT_NEEDS_UPDATE }
}

// ---------- Estado: lo que contó el APK (se pregunta una vez) ----------

let engine: string | undefined
/** Ya respondió el APK (con motor o sin él). */
let known = false
let probe: Promise<void> | undefined
const listeners = new Set<() => void>()

function probeEngine(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve()
  probe ??= nativeInfo().then(
    (info) => {
      engine = engineBaseOf(info)
      known = true
      if (engine) listeners.forEach((fn) => fn())
    },
    () => {
      known = true
    },
  )
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
  return pickTorrentServer({ explicit: s.streamingServerUrl, native: isNativeApp(), nativePlayer: s.nativePlayer, engine })
}

/** Igual que `torrentServer`, pero espera la respuesta del APK (para elegir el siguiente episodio). */
export async function torrentServerReady(): Promise<TorrentServer> {
  await probeEngine()
  return torrentServer()
}

/** Hook: base del motor de la app (o `undefined`: navegador, APK viejo o todavía no respondió). */
export function useTorrentEngine(): string | undefined {
  const [base, setBase] = useState(engine)
  useEffect(() => {
    let alive = true
    const update = () => {
      if (alive) setBase(engine)
    }
    listeners.add(update)
    void probeEngine().then(update)
    return () => {
      alive = false
      listeners.delete(update)
    }
  }, [])
  return base
}

/** Hook: el servidor que vale ahora; se vuelve a dibujar cuando responde el APK o cambian los ajustes. */
export function useTorrentServer(): TorrentServer {
  const { streamingServerUrl: explicit, nativePlayer } = useStore(settingsStore)
  const base = useTorrentEngine()
  const native = isNativeApp()
  // Mismo objeto mientras no cambie nada: lo usan dependencias de `useMemo`.
  return useMemo(() => pickTorrentServer({ explicit, native, nativePlayer, engine: base }), [explicit, native, nativePlayer, base])
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

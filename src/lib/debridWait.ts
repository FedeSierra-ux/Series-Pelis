import { normalizeInfoHash } from './addons'
import { isDebridDownload, looksLikeStatusVideo, parseDebridLink, type DebridLink } from './debrid'
import type { AddonStreams, InstalledAddon, Stream } from './types'

// v0.30: torrents por TorBox en el navegador (sin servidor de torrents: ni la app de Android con su motor ni
// Stremio en la PC). Lo que TorBox todavía no tiene ("[TB download]") no se puede ver por torrent mientras lo
// baja: se le pide la descarga y se espera. El navegador no puede leer adónde redirige el link (sin CORS ni
// `Location` legible), así que se lo abre de a ratos con un <video> escondido y mudo, solo los metadatos:
// mientras TorBox lo baja, Torrentio contesta con su video de aviso de 30 s; cuando lo tiene, con el video de
// verdad (que dura más). Nada de proxys: es el mismo pedido que haría el reproductor.

/** El primer vistazo va enseguida: la lista de "[TB download]" puede estar vieja y TorBox ya tenerlo. */
export const DEBRID_FIRST_POLL_MS = 5_000
/** Después, cada tanto. Torrentio guarda la respuesta "bajando" 1 minuto: más seguido no sirve. */
export const DEBRID_POLL_MS = 25_000
/** Un vistazo sin metadatos ni error en este tiempo no dice nada (se prueba en la vuelta siguiente). */
export const DEBRID_PROBE_TIMEOUT_MS = 20_000
/** Tope de la espera: después se ofrece "Probar de nuevo". */
export const DEBRID_WAIT_MAX_MS = 30 * 60_000
/**
 * Vistazos seguidos en los que el navegador no pudo leer el archivo para darlo por listo. El aviso de Torrentio
 * es un MP4 que cualquier navegador lee: si no se puede leer, casi seguro ya es el video (un MKV que el
 * navegador no entiende). Dos seguidos, así un corte de red suelto no cuenta.
 */
export const UNREADABLE_TO_PLAY = 2

/** Lo que dijo un vistazo al link. */
export type ProbeResult =
  | { kind: 'duration'; duration: number }
  /** El navegador no pudo con el archivo (formato o un error del servidor: no se puede distinguir). */
  | { kind: 'unreadable' }
  /** Sin conexión. */
  | { kind: 'offline' }
  /** No llegó nada a tiempo. */
  | { kind: 'timeout' }

/** `ready`: TorBox ya lo tiene. `status`: el aviso de 30 s (lo está bajando o algo falló). */
export function probeVerdict(r: ProbeResult): 'ready' | 'status' | 'unknown' {
  if (r.kind !== 'duration') return 'unknown'
  if (looksLikeStatusVideo(r.duration)) return 'status'
  // Infinity (sin largo en la cabecera) tampoco es el aviso, que siempre trae su largo.
  return r.duration > 0 ? 'ready' : 'unknown'
}

export interface WaitState {
  /** Cuándo empezó la espera (ms). */
  startedAt: number
  /** Vistazos hechos. */
  probes: number
  /** Vistazos seguidos que no se pudieron leer. */
  unreadable: number
}

export type WaitStep = { action: 'play' } | { action: 'wait'; delay: number } | { action: 'give-up' }

export const startWait = (now: number): WaitState => ({ startedAt: now, probes: 0, unreadable: 0 })

/** Cuánto esperar antes del próximo vistazo. */
export function pollDelay(probes: number): number {
  return probes === 0 ? DEBRID_FIRST_POLL_MS : DEBRID_POLL_MS
}

/** Qué hacer después de un vistazo: reproducir, esperar otra vuelta o rendirse (pasó el tope). */
export function nextWaitStep(state: WaitState, result: ProbeResult, now: number): { state: WaitState; step: WaitStep } {
  const verdict = probeVerdict(result)
  const unreadable = result.kind === 'unreadable' ? state.unreadable + 1 : result.kind === 'duration' ? 0 : state.unreadable
  const next: WaitState = { ...state, probes: state.probes + 1, unreadable }
  if (verdict === 'ready' || unreadable >= UNREADABLE_TO_PLAY) return { state: next, step: { action: 'play' } }
  const delay = pollDelay(next.probes)
  if (now + delay - state.startedAt > DEBRID_WAIT_MAX_MS) return { state: next, step: { action: 'give-up' } }
  return { state: next, step: { action: 'wait', delay } }
}

/** "4:05", "1:02:03": cuánto hace que espera. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// ---------- El vistazo (con un <video> escondido) ----------

/** Lo que se usa del <video> (así se puede probar sin navegador). */
export type ProbeVideo = Pick<HTMLVideoElement, 'addEventListener' | 'removeEventListener' | 'removeAttribute' | 'load' | 'play' | 'pause' | 'duration' | 'readyState' | 'error'> & {
  src: string
  muted: boolean
  preload: string
  playsInline: boolean
}

/** Si a los tantos ms el navegador todavía no pidió nada (Safari en el iPhone ignora `preload`), se le da play mudo. */
const KICK_MS = 4000

/**
 * Abre el link en un <video> mudo y escondido, lee el largo y lo suelta (no baja el video entero). `make` da el
 * <video> (fuera de los tests, uno nuevo pegado a `host` si lo hay, así Safari lo carga).
 */
export function probeDebridLink(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; make?: () => ProbeVideo; host?: HTMLElement | null; online?: () => boolean } = {},
): Promise<ProbeResult> {
  const { timeoutMs = DEBRID_PROBE_TIMEOUT_MS, signal, host, online = () => typeof navigator === 'undefined' || navigator.onLine !== false } = opts
  if (!online()) return Promise.resolve({ kind: 'offline' })
  const make =
    opts.make ??
    (() => {
      const v = document.createElement('video')
      v.hidden = true
      v.setAttribute('aria-hidden', 'true')
      host?.appendChild(v)
      return v
    })
  return new Promise((resolve) => {
    const v = make()
    let done = false
    const finish = (r: ProbeResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(kick)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta)
      v.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      // Soltarlo: sin `src` el navegador corta la descarga.
      try {
        v.pause()
        v.removeAttribute('src')
        v.load()
      } catch {
        // Nada: el elemento se descarta igual.
      }
      ;(v as unknown as { remove?: () => void }).remove?.()
      resolve(r)
    }
    const onMeta = () => {
      const d = v.duration
      // NaN: todavía no se sabe (puede llegar con `durationchange`).
      if (!Number.isNaN(d)) finish({ kind: 'duration', duration: d })
    }
    const onError = () => finish(online() ? { kind: 'unreadable' } : { kind: 'offline' })
    const onAbort = () => finish({ kind: 'timeout' })
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs)
    const kick = setTimeout(() => {
      if (!done && v.readyState === 0) v.play().catch(() => {})
    }, KICK_MS)
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta)
    v.addEventListener('error', onError)
    v.muted = true
    v.playsInline = true
    v.preload = 'metadata'
    v.src = url
  })
}

// ---------- El gemelo de debrid de un torrent ----------

/** Un link de debrid que es el mismo archivo que el torrent. */
export interface DebridTwin {
  addon: InstalledAddon
  stream: Stream
}

/**
 * ¿Este link es el mismo archivo del torrent? Mismo hash y mismo índice; si alguno de los dos no sabe el índice,
 * alcanza con el hash (como `torrentTwin` en el otro sentido).
 */
function sameFile(link: DebridLink, torrent: Stream): boolean {
  if (!torrent.infoHash || link.infoHash !== normalizeInfoHash(torrent.infoHash)) return false
  return link.fileIdx === undefined || torrent.fileIdx === undefined || link.fileIdx === torrent.fileIdx
}

/**
 * El link de debrid (Torrentio con TorBox) del mismo torrent, entre las fuentes del título. Primero el del mismo
 * índice; entre iguales, lo que TorBox ya tiene antes que lo que tiene que bajar. Solo para torrents sin url.
 */
export function debridTwinOf(torrent: Stream, groups: AddonStreams[]): DebridTwin | undefined {
  if (!torrent.infoHash || torrent.url) return undefined
  let best: { twin: DebridTwin; score: number } | undefined
  for (const g of groups) {
    if (!Array.isArray(g.streams)) continue
    for (const s of g.streams) {
      const link = parseDebridLink(s.url)
      if (!link || !s.url || !sameFile(link, torrent)) continue
      const score = (link.fileIdx === torrent.fileIdx ? 2 : 0) + (isDebridDownload(s) ? 0 : 1)
      if (!best || score > best.score) best = { twin: { addon: g.addon, stream: s }, score }
    }
  }
  return best?.twin
}

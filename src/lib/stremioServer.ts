import { useEffect, useState } from 'react'
import { fetchWithTimeout } from './abort'
import { isDesktopApp } from './desktop'
import { isNativeApp } from './native'
import { currentPlatform, resolveTvMode } from './platform'
import { settingsStore } from './store'

// v0.29: torrents sin debrid en el navegador de la PC, como Stremio Web. El navegador no puede hablar BitTorrent:
// lo hace Stremio Service (o Stremio abierto), que deja un servidor en http://127.0.0.1:11470. Una página https
// lo puede pedir porque 127.0.0.1 cuenta como "de confianza" (no es contenido mixto); Chrome pregunta una vez si
// el sitio puede acceder a las apps del aparato.
// - Se busca solo en la PC (no en el celular, la TV ni la app de Android) y recién cuando hace falta (hay
//   torrents en la lista), así el permiso de Chrome no aparece de la nada.
// - El servidor convierte (HLS) lo que el navegador no puede: MKV/x265/AC3/5.1. Mismo criterio que Stremio Web
//   (`stremio-video`): se pregunta qué trae el archivo (`/hlsv2/probe`) y, si no se puede directo, se pide la
//   versión convertida (`/hlsv2/<id>/master.m3u8`).

/** Servidor que deja Stremio Service (y Stremio de escritorio) en la propia compu. */
export const STREMIO_SERVER = 'http://127.0.0.1:11470'
/** Página oficial para bajar Stremio Service (Windows, Mac y Linux). */
export const STREMIO_SERVICE_URL = 'https://www.stremio.com/download-service'

// ---------- Lógica pura ----------

/** ¿Es una compu (no celular, tablet ni TV) y fuera de la app de Android? Ahí se busca Stremio Service. */
export function isPcBrowser(c: { os: string; tv: boolean; tvMode: boolean; native: boolean }): boolean {
  return !c.native && !c.tv && !c.tvMode && (c.os === 'windows' || c.os === 'mac' || c.os === 'linux')
}

/** `<servidor>/<infoHash>/<archivo>` → sus partes (lo arma `streamingServerUrl`). Otra URL: `undefined`. */
export function splitServerUrl(url: string): { base: string; hash: string; fileIdx?: number } | undefined {
  const m = /^(https?:\/\/[^?#]+?)\/([0-9a-f]{40})\/(-?\d+)\/?(?:[?#].*)?$/i.exec(url)
  if (!m) return undefined
  const idx = Number(m[3])
  return { base: m[1], hash: m[2].toLowerCase(), fileIdx: idx >= 0 ? idx : undefined }
}

/** Fuentes de pares para el servidor: la DHT y los trackers del addon (`tracker:…`), sin repetidos. */
export function peerSources(hash: string, sources: readonly unknown[] = []): string[] {
  const out = [`dht:${hash}`]
  for (const src of sources) {
    if (typeof src !== 'string') continue
    const s = src.trim()
    if (!s) continue
    const entry = s.startsWith('tracker:') || s.startsWith('dht:') ? s : `tracker:${s}`
    if (!out.includes(entry)) out.push(entry)
  }
  return out
}

export interface CreateBody {
  torrent: { infoHash: string }
  peerSearch: { sources: string[]; min: number; max: number }
  /** `false` = ya se sabe el archivo; si no, el servidor lo adivina (con temporada y episodio en las series). */
  guessFileIdx: false | { season?: number; episode?: number }
}

/** Cuerpo de `POST /<infoHash>/create`, igual que el de Stremio Web. */
export function createBody(hash: string, fileIdx: number | undefined, sources: readonly unknown[] = [], video?: { season?: number; episode?: number }): CreateBody {
  const guess: { season?: number; episode?: number } = {}
  if (video && Number.isFinite(video.season)) guess.season = video.season
  if (video && Number.isFinite(video.episode)) guess.episode = video.episode
  return {
    torrent: { infoHash: hash },
    peerSearch: { sources: peerSources(hash, sources), min: 40, max: 200 },
    guessFileIdx: fileIdx === undefined ? guess : false,
  }
}

/** Qué puede reproducir este navegador sin ayuda. */
export interface MediaCaps {
  /** Contenedores (`format.name` de ffprobe contiene alguno). */
  formats: string[]
  videoCodecs: string[]
  audioCodecs: string[]
  maxAudioChannels: number
}

const VIDEO_CODECS: { codec: string[]; mime: string; chromeForced?: boolean }[] = [
  { codec: ['h264'], mime: 'video/mp4; codecs="avc1.42E01E"', chromeForced: true },
  // Chrome dice que sí a HEVC pero solo con aceleración de hardware: igual que Stremio, no se fuerza.
  { codec: ['h265', 'hevc'], mime: 'video/mp4; codecs="hev1.1.6.L150.B0"' },
  { codec: ['vp8'], mime: 'video/mp4; codecs="vp8"' },
  { codec: ['vp9'], mime: 'video/mp4; codecs="vp9"' },
]

const AUDIO_CODECS: { codec: string; mime: string }[] = [
  { codec: 'aac', mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { codec: 'mp3', mime: 'audio/mp4; codecs="mp3"' },
  { codec: 'ac3', mime: 'audio/mp4; codecs="ac-3"' },
  { codec: 'eac3', mime: 'audio/mp4; codecs="ec-3"' },
  { codec: 'vorbis', mime: 'audio/mp4; codecs="vorbis"' },
  { codec: 'opus', mime: 'audio/mp4; codecs="opus"' },
]

/**
 * Capacidades a partir de `canPlayType`. Chrome (y Edge) abren MKV y siempre H.264; con más de 2 canales Chrome
 * no mezcla bien, así que el 5.1 se pasa a estéreo. Firefox sí baja el 5.1 (hasta 6 canales).
 */
export function mediaCapsFrom(c: { canPlay: (mime: string) => boolean; chrome: boolean; firefox: boolean }): MediaCaps {
  const videoCodecs = VIDEO_CODECS.flatMap((v) => ((c.chrome && v.chromeForced) || c.canPlay(v.mime) ? v.codec : []))
  const audioCodecs = AUDIO_CODECS.flatMap((a) => (c.canPlay(a.mime) ? [a.codec] : []))
  return {
    formats: c.chrome ? ['mp4', 'matroska,webm'] : ['mp4'],
    videoCodecs,
    audioCodecs,
    maxAudioChannels: c.firefox ? 6 : 2,
  }
}

/** Lo que devuelve `/hlsv2/probe` (solo lo que se usa). */
export interface MediaProbe {
  format?: { name?: string; duration?: number }
  streams?: {
    track?: string
    codec?: string
    channels?: number
    language?: string | null
    /** v0.30.1, solo el motor de la app de Windows: índice de ffprobe, nombre de la pista y marcas. */
    index?: number
    title?: string | null
    forced?: boolean
    sdh?: boolean
  }[]
}

/**
 * ¿Se puede reproducir el archivo tal cual? Contenedor y códecs que entiende el navegador, audio con pocos canales
 * y una sola pista de audio (con dos, el navegador no deja elegir: el latino iría por HLS, donde sí se elige).
 * A diferencia de Stremio Web, los subtítulos dentro del archivo no obligan a convertir: los de Flix vienen de los
 * addons y de SubDL/OpenSubtitles.
 */
export function canPlayDirect(probe: MediaProbe, caps: MediaCaps): boolean {
  const name = probe.format?.name ?? ''
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  if (!name || !caps.formats.some((f) => name.includes(f))) return false
  const audio = streams.filter((s) => s.track === 'audio')
  const video = streams.filter((s) => s.track === 'video')
  if (video.length === 0 && audio.length === 0) return false
  if (!video.every((s) => !!s.codec && caps.videoCodecs.includes(s.codec))) return false
  if (!audio.every((s) => !!s.codec && caps.audioCodecs.includes(s.codec) && (s.channels ?? 2) <= caps.maxAudioChannels)) return false
  return audio.length < 2
}

/** Versión convertida (HLS) del archivo: el servidor pasa a lo que entiende el navegador solo lo que haga falta. */
export function hlsUrl(base: string, mediaUrl: string, caps: MediaCaps, id: string): string {
  const q = new URLSearchParams([['mediaURL', mediaUrl]])
  for (const v of caps.videoCodecs) q.append('videoCodecs', v)
  // Sin ninguno (un navegador raro): AAC, que el servidor siempre puede hacer y todos reproducen.
  for (const a of caps.audioCodecs.length ? caps.audioCodecs : ['aac']) q.append('audioCodecs', a)
  q.set('maxAudioChannels', String(caps.maxAudioChannels))
  return `${base.replace(/\/+$/, '')}/hlsv2/${encodeURIComponent(id)}/master.m3u8?${q.toString()}`
}

/** Lo que importa de `/<infoHash>/stats.json` mientras se conecta. */
export function torrentProgress(stats: unknown): { peers: number; speed: number } {
  const s = (stats ?? {}) as { peers?: unknown; downloadSpeed?: unknown }
  const peers = typeof s.peers === 'number' && Number.isFinite(s.peers) ? Math.max(0, Math.round(s.peers)) : 0
  const speed = typeof s.downloadSpeed === 'number' && Number.isFinite(s.downloadSpeed) ? Math.max(0, s.downloadSpeed) : 0
  return { peers, speed }
}

/** Bytes por segundo → "850 KB/s" / "1,2 MB/s". */
export function formatSpeed(bps: number): string {
  if (bps < 1024 * 1024) return `${Math.max(0, Math.round(bps / 1024))} KB/s`
  return `${(bps / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB/s`
}

/** ¿La respuesta de `/settings` es de un servidor de Stremio? */
export function looksLikeStremio(body: unknown): boolean {
  const b = body as { values?: { serverVersion?: unknown }; options?: unknown } | null
  return !!b && typeof b === 'object' && (typeof b.values?.serverVersion === 'string' || Array.isArray(b.options))
}

// ---------- Estado: ¿hay Stremio Service en esta compu? ----------

export type LocalStremio = 'off' | 'unknown' | 'checking' | 'found' | 'missing'

/** La última vez estaba: se da por hecho (las fuentes se ven listas enseguida) y se confirma por atrás. */
const FOUND_KEY = 'sp-stremio-local'
const PROBE_TIMEOUT_MS = 3000

let state: LocalStremio | undefined
let probing: Promise<void> | undefined
/** Ya se buscó en esta página (un 'found' guardado de antes todavía no está confirmado). */
let confirmed = false
let watching = false
const listeners = new Set<() => void>()

function rememberFound(found: boolean) {
  try {
    if (found) localStorage.setItem(FOUND_KEY, '1')
    else localStorage.removeItem(FOUND_KEY)
  } catch {
    // Sin localStorage: se vuelve a buscar en cada apertura.
  }
}

function wasFound(): boolean {
  try {
    return localStorage.getItem(FOUND_KEY) === '1'
  } catch {
    return false
  }
}

/** ¿En este aparato tiene sentido buscar Stremio Service? En la app de Windows no: trae su propio motor (v0.30). */
export function canUseLocalStremio(): boolean {
  if (typeof window === 'undefined') return false
  const p = currentPlatform()
  const app = isNativeApp() || isDesktopApp()
  return isPcBrowser({ os: p.os, tv: p.tv, tvMode: resolveTvMode(settingsStore.get().tvMode, p.tv), native: app })
}

function setLocal(next: LocalStremio) {
  if (next === state) return
  state = next
  listeners.forEach((fn) => fn())
}

/** Estado actual, sin buscar. */
export function localStremio(): LocalStremio {
  if (state === undefined) state = canUseLocalStremio() ? (wasFound() ? 'found' : 'unknown') : 'off'
  return state
}

/** Base del servidor local si está (o estaba la última vez y todavía no se confirmó). */
export function localStremioBase(): string | undefined {
  return localStremio() === 'found' ? STREMIO_SERVER : undefined
}

async function probeOnce(): Promise<void> {
  const before = localStremio()
  // Si se daba por hecho, no se pasa por "buscando" (las fuentes no saltan).
  if (before !== 'found') setLocal('checking')
  let ok = false
  try {
    const res = await fetchWithTimeout(`${STREMIO_SERVER}/settings`, { timeoutMs: PROBE_TIMEOUT_MS })
    ok = res.ok && looksLikeStremio(await res.json().catch(() => null))
  } catch {
    // No está, o el navegador no dejó (permiso de Chrome rechazado): para la app es lo mismo.
  }
  rememberFound(ok)
  setLocal(ok ? 'found' : 'missing')
}

/** Al volver a la pestaña (por ejemplo, después de instalar Stremio Service) se busca de nuevo si no estaba. */
function watchVisibility() {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state === 'missing') void ensureLocalStremio(true)
  })
}

/**
 * Busca Stremio Service (una vez por página; `force` = "Probar de nuevo"). Fuera de la PC no hace nada.
 * Se llama recién cuando hace falta: hay torrents en la lista o se va a abrir uno.
 */
export function ensureLocalStremio(force = false): Promise<void> {
  if (localStremio() === 'off') return Promise.resolve()
  watchVisibility()
  if (probing) return probing
  if (!force && (state === 'missing' || (state === 'found' && confirmed))) return Promise.resolve()
  probing = probeOnce().finally(() => {
    probing = undefined
    confirmed = true
  })
  return probing
}

/** El servidor dejó de responder (se cerró Stremio Service): las fuentes vuelven a mostrar el aviso. */
export function markLocalStremioMissing() {
  if (localStremio() === 'off') return
  rememberFound(false)
  setLocal('missing')
}

/** Hook: estado de Stremio Service; se vuelve a dibujar cuando cambia. `active` = buscarlo si todavía no se sabe. */
export function useLocalStremio(active = false): LocalStremio {
  const [value, setValue] = useState(localStremio)
  useEffect(() => {
    const update = () => setValue(localStremio())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])
  useEffect(() => {
    if (active) void ensureLocalStremio()
  }, [active])
  return value
}

/** Solo para los tests. */
export function resetLocalStremio() {
  state = undefined
  probing = undefined
  confirmed = false
  listeners.clear()
}

// ---------- Capacidades del navegador ----------

let caps: MediaCaps | undefined

/** Qué reproduce este navegador (se calcula una vez). */
export function browserMediaCaps(): MediaCaps {
  if (caps) return caps
  const el = typeof document !== 'undefined' ? document.createElement('video') : undefined
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  caps = mediaCapsFrom({
    canPlay: (mime) => !!el && typeof el.canPlayType === 'function' && el.canPlayType(mime) !== '',
    chrome: typeof window !== 'undefined' && 'chrome' in window,
    firefox: /firefox/i.test(ua),
  })
  return caps
}

/** Id corto para la sesión de conversión (el servidor la reusa mientras el id no cambie). */
export function transcodeId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- Qué hace falta antes de reproducir ----------

/** Lo que el reproductor prepara con el servidor de Stremio antes de abrir el video. */
export type ServerPlan =
  /** Torrent: crearlo con sus trackers (y adivinar el archivo si no se sabe), después ver el formato. */
  | { kind: 'torrent'; base: string; hash: string; fileIdx?: number; sources: readonly unknown[] }
  /** Link directo que el navegador seguramente no abre (MKV/HEVC): solo ver el formato y convertir si hace falta. */
  | { kind: 'direct'; base: string; mediaUrl: string }

/**
 * ¿Pasa por el servidor de Stremio? Los torrents que abre un servidor de Stremio (no el motor de Android), y con
 * Stremio Service en la compu (`local`), también los links que el addon marca `notWebReady`.
 */
export function serverPlan(
  s: { infoHash?: string; url?: string; sources?: readonly unknown[]; behaviorHints?: { notWebReady?: boolean } },
  playUrl: string,
  local?: string,
): ServerPlan | undefined {
  if (s.infoHash && !s.url) {
    const parts = splitServerUrl(playUrl)
    return parts && { kind: 'torrent', ...parts, sources: s.sources ?? [] }
  }
  if (local && s.url && s.behaviorHints?.notWebReady && /^https?:\/\//i.test(playUrl) && !playUrl.startsWith(`${local}/`)) {
    return { kind: 'direct', base: local, mediaUrl: playUrl }
  }
  return undefined
}

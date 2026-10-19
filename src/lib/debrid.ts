import type { PlayState } from '../pages/Detail'
import { getAddonStreams, normalizeInfoHash, streamingServerUrl } from './addons'
import { sameAddon } from './addonKey'
import type { TorrentServer } from './torrentServer'
import type { InstalledAddon, Stream } from './types'

// v0.27: debrid con TorBox a través de Torrentio. La key va dentro de la URL del addon (la carga el admin); la app
// nunca la guarda aparte ni la manda a ningún lado que no sea el propio Torrentio. Lo que sabe hacer:
// - Sacar el infoHash del link de debrid (`…/resolve/torbox/<key>/<hash>/<entrada>/<índice>/<archivo>`).
// - Pedirle al mismo Torrentio, sin TorBox, el torrent de ese hash (trae trackers e índice del archivo).
// - Darse cuenta de que el debrid falló: Torrentio no devuelve un error sino un video de aviso de 30 s.
// Nada de proxys ni cabeceras falsas: se usa solo lo que devuelve el addon.

/** Lo que se lee del link de debrid de Torrentio. */
export interface DebridLink {
  /** `torbox`, `realdebrid`… (como lo escribe Torrentio en la URL). */
  service: string
  infoHash: string
  /** Índice del archivo dentro del torrent; `undefined` si Torrentio no lo sabe. */
  fileIdx?: number
}

const RESOLVE_RE = /^\/resolve\/([a-z]+)\/[^/]+\/([0-9a-f]{40})\/[^/]+\/([^/]+)(?:\/|$)/i

/** Lee un link `…/resolve/<servicio>/<key>/<hash>/<entrada>/<índice>[/<archivo>]` de Torrentio. Otro formato: nada. */
export function parseDebridLink(url: string | undefined): DebridLink | undefined {
  if (!url) return undefined
  let path: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined
    path = u.pathname
  } catch {
    return undefined
  }
  const m = RESOLVE_RE.exec(path)
  if (!m) return undefined
  const idx = /^\d+$/.test(m[3]) ? Number(m[3]) : undefined
  return { service: m[1].toLowerCase(), infoHash: m[2].toLowerCase(), fileIdx: idx }
}

/** `[TB download] …`: TorBox todavía no lo tiene; al abrir el link, lo empieza a bajar. */
const DOWNLOAD_NAME_RE = /\[[a-z]+ download\]/i

export function isDebridDownload(s: Stream): boolean {
  return DOWNLOAD_NAME_RE.test(s.name ?? '') && !!parseDebridLink(s.url)
}

/** Torrentio (cualquiera de sus variantes: lite, brazuca…). */
export function isTorrentio(addon: Pick<InstalledAddon, 'manifest'>): boolean {
  return /^com\.stremio\.torrentio\b/.test(addon.manifest.id)
}

/** Claves de la configuración de Torrentio que tienen que ver con el debrid (la key y sus opciones). */
const DEBRID_CONFIG_KEYS = new Set(['realdebrid', 'premiumize', 'alldebrid', 'debridlink', 'easydebrid', 'offcloud', 'torbox', 'putio', 'highway', 'debridoptions'])

/**
 * La URL del mismo Torrentio sin debrid: misma configuración (proveedores, idiomas, filtros) sin la key.
 * `https://torrentio.strem.fun/providers=yts|torbox=<KEY>/manifest.json` → `…/providers=yts/manifest.json`.
 * `undefined` si no es una URL de Torrentio con debrid.
 */
export function plainTorrentioUrl(transportUrl: string): string | undefined {
  let u: URL
  try {
    u = new URL(transportUrl)
  } catch {
    return undefined
  }
  const m = /^\/([^/]+)\/manifest\.json$/.exec(u.pathname)
  if (!m) return undefined
  // Se trabaja sobre el texto tal cual (sin decodificar ni volver a codificar lo que queda).
  const parts = m[1].split(/\||%7C/i)
  const keyOf = (p: string) => p.split(/=|%3D/i)[0].toLowerCase()
  const kept = parts.filter((p) => !DEBRID_CONFIG_KEYS.has(keyOf(p)))
  if (kept.length === parts.length) return undefined
  return `${u.origin}${kept.length ? `/${kept.join('|')}` : ''}/manifest.json`
}

/** El torrent sin debrid que corresponde al link: mismo hash (y mismo archivo, si se sabe). */
export function torrentTwin(link: DebridLink, plain: Stream[]): Stream | undefined {
  const same = plain.filter((s) => s.infoHash && normalizeInfoHash(s.infoHash) === link.infoHash)
  if (link.fileIdx === undefined) return same[0]
  return same.find((s) => s.fileIdx === link.fileIdx) ?? same.find((s) => s.fileIdx === undefined)
}

/**
 * El stream para reproducir por torrent en lugar del link de debrid. Con el gemelo sin debrid lleva sus
 * trackers e índice; sin él, solo el hash y el índice del link (el motor de Android tiene DHT y trackers propios).
 */
export function torrentStreamFor(debrid: Stream, link: DebridLink, twin?: Stream): Stream {
  const hints = debrid.behaviorHints
  return {
    infoHash: link.infoHash,
    fileIdx: twin?.fileIdx ?? link.fileIdx,
    sources: twin?.sources,
    name: (debrid.name ?? '').replace(DOWNLOAD_NAME_RE, '').replace(/\[[a-z]+\+\]/i, '').trim() || twin?.name,
    title: debrid.title ?? twin?.title,
    behaviorHints: {
      bingeGroup: hints?.bingeGroup ?? twin?.behaviorHints?.bingeGroup,
      filename: hints?.filename ?? twin?.behaviorHints?.filename,
      videoSize: hints?.videoSize ?? twin?.behaviorHints?.videoSize,
    },
  }
}

/**
 * Los videos de aviso de Torrentio ("descargando", "límite excedido", "falló"…) duran 30 s. Una peli o un
 * episodio nunca dura tan poco: un link de debrid que da 35 s o menos es un aviso, no el video.
 */
export const STATUS_VIDEO_MAX_S = 35

export function looksLikeStatusVideo(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration <= STATUS_VIDEO_MAX_S
}

/** Por qué falló el debrid (sale del nombre del video de aviso, cuando se puede leer). */
export type DebridFailure = 'downloading' | 'limits' | 'access' | 'failed' | 'unknown'

/** `/videos/limits_exceeded_v2.mp4` → `limits`. Solo mira el nombre del archivo. */
export function failureFromLocation(location: string | undefined): DebridFailure {
  const name = /\/videos\/([a-z_]+?)(?:_v\d+)?\.mp4/i.exec(location ?? '')?.[1]?.toLowerCase()
  if (!name) return 'unknown'
  if (name === 'downloading') return 'downloading'
  if (name === 'limits_exceeded') return 'limits'
  if (name === 'failed_access' || name === 'blocked_access') return 'access'
  return 'failed'
}

export function debridFailureText(kind: DebridFailure): string {
  switch (kind) {
    case 'downloading':
      return 'TorBox todavía no tiene este video: lo está bajando.'
    case 'limits':
      return 'TorBox llegó a su límite de descargas en este momento.'
    case 'access':
      return 'TorBox no aceptó la cuenta configurada en el addon. Avisale al administrador.'
    case 'failed':
      return 'TorBox no pudo preparar este video.'
    default:
      return 'El debrid no pudo con esta fuente.'
  }
}

/** Tiempo máximo para pedirle a Torrentio el torrent sin debrid antes de arrancar igual con lo que se sabe. */
export const TWIN_TIMEOUT_MS = 8000

/** Busca el torrent sin debrid del link en el mismo Torrentio sin la key. Sin respuesta, `undefined`. */
export async function findTorrentTwin(addon: InstalledAddon, type: string, videoId: string, link: DebridLink, signal?: AbortSignal): Promise<Stream | undefined> {
  const plain = plainTorrentioUrl(addon.transportUrl)
  if (!plain) return undefined
  try {
    const streams = await getAddonStreams({ transportUrl: plain, manifest: addon.manifest }, type, videoId, TWIN_TIMEOUT_MS, signal)
    return torrentTwin(link, streams)
  } catch {
    return undefined
  }
}

/**
 * Precarga el Torrentio sin debrid de un título (queda 10 min en caché), así al elegir algo que TorBox no tiene
 * el torrent arranca sin esperar. Solo si el addon es Torrentio con debrid.
 */
export function prefetchTorrentTwins(addon: InstalledAddon, type: string, videoId: string): void {
  const plain = plainTorrentioUrl(addon.transportUrl)
  if (!plain || !isTorrentio(addon)) return
  getAddonStreams({ transportUrl: plain, manifest: addon.manifest }, type, videoId, TWIN_TIMEOUT_MS).catch(() => {})
}

/** El link de debrid de Torrentio que se está por reproducir (solo si es el link del propio stream). */
export function debridLinkOf(state: Pick<PlayState, 'stream' | 'playUrl'>): DebridLink | undefined {
  return state.stream.url && state.stream.url === state.playUrl ? parseDebridLink(state.playUrl) : undefined
}

/** El mismo título por torrent en lugar del link de debrid. Sin servidor de torrents, `undefined`. */
export async function torrentStateFor(state: PlayState, server: TorrentServer, addons: InstalledAddon[], signal?: AbortSignal): Promise<PlayState | undefined> {
  const link = debridLinkOf(state)
  if (!link || !server.url) return undefined
  const addon = state.addonUrl ? addons.find((a) => sameAddon(a.transportUrl, state.addonUrl!)) : undefined
  const videoId = state.video?.id ?? state.meta.id
  const twin = addon && isTorrentio(addon) ? await findTorrentTwin(addon, state.meta.type, videoId, link, signal) : undefined
  const stream = torrentStreamFor(state.stream, link, twin)
  const playUrl = streamingServerUrl(server.url, stream, server.engine)
  return playUrl ? { ...state, stream, playUrl } : undefined
}

/** Links de "descarga" que ya se le pidieron a TorBox en esta sesión (una vez por link alcanza). */
const requested = new Set<string>()

/**
 * Le pide a TorBox que baje un título que no tiene: abrir el link de Torrentio ya lo agrega a la cuenta. Se corta
 * apenas responde (no hace falta bajar el video de aviso). Sin CORS no se puede leer la respuesta, y no importa.
 */
export function requestDebridDownload(url: string): void {
  if (requested.has(url)) return
  requested.add(url)
  const ctrl = new AbortController()
  const stop = setTimeout(() => ctrl.abort(), 60_000)
  fetch(url, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal })
    .then(() => ctrl.abort())
    .catch(() => {})
    .finally(() => clearTimeout(stop))
}

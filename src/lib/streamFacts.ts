import { audioLangs, CACHED_MARKERS, isHdr, parseQuality, parseSize, streamText, type AudioLang } from './streamPicker'
import type { Stream } from './types'

// v0.26 (ficha-03): lo que se lee de una fuente para mostrarlo en etiquetas grandes (calidad, HDR, audio,
// idioma, peso) y el servicio en palabras ("Real-Debrid · listo para ver"), en vez del texto crudo del addon.
// Funciones puras: los mismos datos que `streamPicker` ya analiza para puntuar.

export interface StreamFacts {
  /** "4K", "1080p", "720p", "480p". */
  quality?: string
  /** "Dolby Vision" o "HDR". */
  hdr?: string
  /** "Atmos", "7.1" o "5.1". */
  audio?: string
  /** "Latino", "Castellano", "Español", "Varios idiomas", "Inglés"… */
  lang?: string
  /** El idioma es latino (se marca con el acento). */
  latino: boolean
  /** "12,4 GB", "900 MB". */
  size?: string
  /** "Real-Debrid", "TorBox", "Torrent"… o el nombre del addon si no dice ninguno. */
  service?: string
  /** "listo para ver", "tiene que descargarse", "sin debrid". */
  state?: string
  /** Primera línea del título (el nombre del archivo, sin el emoji de adelante). */
  file?: string
}

const QUALITY_LABEL: Record<number, string> = { 2160: '4K', 1080: '1080p', 720: '720p', 480: '480p' }

const DOLBY_VISION_RE = /dolby[ .]?vision|dovi|(^|[^a-z0-9])dv([^a-z0-9]|$)/i
const ATMOS_RE = /(^|[^a-z0-9])atmos([^a-z0-9]|$)/i
/** "DDP5.1", "DTS-HD.MA.5.1", "7.1": canales (sin confundir "S01E05.1080p"). */
const CHANNELS_RE = /(?<!\d)([57])[ .]1(?!\d)/

const LANG_LABEL: Partial<Record<AudioLang, string>> = {
  cas: 'Castellano',
  spa: 'Español',
  eng: 'Inglés',
  por: 'Portugués',
  ita: 'Italiano',
  fre: 'Francés',
  ger: 'Alemán',
  rus: 'Ruso',
  jpn: 'Japonés',
  kor: 'Coreano',
}
/** Si hay varios, se muestra primero el que más le sirve al usuario. */
const LANG_ORDER: AudioLang[] = ['cas', 'spa', 'eng', 'por', 'ita', 'fre', 'ger', 'rus', 'jpn', 'kor']

/** Servicios de debrid: la marca entre corchetes que ponen Torrentio y compañía, o el nombre completo. */
const SERVICES: [string, RegExp][] = [
  ['Real-Debrid', /\[rd[+\] ]|real-?debrid/i],
  ['TorBox', /\[tb[+\] ]|torbox/i],
  ['AllDebrid', /\[ad[+\] ]|all-?debrid/i],
  ['Premiumize', /\[pm[+\] ]|premiumize/i],
  ['Debrid-Link', /\[dl[+\] ]|debrid-?link/i],
  ['EasyDebrid', /\[ed[+\] ]|easy-?debrid/i],
  ['Offcloud', /\[oc[+\] ]|offcloud/i],
]

const DOWNLOAD_RE = /(^|[^a-z])download([^a-z]|$)/i

/** "12,4 GB" / "900 MB" (con coma, como se escribe acá). */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`
  return `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString('es-AR')} MB`
}

function langOf(langs: Set<AudioLang>): { lang?: string; latino: boolean } {
  if (langs.has('multi')) return { lang: 'Varios idiomas', latino: false }
  if (langs.has('lat')) return { lang: 'Latino', latino: true }
  const first = LANG_ORDER.find((l) => langs.has(l))
  return { lang: first && LANG_LABEL[first], latino: false }
}

/** Primera línea del título sin los símbolos de adelante ("🎞️ tt0133093 1080p" → "tt0133093 1080p"). */
function fileLine(s: Stream): string | undefined {
  const first = (s.title ?? s.description ?? '').split('\n')[0].replace(/^[^\p{L}\p{N}[(]+/u, '').trim()
  return first || s.behaviorHints?.filename || undefined
}

/** Etiquetas de una fuente. `addonName` va como servicio cuando el stream no dice cuál es. */
export function streamFacts(s: Stream, addonName?: string): StreamFacts {
  const text = streamText(s)
  const name = s.name ?? ''
  const q = parseQuality(s)
  const size = parseSize(s)
  const channels = CHANNELS_RE.exec(text)
  const service = SERVICES.find(([, re]) => re.test(name))?.[0] ?? SERVICES.find(([, re]) => re.test(text))?.[0]
  const torrent = !service && !s.url && !!s.infoHash
  let state: string | undefined
  if (torrent) state = 'sin debrid'
  else if (service && DOWNLOAD_RE.test(name)) state = 'tiene que descargarse'
  else if (service && CACHED_MARKERS.test(text)) state = 'listo para ver'
  return {
    quality: q ? QUALITY_LABEL[q] : undefined,
    hdr: DOLBY_VISION_RE.test(text) ? 'Dolby Vision' : isHdr(s) ? 'HDR' : undefined,
    audio: ATMOS_RE.test(text) ? 'Atmos' : channels ? `${channels[1]}.1` : undefined,
    ...langOf(audioLangs(text)),
    size: size ? formatSize(size) : undefined,
    service: service ?? (torrent ? 'Torrent' : addonName),
    state,
    file: fileLine(s),
  }
}

/**
 * v0.26 (ficha-10): el resumen de arriba de la lista. `lead` va destacado ("6 listas para ver"); `rest`, lo que
 * no se ve o no se puede abrir así nomás ("2 torrents sin debrid", "1 oculta por tus filtros").
 */
export function sourceCounts({ ready, torrents, hidden }: { ready: number; torrents: number; hidden: number }): { lead: string; rest: string[] } {
  const lead = ready === 0 ? 'Ninguna lista para ver' : ready === 1 ? '1 lista para ver' : `${ready} listas para ver`
  const rest: string[] = []
  if (torrents > 0) rest.push(torrents === 1 ? '1 torrent sin debrid' : `${torrents} torrents sin debrid`)
  if (hidden > 0) rest.push(hidden === 1 ? '1 oculta por tus filtros' : `${hidden} ocultas por tus filtros`)
  return { lead, rest }
}

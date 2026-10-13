import { streamingServerUrl } from './addons'
import type { LastSource, SourceRules } from './store'
import type { AddonStreams, InstalledAddon, Stream } from './types'

// Elección automática de stream: funciones puras que puntúan los streams según las
// reglas del usuario y la última fuente que usó en ese título.

/** Cómo se va a reproducir este stream en la app, o por qué no se puede. */
export function playable(s: Stream, server: string): { url?: string; external?: string; reason?: string } {
  if (s.url) return { url: s.url }
  if (s.ytId) return { external: `https://www.youtube.com/watch?v=${s.ytId}` }
  if (s.externalUrl) return { external: s.externalUrl }
  if (s.infoHash) {
    const url = streamingServerUrl(server, s)
    return url ? { url } : { reason: 'Torrent: necesita el servidor de Stremio (ver Ajustes) o un addon con debrid' }
  }
  return { reason: 'Formato no soportado' }
}

export type Quality = 2160 | 1080 | 720 | 480

const QUALITIES: Quality[] = [2160, 1080, 720, 480]

const QUALITY_PATTERNS: [Quality, RegExp][] = [
  [2160, /\b(2160p|4k|uhd)\b/i],
  [1080, /\b(1080[pi]|fhd)\b/i],
  [720, /\b720p\b/i],
  [480, /\b(480p|576p|360p)\b/i],
]

/** Todo el texto que muestra el addon sobre el stream, para buscar calidad y palabras clave. */
export function streamText(s: Stream): string {
  return [s.name, s.title, s.description, s.behaviorHints?.filename].filter(Boolean).join(' ')
}

export function parseQuality(s: Stream): Quality | undefined {
  const text = streamText(s)
  return QUALITY_PATTERNS.find(([, re]) => re.test(text))?.[0]
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Palabra suelta, sin distinguir mayúsculas: "cam" no tiene que coincidir con "Camp Nowhere". */
export function hasKeyword(text: string, keyword: string): boolean {
  const kw = keyword.trim()
  if (!kw) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

/** Marcas de "ya está en el debrid" que ponen varios addons. */
const CACHED_MARKERS = /⚡|\[(rd|tb|ad|pm|dl|ed|oc)\+\]|\binstant\b|\bcached\b/i

/** Primera línea del nombre sin la calidad: "Torrentio\n4k" y "Torrentio\n1080p" son la misma fuente. */
export function nameKey(name: string | undefined): string {
  const first = (name ?? '').split('\n')[0].toLowerCase()
  return QUALITY_PATTERNS.reduce((acc, [, re]) => acc.replace(new RegExp(re.source, 'gi'), ' '), first)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Qué tanto se parece a la última fuente: mismo bingeGroup, mismo nombre, mismo addon o nada. */
export type SourceMatch = 'binge' | 'name' | 'addon' | 'none'

export interface RankedStream {
  addon: InstalledAddon
  stream: Stream
  url: string
  score: number
  match: SourceMatch
  quality?: Quality
  /** Posición del addon y del stream en la lista original (para desempatar y para marcarlo). */
  addonIndex: number
  streamIndex: number
}

function sourceMatch(addon: InstalledAddon, s: Stream, last?: LastSource): SourceMatch {
  if (!last || addon.transportUrl !== last.addonUrl) return 'none'
  const group = s.behaviorHints?.bingeGroup
  if (group && last.bingeGroup && group === last.bingeGroup) return 'binge'
  const a = nameKey(s.name)
  const b = nameKey(last.streamName)
  if (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))) return 'name'
  return 'addon'
}

const MATCH_SCORE: Record<SourceMatch, number> = { binge: 10000, name: 5000, addon: 1000, none: 0 }

function qualityScore(q: Quality | undefined, preferred: SourceRules['preferredQuality']): number {
  if (preferred === 'any') return q ? 30 * (QUALITIES.length - QUALITIES.indexOf(q)) : 0
  if (!q) return 50
  const want = QUALITIES.indexOf(Number(preferred.replace('p', '')) as Quality)
  const steps = QUALITIES.indexOf(q) - want
  if (steps === 0) return 300
  // Más baja que la preferida: mejor la más cercana. Más alta: puede no andar en la conexión.
  if (steps > 0) return 200 - 20 * steps
  return 100 + 20 * steps
}

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(TB|TiB|GB|GiB|MB|MiB)\b/i
const UNIT: Record<string, number> = { tb: 1e12, tib: 2 ** 40, gb: 1e9, gib: 2 ** 30, mb: 1e6, mib: 2 ** 20 }

/** Tamaño en bytes: el que informa el addon o el que aparece en el texto ("💾 1.4 GB", "1400 MB"). */
export function parseSize(s: Stream): number | undefined {
  if (s.behaviorHints?.videoSize) return s.behaviorHints.videoSize
  const m = SIZE_RE.exec(streamText(s))
  return m ? Number(m[1].replace(',', '.')) * UNIT[m[2].toLowerCase()] : undefined
}

export type Codec = 'hevc' | 'av1'

const CODEC_PATTERNS: [Codec, RegExp][] = [
  ['hevc', /(^|[^a-z0-9])(hevc|[xh][ .]?265)([^a-z0-9]|$)/i],
  ['av1', /(^|[^a-z0-9])av1([^a-z0-9]|$)/i],
]

export function parseCodec(s: Stream): Codec | undefined {
  const text = streamText(s)
  return CODEC_PATTERNS.find(([, re]) => re.test(text))?.[0]
}

const HDR_RE = /(^|[^a-z0-9])(hdr(10)?\+?|dolby[ .]?vision|dovi|dv)(?![a-z0-9])/i

export function isHdr(s: Stream): boolean {
  return HDR_RE.test(streamText(s))
}

const CODEC_LABEL: Record<Codec, string> = { hevc: 'HEVC/x265', av1: 'AV1' }

/** Por qué las reglas descartan este stream (sin contar los repetidos), o undefined si pasa. */
export function filterReason(s: Stream, rules: SourceRules): string | undefined {
  const text = streamText(s)
  const kw = rules.excludeKeywords.find((k) => hasKeyword(text, k))
  if (kw) return `Palabra descartada: ${kw}`
  if (rules.maxSizeGB > 0) {
    const size = parseSize(s)
    if (size && size > rules.maxSizeGB * 1e9) return `Pesa más de ${rules.maxSizeGB.toLocaleString('es-AR')} GB`
  }
  const codec = parseCodec(s)
  if (codec && rules.excludeCodecs?.includes(codec)) return CODEC_LABEL[codec]
  if (rules.hdr === 'exclude' && isHdr(s)) return 'HDR / Dolby Vision'
  return undefined
}

const normalize = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Claves que identifican el mismo archivo: torrent, enlace o nombre de archivo + tamaño. */
function duplicateKeys(s: Stream): string[] {
  const keys: string[] = []
  if (s.infoHash) keys.push(`h:${s.infoHash.toLowerCase()}:${s.fileIdx ?? ''}`)
  if (s.url) keys.push(`u:${s.url}`)
  const size = parseSize(s)
  const file = s.behaviorHints?.filename ?? (s.title ?? s.description ?? '').split('\n')[0]
  if (size && normalize(file).length >= 6) keys.push(`n:${normalize(file)}:${Math.round(size / 1e6)}`)
  return keys
}

/** Clave de un stream dentro de los grupos: `addon:stream`. */
export const streamKey = (addonIndex: number, streamIndex: number) => `${addonIndex}:${streamIndex}`

export interface StreamAnalysis {
  /** Reproducibles en la app que pasan los filtros, del mejor al peor. */
  ranked: RankedStream[]
  /** Ocultos por las reglas, con el motivo (por `streamKey`). */
  hidden: Map<string, string>
}

/** Puntúa todos los streams y separa los que esconden los filtros (incluidos los repetidos). */
export function analyzeStreams(groups: AddonStreams[], rules: SourceRules, last: LastSource | undefined, server: string): StreamAnalysis {
  const hidden = new Map<string, string>()
  const candidates: (Omit<RankedStream, 'url'> & { url?: string })[] = []
  groups.forEach((g, addonIndex) => {
    g.streams.forEach((stream, streamIndex) => {
      const reason = filterReason(stream, rules)
      if (reason) {
        hidden.set(streamKey(addonIndex, streamIndex), reason)
        return
      }
      const url = playable(stream, server).url
      const text = streamText(stream)
      const quality = parseQuality(stream)
      const match = sourceMatch(g.addon, stream, last)
      // Los que no se pueden reproducir en la app quedan al final (solo cuentan para los repetidos).
      let score = url ? MATCH_SCORE[match] + qualityScore(quality, rules.preferredQuality) : -Infinity
      score += 80 * rules.preferKeywords.filter((kw) => hasKeyword(text, kw)).length
      if (rules.hdr === 'prefer' && isHdr(stream)) score += 80
      if (CACHED_MARKERS.test(text)) score += 20
      // Lo que el navegador probablemente no reproduce (MKV/HEVC) o depende del servidor local va después.
      if (stream.behaviorHints?.notWebReady) score -= 40
      if (!stream.url) score -= 25
      candidates.push({ addon: g.addon, stream, url, score, match, quality, addonIndex, streamIndex })
    })
  })
  candidates.sort((a, b) => b.score - a.score || a.addonIndex - b.addonIndex || a.streamIndex - b.streamIndex)
  const seen = new Set<string>()
  const ranked: RankedStream[] = []
  for (const c of candidates) {
    if (rules.dedupe) {
      const keys = duplicateKeys(c.stream)
      if (keys.some((k) => seen.has(k))) {
        hidden.set(streamKey(c.addonIndex, c.streamIndex), 'Repetido')
        continue
      }
      keys.forEach((k) => seen.add(k))
    }
    if (c.url) ranked.push({ ...c, url: c.url })
  }
  return { ranked, hidden }
}

/** Streams reproducibles en la app, del mejor al peor según las reglas. Los excluidos no aparecen. */
export function rankStreams(groups: AddonStreams[], rules: SourceRules, last: LastSource | undefined, server: string): RankedStream[] {
  return analyzeStreams(groups, rules, last, server).ranked
}

export function pickBest(
  groups: AddonStreams[],
  rules: SourceRules,
  last: LastSource | undefined,
  server: string,
): RankedStream | undefined {
  return rankStreams(groups, rules, last, server)[0]
}

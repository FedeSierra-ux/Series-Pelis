import { streamingServerUrl } from './addons'
import { sameAddon } from './addonKey'
import type { LastSource, SourceRules } from './store'
import type { TorrentServer } from './torrentServer'
import type { AddonStreams, InstalledAddon, Stream } from './types'

// Elección automática de stream: funciones puras que puntúan los streams según las
// reglas del usuario y la última fuente que usó en ese título.

/**
 * Servidor para los torrents: el que da `useTorrentServer()` / `torrentServer()`. Un texto suelto es la URL del
 * servidor de Stremio (como antes de la v0.25).
 */
export type TorrentServerArg = string | TorrentServer

const asServer = (server: TorrentServerArg): TorrentServer => (typeof server === 'string' ? { url: server } : server)

/** Cómo se va a reproducir este stream en la app, o por qué no se puede. */
export function playable(s: Stream, server: TorrentServerArg): { url?: string; external?: string; reason?: string } {
  // El navegador no puede mandar cabeceras propias (Referer, Origin, cookies…): eso solo lo hace
  // el servidor de Stremio o un reproductor externo.
  if (needsProxyHeaders(s)) return { reason: 'Necesita cabeceras especiales: abrilo en un reproductor externo' }
  if (s.url) return { url: s.url }
  if (s.ytId) return { external: `https://www.youtube.com/watch?v=${s.ytId}` }
  if (s.externalUrl) return { external: s.externalUrl }
  if (s.infoHash) {
    const srv = asServer(server)
    const url = streamingServerUrl(srv.url, s, srv.engine)
    return url ? { url } : { reason: srv.missing ?? 'Torrent: necesita el servidor de Stremio (ver Ajustes) o un addon con debrid' }
  }
  return { reason: 'Formato no soportado' }
}

/** ¿El addon pide cabeceras especiales para pedir el stream (`behaviorHints.proxyHeaders`)? */
export function needsProxyHeaders(s: Stream): boolean {
  const h = s.behaviorHints?.proxyHeaders
  return !!h && (Object.keys(h.request ?? {}).length > 0 || Object.keys(h.response ?? {}).length > 0)
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
export const CACHED_MARKERS = /⚡|\[(rd|tb|ad|pm|dl|ed|oc)\+\]|\binstant\b|\bcached\b/i

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
  if (!last || !sameAddon(addon.transportUrl, last.addonUrl)) return 'none'
  const group = s.behaviorHints?.bingeGroup
  if (group && last.bingeGroup && group === last.bingeGroup) return 'binge'
  const a = nameKey(s.name)
  const b = nameKey(last.streamName)
  if (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))) return 'name'
  return 'addon'
}

// ---------- Idioma del audio (auditoría #7) ----------
// Torrentio llama a todos sus streams "Torrentio\n1080p": por el nombre, uno en inglés y uno latino son
// "la misma fuente". El idioma va en el título (banderas o palabras). Si venías viendo en latino, el
// siguiente episodio tiene que seguir en latino aunque haya uno en inglés de mejor calidad.

export type AudioLang = 'lat' | 'cas' | 'spa' | 'eng' | 'por' | 'ita' | 'fre' | 'ger' | 'rus' | 'jpn' | 'kor' | 'multi'

/**
 * Palabra suelta (sin letras pegadas a los costados, también con tildes: "inglés"). Se evitan las
 * abreviaturas que son palabras comunes en los títulos ("por", "cast"): "Amor.Por.Siempre" no es portugués.
 */
const word = (alts: string) => new RegExp(`(^|[^\\p{L}\\p{N}])(${alts})($|[^\\p{L}\\p{N}])`, 'iu')

const LANG_PATTERNS: [AudioLang, RegExp[]][] = [
  ['lat', [/🇲🇽|🇦🇷|🇨🇴|🇨🇱|🇵🇪|🇻🇪/u, word('latino|latina|latam|lat|esp[ ._-]?lat|spanish[ ._-]?lat(?:in|am)?|castellano[ ._-]?lat(?:ino)?|audio[ ._-]?latino')]],
  ['cas', [/🇪🇸/u, word('castellano|castilian|español[ ._-]?\\(?españa\\)?|spanish[ ._-]?\\(?spain\\)?|esp[ ._-]?esp')]],
  ['spa', [word('español|espanol|spanish|spa|esp')]],
  ['eng', [/🇬🇧|🇺🇸/u, word('english|eng|inglés|ingles')]],
  ['por', [/🇧🇷|🇵🇹/u, word('portugu[eê]s|portuguese|dublado|pt-br')]],
  ['ita', [/🇮🇹/u, word('italian|italiano|ita')]],
  ['fre', [/🇫🇷/u, word('french|français|francais|truefrench|vff|vf')]],
  ['ger', [/🇩🇪/u, word('german|deutsch|ger')]],
  ['rus', [/🇷🇺/u, word('russian|rus')]],
  ['jpn', [/🇯🇵/u, word('japanese|jpn')]],
  ['kor', [/🇰🇷/u, word('korean|kor')]],
  ['multi', [word('multi|dual|multi[ ._-]?audio|dual[ ._-]?audio')]],
]

/** Idiomas de audio que anuncia el texto de un stream (vacío si no dice nada: suele ser el original). */
export function audioLangs(text: string): Set<AudioLang> {
  const out = new Set<AudioLang>()
  for (const [lang, res] of LANG_PATTERNS) if (res.some((re) => re.test(text))) out.add(lang)
  // "Castellano latino" o "Español latino" es latino, no castellano.
  if (out.has('lat')) out.delete('cas')
  if (out.has('lat') || out.has('cas')) out.delete('spa')
  return out
}

/**
 * ¿El candidato está en el mismo idioma que la fuente anterior? `undefined` si la anterior no decía
 * nada (no hay con qué comparar). Un "Español" sin variante sirve para latino y para castellano.
 */
export function sameLanguage(prev: Set<AudioLang>, cand: Set<AudioLang>): boolean | undefined {
  const audio = [...prev].filter((l) => l !== 'multi')
  if (audio.length === 0) return prev.has('multi') && cand.has('multi') ? true : undefined
  return audio.some((l) => cand.has(l) || (l === 'spa' && (cand.has('lat') || cand.has('cas'))) || ((l === 'lat' || l === 'cas') && cand.has('spa')))
}

const LANG_BONUS = 1500
const LANG_PENALTY = 1500

/** Grupo del release ("…x264-NTb.mkv" → "ntb"), para preferir la misma versión del episodio anterior. */
export function releaseGroup(text: string | undefined): string | undefined {
  const line = (text ?? '').split('\n')[0].trim()
  const m = /-([a-z0-9]{2,15})(?:\.(?:mkv|mp4|m4v|avi|webm|ts))?$/i.exec(line)
  return m && !/^(dl|web|rip|hd|sd)$/i.test(m[1]) ? m[1].toLowerCase() : undefined
}

const RELEASE_BONUS = 120

/** Texto de la fuente anterior (nombre y título guardados) para comparar idioma y release. */
const lastText = (last: LastSource) => [last.streamName, last.streamTitle].filter(Boolean).join(' ')

const firstTitleLine = (s: Stream) => s.behaviorHints?.filename ?? (s.title ?? s.description ?? '').split('\n')[0]

/** Lo que se guarda de la fuente elegida para reconocerla en el siguiente episodio. */
export function lastSourceOf(addonUrl: string, s: Stream, at = Date.now()): LastSource {
  const title = [s.title ?? s.description, s.behaviorHints?.filename].filter(Boolean).join('\n').slice(0, 400)
  return { addonUrl, bingeGroup: s.behaviorHints?.bingeGroup, streamName: s.name, ...(title ? { streamTitle: title } : {}), at }
}

const MATCH_SCORE: Record<SourceMatch, number> = { binge: 10000, name: 5000, addon: 1000, none: 0 }

type PreferredQuality = SourceRules['preferredQuality']

function qualityScore(q: Quality | undefined, preferred: PreferredQuality): number {
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

const VIDEO_EXT_RE = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg|flv|iso)$/i

/**
 * ¿La línea parece un nombre de archivo ("Peli.2020.1080p.WEB-DL.x264.mkv") y no una etiqueta
 * genérica ("Latino 1080p")? Solo los nombres de archivo sirven para detectar repetidos.
 */
export function looksLikeFilename(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (VIDEO_EXT_RE.test(t)) return true
  const separators = (t.match(/[.\-_]/g) ?? []).length
  // Nombre de release: largo y con puntos o guiones, o estilo "scene" (sin espacios, varios puntos).
  return (t.length >= 20 && separators > 0) || (separators >= 2 && !/\s/.test(t) && t.length >= 12)
}

/** Claves que identifican el mismo archivo: torrent, enlace o nombre de archivo + tamaño. */
function duplicateKeys(s: Stream): string[] {
  const keys: string[] = []
  if (s.infoHash) keys.push(`h:${s.infoHash.toLowerCase()}:${s.fileIdx ?? ''}`)
  if (s.url) keys.push(`u:${s.url}`)
  const size = parseSize(s)
  // Sin nombre de archivo, la primera línea del título solo cuenta si parece uno: dos archivos distintos
  // con la etiqueta "Latino 1080p" y el mismo tamaño no son el mismo.
  const firstLine = (s.title ?? s.description ?? '').split('\n')[0]
  const file = s.behaviorHints?.filename ?? (looksLikeFilename(firstLine) ? firstLine : '')
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
export function analyzeStreams(groups: AddonStreams[], rules: SourceRules, last: LastSource | undefined, server: TorrentServerArg): StreamAnalysis {
  const hidden = new Map<string, string>()
  const candidates: (Omit<RankedStream, 'url'> & { url?: string })[] = []
  const preferred = rules.preferredQuality
  const prevLangs = last ? audioLangs(lastText(last)) : undefined
  const prevGroup = last ? releaseGroup(last.streamTitle) : undefined
  groups.forEach((g, addonIndex) => {
    // Un addon que mandó algo que no es una lista no tumba el resto (auditoría #14).
    if (!Array.isArray(g.streams)) return
    g.streams.forEach((stream, streamIndex) => {
      const reason = filterReason(stream, rules)
      if (reason) {
        hidden.set(streamKey(addonIndex, streamIndex), reason)
        return
      }
      const url = playable(stream, server).url
      const text = streamText(stream)
      const quality = parseQuality(stream)
      let match = sourceMatch(g.addon, stream, last)
      // Mismo idioma que la fuente anterior: suma; otro idioma: resta y deja de contar como "la misma
      // fuente" (en modo manual el siguiente episodio no arranca solo en otro idioma).
      const lang = prevLangs ? sameLanguage(prevLangs, audioLangs(text)) : undefined
      if (lang === false && match !== 'binge') match = 'none'
      // Los que no se pueden reproducir en la app quedan al final (solo cuentan para los repetidos).
      let score = url ? MATCH_SCORE[match] + qualityScore(quality, preferred) : -Infinity
      if (lang === true) score += LANG_BONUS
      else if (lang === false) score -= LANG_PENALTY
      if (prevGroup && releaseGroup(firstTitleLine(stream)) === prevGroup) score += RELEASE_BONUS
      score += 80 * rules.preferKeywords.filter((kw) => hasKeyword(text, kw)).length
      if (rules.hdr === 'prefer' && isHdr(stream)) score += 80
      if (CACHED_MARKERS.test(text)) score += 20
      // Lo que el navegador probablemente no reproduce (MKV/HEVC) va después.
      if (stream.behaviorHints?.notWebReady) score -= 40
      candidates.push({ addon: g.addon, stream, url, score, match, quality, addonIndex, streamIndex })
    })
  })
  // Debrid primero (v0.25): cualquier stream con enlace directo va antes que cualquier torrent (infoHash sin
  // url), aunque el torrent sea la misma fuente de antes o esté en el idioma de antes. Un torrent se elige
  // solo si no hay nada directo reproducible; entre torrents, el orden de siempre.
  // Los que no se pueden reproducir (sin `url`) siguen al final, después de los torrents.
  const direct = (c: (typeof candidates)[number]) => Number(!!c.url && !!c.stream.url)
  candidates.sort((a, b) => direct(b) - direct(a) || b.score - a.score || a.addonIndex - b.addonIndex || a.streamIndex - b.streamIndex)
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
export function rankStreams(groups: AddonStreams[], rules: SourceRules, last: LastSource | undefined, server: TorrentServerArg): RankedStream[] {
  return analyzeStreams(groups, rules, last, server).ranked
}

export function pickBest(
  groups: AddonStreams[],
  rules: SourceRules,
  last: LastSource | undefined,
  server: TorrentServerArg,
): RankedStream | undefined {
  return rankStreams(groups, rules, last, server)[0]
}

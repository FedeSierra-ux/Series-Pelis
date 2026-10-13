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

/** Streams reproducibles en la app, del mejor al peor según las reglas. Los excluidos no aparecen. */
export function rankStreams(groups: AddonStreams[], rules: SourceRules, last: LastSource | undefined, server: string): RankedStream[] {
  const ranked: RankedStream[] = []
  groups.forEach((g, addonIndex) => {
    g.streams.forEach((stream, streamIndex) => {
      const url = playable(stream, server).url
      if (!url) return
      const text = streamText(stream)
      if (rules.excludeKeywords.some((kw) => hasKeyword(text, kw))) return
      const quality = parseQuality(stream)
      const match = sourceMatch(g.addon, stream, last)
      let score = MATCH_SCORE[match] + qualityScore(quality, rules.preferredQuality)
      score += 80 * rules.preferKeywords.filter((kw) => hasKeyword(text, kw)).length
      if (CACHED_MARKERS.test(text)) score += 20
      // Lo que el navegador probablemente no reproduce (MKV/HEVC) o depende del servidor local va después.
      if (stream.behaviorHints?.notWebReady) score -= 40
      if (!stream.url) score -= 25
      ranked.push({ addon: g.addon, stream, url, score, match, quality, addonIndex, streamIndex })
    })
  })
  return ranked.sort((a, b) => b.score - a.score || a.addonIndex - b.addonIndex || a.streamIndex - b.streamIndex)
}

export function pickBest(
  groups: AddonStreams[],
  rules: SourceRules,
  last: LastSource | undefined,
  server: string,
): RankedStream | undefined {
  return rankStreams(groups, rules, last, server)[0]
}

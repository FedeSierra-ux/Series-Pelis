import type { SubOption } from './subtitlePrefs'
import type { Stream } from './types'
import { reportUnauthorized } from './auth'

// Subtítulos online en español (SubDL, con OpenSubtitles de respaldo) por la Pages Function /api/subs.
// La función ya los devuelve ordenados: latino, después sin saber y al final de España.

const API = '/api/subs'
/** Cuántos se muestran en el menú (los mejores para este video). */
export const ONLINE_MAX = 4

export interface OnlineSub {
  id: string
  url: string
  lang: 'spl' | 'spn' | 'spa'
  release: string
  source: 'subdl' | 'opensubtitles'
  sdh?: boolean
}

let status: Promise<boolean> | undefined

/** ¿El sitio tiene subtítulos online? Se pregunta una vez por sesión (en local la función no existe). */
export function onlineSubsEnabled(): Promise<boolean> {
  status ??= fetch(`${API}/_status`, { headers: { Accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('json')) return false
      const body = (await res.json()) as { enabled?: unknown }
      return body.enabled === true
    })
    .catch(() => {
      // Sin conexión: se vuelve a preguntar la próxima vez.
      status = undefined
      return false
    })
  return status
}

/** Para los tests. */
export function resetOnlineSubs() {
  status = undefined
}

/** IMDb, temporada y episodio de un id de Stremio (`tt0133093`, `tt0944947:1:2`). */
export function parseVideoId(type: string, videoId: string): { imdb: string; s?: number; e?: number } | undefined {
  const [imdb, s, e] = videoId.split(':')
  if (!/^tt\d{5,10}$/.test(imdb)) return undefined
  if (type !== 'series') return { imdb }
  const season = Number(s)
  const episode = Number(e)
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return undefined
  return { imdb, s: season, e: episode }
}

/** Palabras del nombre de un release, sin las que no dicen nada. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !/^(the|and|de|la|el|los|las|sub|subs|spanish|español|espanol|latino|lat|esp)$/.test(t)),
  )
}

/** Cuánto se parece el release del subtítulo al video (resolución, origen, grupo): más alto = mejor sincronizado. */
export function releaseScore(release: string, streamText: string): number {
  if (!release || !streamText) return 0
  const want = tokens(streamText)
  let score = 0
  for (const t of tokens(release)) if (want.has(t)) score += /^(web|webrip|webdl|dl|bluray|brrip|bdrip|hdtv|remux|hdrip|dvdrip|1080p|720p|2160p|480p)$/.test(t) ? 2 : 1
  return score
}

/** Texto del stream que sirve para comparar (el nombre del archivo es lo mejor). */
export function streamText(stream: Stream | undefined): string {
  if (!stream) return ''
  return [stream.behaviorHints?.filename, stream.title, stream.description, stream.name].filter(Boolean).join(' ')
}

const LABEL: Record<OnlineSub['lang'], string> = {
  spl: 'Español latino',
  spa: 'Español',
  spn: 'Español (España)',
}

/**
 * Los mejores para el menú: dentro de cada variante, el release más parecido al video primero.
 * Latino siempre arriba (es lo que se pidió), aunque otro se parezca más.
 */
export function onlineOptions(subs: OnlineSub[], text = ''): SubOption[] {
  const rank = { spl: 0, spa: 1, spn: 2 }
  return subs
    .map((s, i) => ({ s, i, score: releaseScore(s.release, text) }))
    .sort((a, b) => rank[a.s.lang] - rank[b.s.lang] || b.score - a.score || a.i - b.i)
    .slice(0, ONLINE_MAX)
    .map(({ s }) => ({
      id: s.id,
      url: s.url,
      lang: s.lang,
      label: `${LABEL[s.lang]} (online)`,
      latino: s.lang === 'spl',
      sdh: s.sdh,
    }))
}

/** Pide la lista a /api/subs (`hint` = `streamText` del video que suena). Si algo falla, lista vacía: los subtítulos online son un extra. */
export async function fetchOnlineSubs(type: string, videoId: string, hint = ''): Promise<SubOption[]> {
  const ids = parseVideoId(type, videoId)
  if (!ids || !(await onlineSubsEnabled())) return []
  const params = new URLSearchParams({ imdb: ids.imdb, type: type === 'series' ? 'series' : 'movie' })
  if (ids.s !== undefined && ids.e !== undefined) {
    params.set('s', String(ids.s))
    params.set('e', String(ids.e))
  }
  try {
    const res = await fetch(`${API}/search?${params}`, { headers: { Accept: 'application/json' } })
    if (res.status === 401) reportUnauthorized()
    if (!res.ok) return []
    const body = (await res.json()) as { subs?: OnlineSub[] }
    return Array.isArray(body.subs) ? onlineOptions(body.subs, hint) : []
  } catch {
    return []
  }
}

import { cached, fetchJson } from './cache'

// Intro, resumen y créditos de IntroDB (vía /api/segments, que hace de proxy por el CORS).

export interface Segment {
  /** segundos */
  start: number
  /** segundos; Infinity si llega hasta el final */
  end: number
}

export interface Segments {
  intro?: Segment
  recap?: Segment
  outro?: Segment
  postCredits?: Segment
}

interface RawSegment {
  start_sec?: number | null
  end_sec?: number | null
}

interface RawSegments {
  intro?: RawSegment | null
  recap?: RawSegment | null
  outro?: RawSegment | null
  post_credits?: RawSegment | null
}

const TTL = 7 * 24 * 60 * 60 * 1000

function parse(raw?: RawSegment | null): Segment | undefined {
  if (!raw || typeof raw.start_sec !== 'number' || !Number.isFinite(raw.start_sec)) return undefined
  const end = typeof raw.end_sec === 'number' && Number.isFinite(raw.end_sec) ? raw.end_sec : Infinity
  return end > raw.start_sec ? { start: Math.max(0, raw.start_sec), end } : undefined
}

/** `tt123` de la peli o serie (sirve el id del meta o el del episodio, `tt123:1:2`). */
export function imdbIdOf(...ids: (string | undefined)[]): string | undefined {
  for (const id of ids) {
    const m = id?.match(/^(tt\d+)(?::|$)/)
    if (m) return m[1]
  }
  return undefined
}

/** Devuelve los segmentos, o null si no hay datos o falla algo (nunca tira error). */
export async function getSegments(imdbId: string | undefined, season?: number, episode?: number): Promise<Segments | null> {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null
  const params = new URLSearchParams({ imdb_id: imdbId })
  if (Number.isInteger(season) && Number.isInteger(episode)) {
    params.set('season', String(season))
    params.set('episode', String(episode))
  } else params.set('is_movie', 'true')

  try {
    const raw = await cached(`segments:${params}`, () => fetchJson<RawSegments>(`/api/segments?${params}`, 8000), TTL)
    const segments: Segments = {
      intro: parse(raw?.intro),
      recap: parse(raw?.recap),
      outro: parse(raw?.outro),
      postCredits: parse(raw?.post_credits),
    }
    return Object.values(segments).some(Boolean) ? segments : null
  } catch {
    return null
  }
}

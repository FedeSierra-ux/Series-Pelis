import { getMeta } from '../lib/addons'
import { seasonCount, seriesYear } from '../lib/format'
import { addonsStore } from '../lib/store'
import { formatRuntime, getDetails, getDetailsByImdb, hasTmdb, imdbFromTmdb, parseTmdbId, pickLogo, tmdbImg, type TmdbDetails } from '../lib/tmdb'
import type { Meta } from '../lib/types'

// Datos del fondo que sigue al foco (modo TV): a partir del enlace del póster enfocado.

export interface BillboardTarget {
  type: string
  id: string
  /** Nombre que muestra la tarjeta (por si no llegan los datos). */
  name?: string
  /** La imagen de la tarjeta (ya en caché): fondo provisorio mientras llega el de verdad. */
  poster?: string
}

export interface BillboardInfo {
  key: string
  name: string
  logo?: string
  background?: string
  /** Fondo provisorio (difuminado) hasta que carga `background`. */
  poster?: string
  rating?: string
  facts: string[]
  description?: string
}

/** `/detail/movie/tt0133093?season=1` → `{ type: 'movie', id: 'tt0133093' }`. */
export function parseDetailHref(href: string | null | undefined): Omit<BillboardTarget, 'name'> | undefined {
  const m = /^\/detail\/([^/?#]+)\/([^/?#]+)/.exec(href ?? '')
  if (!m) return undefined
  try {
    return { type: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) }
  } catch {
    return undefined
  }
}

/** "148 min" de Cinemeta → "2 h 28 min". */
function cinemetaRuntime(runtime: string | undefined): string {
  const min = Number(/(\d+)\s*min/i.exec(runtime ?? '')?.[1])
  return Number.isFinite(min) && min > 0 ? formatRuntime(min) : (runtime ?? '')
}

/** Recorta la sinopsis a ~`max` caracteres sin cortar una palabra. */
export function shortText(text: string | undefined, max = 220): string | undefined {
  const t = text?.replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[,;:.\s]+$/, '')}…`
}

/** Junta lo de Cinemeta (nombre original, IMDb, logo) y lo de TMDB (sinopsis en español) si hay key. */
export function buildInfo(key: string, meta: Meta | undefined, tmdb: TmdbDetails | undefined, fallbackName?: string): BillboardInfo {
  const imdb = meta?.id?.startsWith('tt') ? meta.id : tmdb?.external_ids?.imdb_id || tmdb?.imdb_id || undefined
  const series = meta?.type === 'series' || !!tmdb?.first_air_date
  const releaseInfo = meta?.releaseInfo ?? meta?.year
  const year = (series ? seriesYear(releaseInfo, tmdb?.number_of_seasons ?? seasonCount(meta?.videos)) : releaseInfo) ?? (tmdb?.release_date || tmdb?.first_air_date || '').slice(0, 4)
  // En las series la duración cambia en cada episodio: solo en las pelis.
  const runtime = series ? '' : cinemetaRuntime(meta?.runtime) || formatRuntime(tmdb?.runtime || undefined)
  const genres = tmdb?.genres?.length ? tmdb.genres.map((g) => g.name) : (meta?.genres ?? meta?.genre ?? [])
  const tmdbLogo = tmdbImg(pickLogo(tmdb), 'w500')
  return {
    key,
    name: meta?.name || tmdb?.original_title || tmdb?.original_name || tmdb?.title || tmdb?.name || fallbackName || '',
    logo: meta?.logo ?? tmdbLogo ?? (imdb ? `https://images.metahub.space/logo/medium/${imdb}/img` : undefined),
    background: meta?.background ?? tmdbImg(tmdb?.backdrop_path, 'w1280') ?? (imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : undefined),
    rating: meta?.imdbRating,
    facts: [year, runtime, genres.slice(0, 2).join(' · ')].filter((x): x is string => !!x),
    description: shortText(tmdb?.overview || meta?.description),
  }
}

/** Busca los datos del título (todo sale de la caché si ya se vio la ficha o el póster). */
export async function loadBillboard(target: BillboardTarget): Promise<BillboardInfo> {
  const key = `${target.type}:${target.id}`
  const tmdbRef = parseTmdbId(target.id)
  let imdb = target.id.startsWith('tt') ? target.id.split(':')[0] : undefined
  let tmdb: TmdbDetails | undefined
  if (tmdbRef) {
    tmdb = await getDetails(tmdbRef.type, tmdbRef.id).catch(() => undefined)
    imdb = tmdb?.external_ids?.imdb_id || tmdb?.imdb_id || (await imdbFromTmdb(tmdbRef.id, tmdbRef.type).catch(() => undefined))
  }
  const [meta, details] = await Promise.all([
    getMeta(addonsStore.get(), target.type, imdb ?? target.id).catch(() => undefined),
    !tmdb && imdb && hasTmdb() ? getDetailsByImdb(imdb, target.type).catch(() => undefined) : Promise.resolve(tmdb),
  ])
  return { ...buildInfo(key, meta, details, target.name), poster: target.poster || meta?.poster }
}

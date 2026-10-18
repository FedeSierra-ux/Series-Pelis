// Películas y Series como página de filas (v0.15, U11). Lógica pura: qué filas van, de dónde sale
// cada una y los parámetros de TMDB. Sin dependencias del navegador para poder probarla con vitest.
//
// - "Top 10 de la semana" (v0.24): tendencias de la semana de TMDB (mundial). Hasta la v0.23 era
//   `discover` por popularidad en las plataformas de Argentina, pero en series ganaban las de muchas
//   temporadas (La Ley y el Orden, Los Simpson). Sin TMDB, los 10 primeros de "Popular" de Cinemeta.
// - "Bien calificadas" y los géneros salen de "Popular" de Cinemeta: traen el puntaje de IMDb (el
//   cartelito del póster) y no necesitan key.
// - "Argentinas" necesita TMDB (Cinemeta no sabe el país de origen).

import { CINEMETA_URL } from './addons'
import { ratingOf } from './discoverFilters'
import type { MetaPreview } from './types'

export type BrowseKind = 'movie' | 'series'

/** Puntaje mínimo de IMDb para "Bien calificadas". */
export const MIN_IMDB = 7

/** Noticieros, reality y programas de entrevistas: inflan la popularidad de las series y no son lo que se busca acá. */
export const TV_NOISE = '10763|10764|10767'

export interface GenreRow {
  key: string
  title: string
  /** Género del catálogo "Popular" de Cinemeta. */
  genre: string
}

export const GENRE_ROWS: Record<BrowseKind, GenreRow[]> = {
  movie: [
    { key: 'drama', title: 'Drama', genre: 'Drama' },
    { key: 'suspenso', title: 'Suspenso', genre: 'Thriller' },
    { key: 'scifi', title: 'Ciencia ficción', genre: 'Sci-Fi' },
    { key: 'comedias', title: 'Comedias', genre: 'Comedy' },
  ],
  series: [
    { key: 'drama', title: 'Drama', genre: 'Drama' },
    { key: 'suspenso', title: 'Suspenso', genre: 'Thriller' },
    { key: 'scifi', title: 'Ciencia ficción', genre: 'Sci-Fi' },
    { key: 'comedias', title: 'Comedias', genre: 'Comedy' },
  ],
}

export const TOP10_TITLE: Record<BrowseKind, string> = {
  movie: 'Top 10 películas de la semana',
  series: 'Top 10 series de la semana',
}

const tmdbKind = (kind: BrowseKind) => (kind === 'movie' ? 'movie' : 'tv')
const dateField = (kind: BrowseKind) => (kind === 'movie' ? 'primary_release_date' : 'first_air_date')

/** Tendencias de la semana en TMDB (el Top 10). */
export const trendingPath = (kind: BrowseKind) => `/trending/${tmdbKind(kind)}/week`

const NOISE_IDS = new Set(TV_NOISE.split('|').map(Number))

/** Saca de las tendencias lo que no sirve para la fila: sin póster y, en series, noticieros, reality y entrevistas. */
export function cleanTrending<T extends { poster_path?: string | null; genre_ids?: number[] }>(items: readonly T[], kind: BrowseKind): T[] {
  return items.filter((i) => !!i.poster_path && (kind === 'movie' || !i.genre_ids?.some((g) => NOISE_IDS.has(g))))
}

/** `/discover` de "Argentinas": país de origen AR, por popularidad. */
export function argentinasParams(kind: BrowseKind, today: string): Record<string, string | number | undefined> {
  return {
    language: 'es-MX',
    page: 1,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    with_origin_country: 'AR',
    'vote_count.gte': kind === 'movie' ? 15 : 5,
    [`${dateField(kind)}.lte`]: today,
    without_genres: kind === 'series' ? TV_NOISE : undefined,
  }
}

export const discoverPath = (kind: BrowseKind) => `/discover/${tmdbKind(kind)}`

/** Lo popular con IMDb ≥ 7, sin repetidos y en el orden en que vino. */
export function wellRated<T extends MetaPreview>(pages: readonly (readonly T[])[], min = MIN_IMDB): T[] {
  const seen = new Set<string>()
  return pages.flat().filter((m) => (ratingOf(m) ?? 0) >= min && !seen.has(m.id) && !!seen.add(m.id))
}

// ---------- "Ver todo": la grilla con filtros de siempre ----------

/** Grilla de "Popular" de Cinemeta con un filtro: es la misma lista que la fila. */
function cinemetaGrid(kind: BrowseKind, extra: Record<string, string>): string {
  const p = new URLSearchParams({ addon: CINEMETA_URL, catalog: 'top', ...extra })
  return `/discover/${kind}?${p.toString()}`
}

export const genreMoreTo = (kind: BrowseKind, genre: string) => cinemetaGrid(kind, { genre })
export const wellRatedMoreTo = (kind: BrowseKind) => cinemetaGrid(kind, { rating: String(MIN_IMDB) })
export const argentinasMoreTo = (kind: BrowseKind) => `/discover/${kind}?src=tmdb&country=AR`
/** La grilla sin filtros ("Explorar todo"). */
export const exploreAllTo = (kind: BrowseKind) => `/discover/${kind}?all=1`

/** Si la URL pide la grilla (trae filtros o `all`); sin nada, Películas y Series muestran las filas. */
export function wantsGrid(params: URLSearchParams): boolean {
  return [...params.keys()].length > 0
}

export const isBrowseKind = (type: string): type is BrowseKind => type === 'movie' || type === 'series'

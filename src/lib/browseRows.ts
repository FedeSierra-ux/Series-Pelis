// Películas y Series como página de filas (v0.15, U11). Lógica pura: qué filas van, de dónde sale
// cada una y los parámetros de TMDB. Sin dependencias del navegador para poder probarla con vitest.
//
// - "Top 10 en Argentina": ni TMDB ni Cinemeta saben qué se mira en cada país. Lo más parecido es
//   `discover` de TMDB limitado a lo que está en las plataformas de suscripción de Argentina
//   (JustWatch), ordenado por popularidad. Sin TMDB, los 10 primeros de "Popular" de Cinemeta.
// - "Bien calificadas" y los géneros salen de "Popular" de Cinemeta: traen el puntaje de IMDb (el
//   cartelito del póster) y no necesitan key.
// - "Argentinas" necesita TMDB (Cinemeta no sabe el país de origen).

import { CINEMETA_URL } from './addons'
import { ratingOf } from './discoverFilters'
import type { MetaPreview } from './types'

export type BrowseKind = 'movie' | 'series'

/** Puntaje mínimo de IMDb para "Bien calificadas". */
export const MIN_IMDB = 7

/**
 * Plataformas de suscripción más usadas en Argentina (ids de proveedor de TMDB / JustWatch):
 * Netflix, Disney+, Prime Video (los dos ids), Max / HBO Max, Apple TV+ y Paramount+.
 */
export const AR_PROVIDERS = '8|337|119|9|1899|384|350|531'

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
  movie: 'Top 10 películas en Argentina',
  series: 'Top 10 series en Argentina',
}

const tmdbKind = (kind: BrowseKind) => (kind === 'movie' ? 'movie' : 'tv')
const dateField = (kind: BrowseKind) => (kind === 'movie' ? 'primary_release_date' : 'first_air_date')

/** `/discover` del Top 10: lo más popular que está en las plataformas de Argentina y ya se estrenó. */
export function top10Params(kind: BrowseKind, today: string): Record<string, string | number | undefined> {
  return {
    language: 'es-MX',
    page: 1,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    watch_region: 'AR',
    with_watch_monetization_types: 'flatrate',
    with_watch_providers: AR_PROVIDERS,
    // Unos votos mínimos: si no, aparecen cosas que nadie vio.
    'vote_count.gte': kind === 'movie' ? 20 : 10,
    [`${dateField(kind)}.lte`]: today,
    without_genres: kind === 'series' ? TV_NOISE : undefined,
  }
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

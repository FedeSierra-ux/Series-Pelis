// Filtros y orden de Descubrir (v0.5). Lógica pura: ida y vuelta con la URL, parámetros de
// `discover` de TMDB y filtrado/orden del lado del cliente para los catálogos de addons.
// Sin dependencias del navegador para poder probarla con vitest.

import type { MetaPreview } from './types'

export type SortKey = 'popularity' | 'rating' | 'date' | 'title'

export interface DiscoverFilters {
  /** 'tmdb' = explorar con TMDB; vacío = catálogo de un addon. */
  src?: 'tmdb'
  addon?: string
  catalog?: string
  /** Con addons: el género tal cual lo da el catálogo ("Action"). Con TMDB: el id ("28"). */
  genre?: string
  from?: number
  to?: number
  /** Puntaje mínimo (0-10). */
  rating?: number
  /** Idioma original (ISO 639-1). */
  lang?: string
  /** País de origen (ISO 3166-1). */
  country?: string
  /** Proveedor de TMDB (JustWatch) en Argentina. */
  provider?: number
  sort: SortKey
  /** Palabra clave de TMDB y su nombre (para mostrarla sin pedirla de nuevo). */
  keyword?: number
  kw?: string
}

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'popularity', label: 'Popularidad' },
  { value: 'rating', label: 'Puntaje' },
  { value: 'date', label: 'Más nuevas' },
  { value: 'title', label: 'Título (A-Z)' },
]

export const RATINGS = [5, 6, 7, 7.5, 8, 8.5]

const intParam = (v: string | null, min: number, max: number): number | undefined => {
  if (!v || !/^\d+$/.test(v)) return undefined
  const n = Number(v)
  return n >= min && n <= max ? n : undefined
}

export function parseFilters(params: URLSearchParams): DiscoverFilters {
  const rating = Number(params.get('rating'))
  const sort = params.get('sort') as SortKey | null
  let from = intParam(params.get('from'), 1870, 2100)
  let to = intParam(params.get('to'), 1870, 2100)
  if (from && to && from > to) [from, to] = [to, from]
  const code = (v: string | null, len: number) => (v && new RegExp(`^[a-zA-Z]{${len}}$`).test(v) ? v : undefined)
  return {
    src: params.get('src') === 'tmdb' ? 'tmdb' : undefined,
    addon: params.get('addon') || undefined,
    catalog: params.get('catalog') || undefined,
    genre: params.get('genre') || undefined,
    from,
    to,
    rating: rating > 0 && rating <= 10 ? rating : undefined,
    lang: code(params.get('lang'), 2)?.toLowerCase(),
    country: code(params.get('country'), 2)?.toUpperCase(),
    provider: intParam(params.get('provider'), 1, 1e9),
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : 'popularity',
    keyword: intParam(params.get('keyword'), 1, 1e12),
    kw: params.get('kw') || undefined,
  }
}

/** Filtros → query string. Lo que está en su valor por defecto no se escribe. */
export function filtersToParams(f: DiscoverFilters): URLSearchParams {
  const p = new URLSearchParams()
  const put = (k: string, v: string | number | undefined) => v !== undefined && v !== '' && p.set(k, String(v))
  put('src', f.src)
  if (f.src !== 'tmdb') {
    put('addon', f.addon)
    put('catalog', f.catalog)
  }
  put('genre', f.genre)
  put('from', f.from)
  put('to', f.to)
  put('rating', f.rating)
  put('lang', f.lang)
  put('country', f.country)
  put('provider', f.provider)
  if (f.sort !== 'popularity') put('sort', f.sort)
  put('keyword', f.keyword)
  if (f.keyword) put('kw', f.kw)
  return p
}

/** Filtros que solo puede resolver TMDB (los catálogos de addons no traen esos datos). */
export function needsTmdb(f: DiscoverFilters): boolean {
  return !!(f.lang || f.country || f.provider || f.keyword)
}

/** Cuántos filtros "avanzados" hay puestos (para el botón "Filtros (n)"). */
export function activeCount(f: DiscoverFilters): number {
  return [f.from || f.to, f.rating, f.lang, f.country, f.provider, f.sort !== 'popularity', f.keyword].filter(Boolean).length
}

/** Saca los filtros avanzados y deja catálogo y género. */
export function clearAdvanced(f: DiscoverFilters): DiscoverFilters {
  return { src: f.src, addon: f.addon, catalog: f.catalog, genre: f.genre, sort: 'popularity' }
}

// ---------- Géneros ----------

export const TMDB_GENRES: Record<'movie' | 'tv', { id: number; name: string }[]> = {
  movie: [
    { id: 28, name: 'Acción' },
    { id: 12, name: 'Aventura' },
    { id: 16, name: 'Animación' },
    { id: 35, name: 'Comedia' },
    { id: 80, name: 'Crimen' },
    { id: 99, name: 'Documental' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Familia' },
    { id: 14, name: 'Fantasía' },
    { id: 36, name: 'Historia' },
    { id: 27, name: 'Terror' },
    { id: 10402, name: 'Música' },
    { id: 9648, name: 'Misterio' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Ciencia ficción' },
    { id: 53, name: 'Suspenso' },
    { id: 10752, name: 'Bélica' },
    { id: 37, name: 'Western' },
    { id: 10770, name: 'Película de TV' },
  ],
  tv: [
    { id: 10759, name: 'Acción y aventura' },
    { id: 16, name: 'Animación' },
    { id: 35, name: 'Comedia' },
    { id: 80, name: 'Crimen' },
    { id: 99, name: 'Documental' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Familia' },
    { id: 10762, name: 'Infantil' },
    { id: 9648, name: 'Misterio' },
    { id: 10765, name: 'Ciencia ficción y fantasía' },
    { id: 10768, name: 'Guerra y política' },
    { id: 10764, name: 'Reality' },
    { id: 10767, name: 'Talk show' },
    { id: 10763, name: 'Noticias' },
    { id: 10766, name: 'Telenovela' },
    { id: 37, name: 'Western' },
  ],
}

// Géneros de Cinemeta (en inglés) ↔ ids de TMDB. En series TMDB junta algunos.
const CINEMETA_TO_TMDB: Record<string, { movie?: number; tv?: number }> = {
  Action: { movie: 28, tv: 10759 },
  Adventure: { movie: 12, tv: 10759 },
  Animation: { movie: 16, tv: 16 },
  Comedy: { movie: 35, tv: 35 },
  Crime: { movie: 80, tv: 80 },
  Documentary: { movie: 99, tv: 99 },
  Drama: { movie: 18, tv: 18 },
  Family: { movie: 10751, tv: 10751 },
  Fantasy: { movie: 14, tv: 10765 },
  History: { movie: 36, tv: 10768 },
  Horror: { movie: 27 },
  Music: { movie: 10402 },
  Musical: { movie: 10402 },
  Mystery: { movie: 9648, tv: 9648 },
  News: { tv: 10763 },
  'Reality-TV': { tv: 10764 },
  'Game-Show': { tv: 10764 },
  Romance: { movie: 10749 },
  'Sci-Fi': { movie: 878, tv: 10765 },
  'Talk-Show': { tv: 10767 },
  Thriller: { movie: 53 },
  War: { movie: 10752, tv: 10768 },
  Western: { movie: 37, tv: 37 },
}

export const tmdbKind = (type: string): 'movie' | 'tv' => (type === 'movie' ? 'movie' : 'tv')

export function cinemetaToTmdbGenre(name: string | undefined, type: string): string | undefined {
  if (!name) return undefined
  if (/^\d+$/.test(name)) return name
  const id = CINEMETA_TO_TMDB[name]?.[tmdbKind(type)]
  return id ? String(id) : undefined
}

export function tmdbToCinemetaGenre(id: string | undefined, type: string): string | undefined {
  if (!id || !/^\d+$/.test(id)) return id
  const kind = tmdbKind(type)
  return Object.entries(CINEMETA_TO_TMDB).find(([, v]) => String(v[kind]) === id)?.[0]
}

export function tmdbGenreName(id: string | undefined, type: string): string | undefined {
  return TMDB_GENRES[tmdbKind(type)].find((g) => String(g.id) === id)?.name
}

// ---------- Idiomas y países (los más pedidos; con nombre en español) ----------

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'Inglés' },
  { code: 'fr', name: 'Francés' },
  { code: 'it', name: 'Italiano' },
  { code: 'de', name: 'Alemán' },
  { code: 'pt', name: 'Portugués' },
  { code: 'ja', name: 'Japonés' },
  { code: 'ko', name: 'Coreano' },
  { code: 'zh', name: 'Chino' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turco' },
  { code: 'sv', name: 'Sueco' },
  { code: 'da', name: 'Danés' },
  { code: 'no', name: 'Noruego' },
  { code: 'ru', name: 'Ruso' },
  { code: 'pl', name: 'Polaco' },
  { code: 'nl', name: 'Neerlandés' },
  { code: 'th', name: 'Tailandés' },
]

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'AR', name: 'Argentina' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'ES', name: 'España' },
  { code: 'MX', name: 'México' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'FR', name: 'Francia' },
  { code: 'IT', name: 'Italia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'JP', name: 'Japón' },
  { code: 'KR', name: 'Corea del Sur' },
  { code: 'IN', name: 'India' },
  { code: 'CA', name: 'Canadá' },
  { code: 'AU', name: 'Australia' },
  { code: 'SE', name: 'Suecia' },
  { code: 'DK', name: 'Dinamarca' },
  { code: 'TR', name: 'Turquía' },
  { code: 'CN', name: 'China' },
]

/** Años para los selectores: del año que viene hacia atrás. */
export function yearOptions(now = new Date().getFullYear(), oldest = 1920): number[] {
  return Array.from({ length: now + 1 - oldest + 1 }, (_, i) => now + 1 - i)
}

// ---------- TMDB discover ----------

/** Parámetros de `/discover/movie|tv`. `today` es "AAAA-MM-DD" (para no listar lo que no se estrenó). */
export function tmdbDiscoverParams(
  f: DiscoverFilters,
  kind: 'movie' | 'tv',
  page: number,
  today: string,
): Record<string, string | number | undefined> {
  const dateField = kind === 'movie' ? 'primary_release_date' : 'first_air_date'
  const sortBy =
    f.sort === 'rating'
      ? 'vote_average.desc'
      : f.sort === 'date'
        ? `${dateField}.desc`
        : f.sort === 'title'
          ? kind === 'movie'
            ? 'title.asc'
            : 'name.asc'
          : 'popularity.desc'
  // Por puntaje o con puntaje mínimo, exigimos votos: si no, ganan las de un solo voto con 10.
  const minVotes = f.sort === 'rating' ? 300 : f.rating ? 50 : f.sort === 'date' || f.sort === 'title' ? 5 : undefined
  // "Más nuevas" no tiene que arrancar por lo que se estrena el año que viene.
  let lte = f.to ? `${f.to}-12-31` : undefined
  if (f.sort === 'date' && (!lte || lte > today)) lte = today
  return {
    language: 'es-MX',
    page,
    sort_by: sortBy,
    include_adult: 'false',
    with_genres: f.genre && /^\d+$/.test(f.genre) ? f.genre : undefined,
    [`${dateField}.gte`]: f.from ? `${f.from}-01-01` : undefined,
    [`${dateField}.lte`]: lte,
    'vote_average.gte': f.rating,
    'vote_count.gte': minVotes,
    with_original_language: f.lang,
    with_origin_country: f.country,
    with_watch_providers: f.provider,
    watch_region: f.provider ? 'AR' : undefined,
    with_keywords: f.keyword,
  }
}

// ---------- Del lado del cliente (catálogos de addons) ----------

/** Año de un ítem de catálogo: "2010", "2010–2015", "2010-" → 2010. */
export function yearOf(m: Pick<MetaPreview, 'releaseInfo' | 'year'>): number | undefined {
  const match = /\d{4}/.exec(m.year ?? m.releaseInfo ?? '')
  return match ? Number(match[0]) : undefined
}

export function ratingOf(m: Pick<MetaPreview, 'imdbRating'>): number | undefined {
  const n = parseFloat(m.imdbRating ?? '')
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Si hay algo que filtrar u ordenar del lado del cliente. */
export function hasClientFilters(f: DiscoverFilters): boolean {
  return !!(f.from || f.to || f.rating || f.sort !== 'popularity')
}

/**
 * Filtra y ordena lo que ya está cargado. "Popularidad" respeta el orden del catálogo.
 * Con año o puntaje, lo que no trae ese dato queda afuera.
 */
export function applyClientFilters<T extends MetaPreview>(items: readonly T[], f: DiscoverFilters): T[] {
  let out = items.filter((m) => {
    if (f.from || f.to) {
      const y = yearOf(m)
      if (!y || (f.from && y < f.from) || (f.to && y > f.to)) return false
    }
    if (f.rating) {
      const r = ratingOf(m)
      if (!r || r < f.rating) return false
    }
    return true
  })
  if (f.sort === 'rating') out = [...out].sort((a, b) => (ratingOf(b) ?? 0) - (ratingOf(a) ?? 0))
  else if (f.sort === 'date') out = [...out].sort((a, b) => (yearOf(b) ?? 0) - (yearOf(a) ?? 0))
  else if (f.sort === 'title') out = [...out].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  return out
}

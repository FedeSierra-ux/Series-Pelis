import { cached, HttpError, peekMemory } from './cache'
import { settingsStore } from './store'
import type { MetaPreview } from './types'

// Cliente de TMDB (api.themoviedb.org/3). Es opcional: sin key la app sigue con Cinemeta.
// Acepta la "API Key" (v3, va como ?api_key=) o el "API Read Access Token" (v4, un JWT que
// empieza con "eyJ" y va como Bearer). Todo en español latino, con inglés de respaldo.

const API = 'https://api.themoviedb.org/3'
export const LANG = 'es-MX'
export const REGION = 'AR'
const DAY = 24 * 60 * 60 * 1000

export type TmdbType = 'movie' | 'tv'
/** Tipos de la app (Stremio) ↔ TMDB. */
export const toTmdbType = (type: string): TmdbType => (type === 'movie' ? 'movie' : 'tv')
export const toAppType = (type: TmdbType | string): 'movie' | 'series' => (type === 'movie' ? 'movie' : 'series')

export function tmdbKey(): string {
  return settingsStore.get().tmdbKey.trim()
}

export function hasTmdb(): boolean {
  return tmdbKey().length > 0
}

export async function tmdbFetch<T>(path: string, params: Record<string, string | number | undefined> = {}, key = tmdbKey()): Promise<T> {
  if (!key) throw new Error('Falta la API key de TMDB')
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const bearer = key.startsWith('eyJ')
  if (!bearer) url.searchParams.set('api_key', key)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: bearer ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
    })
    if (!res.ok) throw new HttpError(res.status, API + path)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Pide a TMDB con caché stale-while-revalidate. La key no forma parte de la clave de caché. */
export function tmdbCached<T>(path: string, params: Record<string, string | number | undefined> = {}, ttlMs = DAY): Promise<T> {
  const key = `tmdb:${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString()}`
  return cached(key, () => tmdbFetch<T>(path, params), ttlMs)
}

/** Prueba una key antes de guardarla. */
export async function testTmdbKey(key: string): Promise<boolean> {
  try {
    await tmdbFetch('/configuration', {}, key.trim())
    return true
  } catch {
    return false
  }
}

// ---------- Imágenes ----------

export type ImgSize = 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' | 'h632'

export function tmdbImg(path: string | null | undefined, size: ImgSize = 'w342'): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined
}

// ---------- Tipos de respuesta (solo lo que usamos) ----------

export interface TmdbListItem {
  id: number
  media_type?: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  profile_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  genre_ids?: number[]
  character?: string
  job?: string
  popularity?: number
}

export interface TmdbPage<T = TmdbListItem> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export interface TmdbCast {
  id: number
  name: string
  character?: string
  profile_path?: string | null
  order?: number
  roles?: { character: string; episode_count: number }[]
}

export interface TmdbVideo {
  key: string
  site: string
  type: string
  official?: boolean
  iso_639_1?: string
  name?: string
}

export interface TmdbProvider {
  provider_id: number
  provider_name: string
  logo_path: string
  display_priority: number
}

export interface TmdbProviders {
  link?: string
  flatrate?: TmdbProvider[]
  free?: TmdbProvider[]
  ads?: TmdbProvider[]
  rent?: TmdbProvider[]
  buy?: TmdbProvider[]
}

export interface TmdbDetails {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  tagline?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  genres?: { id: number; name: string }[]
  vote_average?: number
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null; backdrop_path?: string | null } | null
  number_of_seasons?: number
  external_ids?: { imdb_id?: string | null }
  imdb_id?: string | null
  credits?: { cast: TmdbCast[]; crew: { id: number; name: string; job: string; department: string }[] }
  aggregate_credits?: { cast: TmdbCast[] }
  videos?: { results: TmdbVideo[] }
  images?: { logos: { file_path: string; iso_639_1: string | null; aspect_ratio: number }[] }
  recommendations?: TmdbPage
  similar?: TmdbPage
  'watch/providers'?: { results: Record<string, TmdbProviders> }
}

export interface TmdbCollection {
  id: number
  name: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  parts: TmdbListItem[]
}

export interface TmdbPerson {
  id: number
  name: string
  biography?: string
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  profile_path?: string | null
  known_for_department?: string
  imdb_id?: string | null
  combined_credits?: { cast: TmdbListItem[]; crew: TmdbListItem[] }
}

// ---------- Ids: IMDb ↔ TMDB ----------

/** Id de TMDB a partir del de IMDb (`tt…`). Las series de Stremio usan el id de la serie. */
export async function findByImdb(imdbId: string, type: string): Promise<number | undefined> {
  const res = await tmdbCached<{ movie_results: TmdbListItem[]; tv_results: TmdbListItem[] }>(
    `/find/${imdbId}`,
    { external_source: 'imdb_id' },
    30 * DAY,
  )
  const list = toTmdbType(type) === 'movie' ? res.movie_results : res.tv_results
  return (list[0] ?? res.movie_results[0] ?? res.tv_results[0])?.id
}

/** Id de IMDb a partir del de TMDB, para abrir la ficha y pedir streams a los addons. */
export async function imdbFromTmdb(tmdbId: number | string, type: TmdbType): Promise<string | undefined> {
  const res = await tmdbCached<{ imdb_id?: string | null }>(`/${type}/${tmdbId}/external_ids`, {}, 30 * DAY)
  return res.imdb_id || undefined
}

/** Ruta de la ficha para un ítem de TMDB. Si no sabemos el id de IMDb, la ficha lo resuelve al abrir. */
export function tmdbDetailPath(item: { id: number; media_type?: string }, fallbackType?: TmdbType): string {
  const type = (item.media_type as TmdbType) || fallbackType || 'movie'
  return `/detail/${toAppType(type)}/tmdb:${type}:${item.id}`
}

/** "tmdb:movie:603" → { type, id } */
export function parseTmdbId(id: string): { type: TmdbType; id: number } | undefined {
  const m = /^tmdb:(movie|tv):(\d+)$/.exec(id)
  return m ? { type: m[1] as TmdbType, id: Number(m[2]) } : undefined
}

// ---------- Endpoints ----------

export function getDetails(type: TmdbType, id: number): Promise<TmdbDetails> {
  const extra =
    type === 'movie'
      ? 'credits,videos,images,recommendations,similar,watch/providers,external_ids'
      : 'aggregate_credits,videos,images,recommendations,similar,watch/providers,external_ids'
  return tmdbCached<TmdbDetails>(`/${type}/${id}`, {
    language: LANG,
    append_to_response: extra,
    include_image_language: 'es,en,null',
    include_video_language: 'es,en',
  })
}

/** Detalles a partir del id de IMDb (lo que usa toda la app). */
export async function getDetailsByImdb(imdbId: string, type: string): Promise<TmdbDetails | undefined> {
  const id = await findByImdb(imdbId, type)
  return id ? getDetails(toTmdbType(type), id) : undefined
}

export function getCollection(id: number): Promise<TmdbCollection> {
  return tmdbCached<TmdbCollection>(`/collection/${id}`, { language: LANG })
}

export function getPerson(id: number): Promise<TmdbPerson> {
  return tmdbCached<TmdbPerson>(`/person/${id}`, { language: LANG, append_to_response: 'combined_credits' })
}

export function getTrending(type: 'all' | TmdbType = 'all', window: 'day' | 'week' = 'day'): Promise<TmdbPage> {
  return tmdbCached<TmdbPage>(`/trending/${type}/${window}`, { language: LANG }, 3 * 60 * 60 * 1000)
}

export function getRecommendations(type: TmdbType, id: number): Promise<TmdbPage> {
  return tmdbCached<TmdbPage>(`/${type}/${id}/recommendations`, { language: LANG })
}

// ---------- Ayudas ----------

export const itemTitle = (i: { title?: string; name?: string }) => i.title ?? i.name ?? ''
export const itemYear = (i: { release_date?: string; first_air_date?: string }) => (i.release_date || i.first_air_date || '').slice(0, 4)

/** Tráiler de YouTube: primero en español, después oficial, después cualquiera. */
export function pickTrailer(videos: TmdbVideo[] | undefined): TmdbVideo | undefined {
  const yt = (videos ?? []).filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
  const score = (v: TmdbVideo) => (v.iso_639_1 === 'es' ? 4 : 0) + (v.type === 'Trailer' ? 2 : 0) + (v.official ? 1 : 0)
  return yt.sort((a, b) => score(b) - score(a))[0]
}

/** Logo del título (PNG transparente): español, inglés o sin idioma. */
export function pickLogo(d: TmdbDetails | undefined): string | undefined {
  const logos = d?.images?.logos ?? []
  const rank = (l: { iso_639_1: string | null }) => (l.iso_639_1 === 'es' ? 0 : l.iso_639_1 === 'en' ? 1 : l.iso_639_1 === null ? 2 : 3)
  return [...logos].sort((a, b) => rank(a) - rank(b))[0]?.file_path
}

export function providersFor(d: TmdbDetails | undefined, region = REGION): TmdbProviders | undefined {
  return d?.['watch/providers']?.results?.[region]
}

/** Ítem de TMDB → tarjeta de la app. El id queda como `tmdb:movie:603`; la ficha lo traduce a IMDb. */
export function tmdbToPreview(item: TmdbListItem, fallbackType?: TmdbType): MetaPreview {
  const type = (item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : fallbackType) ?? 'movie'
  return {
    id: `tmdb:${type}:${item.id}`,
    type: toAppType(type),
    name: itemTitle(item),
    poster: tmdbImg(item.poster_path, 'w342'),
    background: tmdbImg(item.backdrop_path, 'w1280'),
    description: item.overview,
    releaseInfo: itemYear(item),
  }
}

/** Reparto de un episodio: los fijos de la serie y los invitados de ese capítulo. */
export async function getEpisodeCast(tvId: number, season: number, episode: number): Promise<{ cast: TmdbCast[]; guests: TmdbCast[] }> {
  const res = await tmdbCached<{ cast?: TmdbCast[]; guest_stars?: TmdbCast[] }>(`/tv/${tvId}/season/${season}/episode/${episode}/credits`, {
    language: LANG,
  })
  return { cast: res.cast ?? [], guests: res.guest_stars ?? [] }
}

/** Lo que `tmdbCached` ya tiene en memoria para ese pedido (para pintar sin parpadeo al volver). */
export function peekTmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): T | undefined {
  const key = `tmdb:${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString()}`
  return peekMemory<T>(key)?.data
}

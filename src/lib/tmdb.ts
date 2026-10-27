import { useSyncExternalStore } from 'react'
import { cached, HttpError, peekMemory } from './cache'
import { tmdbGenreName } from './discoverFilters'
import { settingsStore, useStore } from './store'
import type { MetaPreview } from './types'
import { reportUnauthorized } from './auth'
import { baseImdbId, isFresh, peekTitleEntry, rememberTitle } from './localTitlesStore'

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

// ---------- Key del sitio ----------
// Publicada en Cloudflare, la key va como secreto (TMDB_KEY) y los pedidos pasan por /api/tmdb
// (functions/api/tmdb/[[path]].ts): así la familia no tiene que configurar nada. Una key propia
// cargada en Ajustes tiene prioridad.

/** Valor de `tmdbKey()` cuando se usa la key del sitio. */
export const SERVER_KEY = 'server'
const SERVER_FLAG = 'sp-tmdb-server'
const SERVER_PROXY = '/api/tmdb'

function readServerFlag(): boolean {
  try {
    return localStorage.getItem(SERVER_FLAG) === '1'
  } catch {
    return false
  }
}

// Arranca con lo de la última vez (guardado en localStorage) para no esperar al servidor al abrir.
let serverTmdb = readServerFlag()
const serverListeners = new Set<() => void>()

function setServerTmdb(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(SERVER_FLAG, '1')
    else localStorage.removeItem(SERVER_FLAG)
  } catch {
    // Sin localStorage: solo vale para esta sesión.
  }
  if (enabled === serverTmdb) return
  serverTmdb = enabled
  serverListeners.forEach((l) => l())
}

/** ¿El sitio tiene TMDB activado? Se pregunta una vez al abrir la app. Sin red se queda con lo anterior. */
export async function probeServerTmdb(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_PROXY}/_status`, { headers: { Accept: 'application/json' } })
    // En local (Vite) no existe la función y vuelve el index.html: eso cuenta como "no".
    const body = res.ok && (res.headers.get('Content-Type') ?? '').includes('json') ? ((await res.json()) as { enabled?: unknown }) : undefined
    setServerTmdb(body?.enabled === true)
  } catch {
    // Sin conexión: no cambiamos nada.
  }
  return serverTmdb
}

export function hasServerTmdb(): boolean {
  return serverTmdb
}

const subscribeServer = (listener: () => void) => {
  serverListeners.add(listener)
  return () => serverListeners.delete(listener)
}

/** Avisa cuando cambia si el sitio tiene TMDB. Devuelve la función para dejar de escuchar. */
export const onServerTmdbChange = subscribeServer

export function useServerTmdb(): boolean {
  return useSyncExternalStore(subscribeServer, hasServerTmdb, hasServerTmdb)
}

/** La key propia de Ajustes; si no hay, la del sitio (`SERVER_KEY`); si tampoco, ''. */
export function tmdbKey(): string {
  return settingsStore.get().tmdbKey.trim() || (serverTmdb ? SERVER_KEY : '')
}

/** Igual que `tmdbKey()`, pero se actualiza al cambiar la key o al responder el sitio. */
export function useTmdbKey(): string {
  const own = useStore(settingsStore).tmdbKey.trim()
  const server = useServerTmdb()
  return own || (server ? SERVER_KEY : '')
}

export function hasTmdb(): boolean {
  return tmdbKey().length > 0
}

export async function tmdbFetch<T>(path: string, params: Record<string, string | number | undefined> = {}, key = tmdbKey()): Promise<T> {
  if (!key) throw new Error('Falta la API key de TMDB')
  const viaServer = key === SERVER_KEY
  const url = viaServer ? new URL(SERVER_PROXY + path, location.origin) : new URL(API + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const bearer = !viaServer && key.startsWith('eyJ')
  if (!viaServer && !bearer) url.searchParams.set('api_key', key)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: bearer ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
    })
    // 401 del sitio: la sesión de la casa se cerró (desde otro aparato) y hay que volver a entrar.
    if (viaServer && res.status === 401) reportUnauthorized()
    if (!res.ok) throw new HttpError(res.status, (viaServer ? SERVER_PROXY : API) + path)
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
  original_language?: string
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

export interface TmdbAggregateCrew {
  id: number
  name: string
  department?: string
  jobs?: { job: string; episode_count?: number }[]
  total_episode_count?: number
}

export interface TmdbVideo {
  key: string
  site: string
  type: string
  official?: boolean
  iso_639_1?: string
  /** País del video: `MX`, `AR`… (latino) o `ES` (España). */
  iso_3166_1?: string
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
  /** Idioma original (ISO 639-1): con `es`, el tráiler en español es el audio original. */
  original_language?: string
  tagline?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  /** TMDB dejó `episode_run_time` vacío en casi todas las series: la duración sale del último episodio. */
  last_episode_to_air?: { runtime?: number | null } | null
  genres?: { id: number; name: string }[]
  vote_average?: number
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null; backdrop_path?: string | null } | null
  number_of_seasons?: number
  external_ids?: { imdb_id?: string | null }
  imdb_id?: string | null
  credits?: { cast: TmdbCast[]; crew: { id: number; name: string; job: string; department: string }[] }
  /** Series: el equipo agregado trae los trabajos de cada persona en `jobs` (no en `job`). */
  aggregate_credits?: { cast: TmdbCast[]; crew?: TmdbAggregateCrew[] }
  /** Series: quién la creó (vacío en muchas series de otros países). */
  created_by?: { id: number; name: string }[]
  /** Series: países de origen (ISO 3166-1, `US`, `AR`…). */
  origin_country?: string[]
  production_countries?: { iso_3166_1: string; name: string }[]
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

/** Pedidos `/find` en curso (el mismo título desde varias tarjetas va una sola vez). */
const finding = new Map<string, Promise<number | undefined>>()

/**
 * Pide `/find/{tt}` en español (v0.28): con el mismo pedido salen el id de TMDB y el nombre en español, que queda
 * en el mapa de `localTitlesStore` (30 días; no en la caché general). Devuelve el id de TMDB.
 */
export function fetchFind(imdbId: string, type?: string): Promise<number | undefined> {
  const tt = baseImdbId(imdbId) ?? imdbId
  const running = finding.get(tt)
  if (running) return running
  const job = tmdbFetch<{ movie_results: TmdbListItem[]; tv_results: TmdbListItem[] }>(`/find/${tt}`, { external_source: 'imdb_id', language: LANG })
    .then((res) => {
      const movies = res.movie_results ?? []
      const shows = res.tv_results ?? []
      const preferred = type ? (toTmdbType(type) === 'movie' ? movies : shows) : []
      const hit = preferred[0] ?? movies[0] ?? shows[0]
      const kind: TmdbType | undefined = !hit ? undefined : movies.includes(hit) ? 'movie' : 'tv'
      rememberTitle(tt, hit, kind)
      return hit?.id
    })
    .finally(() => finding.delete(tt))
  finding.set(tt, job)
  return job
}

/** Id de TMDB a partir del de IMDb (`tt…`). Las series de Stremio usan el id de la serie. */
export async function findByImdb(imdbId: string, type: string): Promise<number | undefined> {
  // El id de TMDB no cambia: si ya se sabe, no se pregunta (aunque el nombre esté por vencer).
  const known = peekTitleEntry(imdbId)
  if (known?.t !== undefined) return known.t
  if (known && isFresh(known)) return undefined
  return fetchFind(imdbId, type)
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
  }).then((d) => {
    // v0.28: la ficha ya trae el nombre en español; queda anotado para las tarjetas sin otro pedido.
    const tt = d.external_ids?.imdb_id ?? d.imdb_id
    if (tt && !isFresh(peekTitleEntry(tt))) rememberTitle(tt, d, type)
    return d
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

/** Estrenos en cines de Argentina (para la portada de Inicio). */
export function getNowPlaying(): Promise<TmdbPage> {
  return tmdbCached<TmdbPage>('/movie/now_playing', { language: LANG, region: REGION }, 6 * 60 * 60 * 1000)
}

export function getRecommendations(type: TmdbType, id: number): Promise<TmdbPage> {
  return tmdbCached<TmdbPage>(`/${type}/${id}/recommendations`, { language: LANG })
}

// ---------- Ayudas ----------

export const itemTitle = (i: { title?: string; name?: string }) => i.title ?? i.name ?? ''
/** Duración en minutos de TMDB → "2 h 6 min" / "45 min". */
export function formatRuntime(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}
export const itemYear = (i: { release_date?: string; first_air_date?: string }) => (i.release_date || i.first_air_date || '').slice(0, 4)

// ---------- Tráiler (v0.24: latino primero) ----------

/** Países cuyo español es latino (EE. UU. incluido: los tráileres en español de allá van con doblaje neutro). */
const LATAM = new Set(['AR', 'MX', 'CO', 'CL', 'PE', 'VE', 'UY', 'PY', 'BO', 'EC', 'CR', 'GT', 'HN', 'SV', 'NI', 'PA', 'DO', 'PR', 'CU', 'US'])
const SPAIN_NAME = /castellano|españa|\bvose?\b/i
const LATINO_NAME = /latino|latam|latinoam|m[eé]xico/i
const SUBBED_NAME = /subtitulad|\bsubt?s?\b|\bvose?\b|leyendas/i

/** Un tráiler en español de España (por el país del video o por el nombre). */
export function isSpainTrailer(v: Pick<TmdbVideo, 'iso_3166_1' | 'name'>): boolean {
  const name = v.name ?? ''
  if (LATINO_NAME.test(name)) return false
  return SPAIN_NAME.test(name) || (!!v.iso_3166_1 && !LATAM.has(v.iso_3166_1))
}

/** Puntaje del tráiler en su idioma, sin contar tipo ni "oficial". Arriba de `ORIGINAL_TRAILER` = buen tráiler en español. */
export const ORIGINAL_TRAILER = 30

/**
 * Qué tan bien le viene el tráiler al usuario (pedido de la v0.24): subtitulado en latino; si no, con audio
 * latino; después el de España subtitulado; después el idioma original (YouTube le fuerza subtítulos en español
 * si los tiene) y el doblado de España, al final. Si la peli es de habla hispana, el tráiler en español es el audio
 * original: latino primero, igual.
 */
export function trailerLangScore(v: Pick<TmdbVideo, 'iso_639_1' | 'iso_3166_1' | 'name'>, originalLanguage?: string): number {
  if (v.iso_639_1 !== 'es') return v.iso_639_1 === originalLanguage || v.iso_639_1 === 'en' ? ORIGINAL_TRAILER : 10
  const spain = isSpainTrailer(v)
  if (originalLanguage === 'es') return spain ? 50 : 60
  const subbed = SUBBED_NAME.test(v.name ?? '')
  if (!spain) return subbed ? 60 : 50
  return subbed ? 35 : 15
}

/** Tráiler de YouTube para la ficha y los pósters: el mejor por idioma, después tráiler antes que avance, y oficial. */
export function pickTrailer(videos: TmdbVideo[] | undefined, originalLanguage?: string): TmdbVideo | undefined {
  const yt = (Array.isArray(videos) ? videos : []).filter((v) => v && v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
  const score = (v: TmdbVideo) => trailerLangScore(v, originalLanguage) * 4 + (v.type === 'Trailer' ? 2 : 0) + (v.official ? 1 : 0)
  return yt.sort((a, b) => score(b) - score(a))[0]
}

/**
 * Logo del título (PNG transparente) con su nombre original: inglés, sin idioma, otro y el doblado al
 * español al final. Desde la v0.28 el nombre va en español, pero el logo sigue en el idioma original (decisión
 * del usuario).
 */
export function pickLogo(d: TmdbDetails | undefined): string | undefined {
  const logos = d?.images?.logos ?? []
  const rank = (l: { iso_639_1: string | null }) => (l.iso_639_1 === 'en' ? 0 : l.iso_639_1 === null ? 1 : l.iso_639_1 === 'es' ? 3 : 2)
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
    released: item.release_date || item.first_air_date || undefined,
    // Para la tarjeta apaisada ("2024 · Ciencia ficción"). Ya vienen en español.
    genres: item.genre_ids?.flatMap((g) => tmdbGenreName(String(g), toAppType(type)) ?? []),
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

// ---------- v0.4: reproductor ----------

export interface TmdbEpisode {
  name?: string
  overview?: string
  still_path?: string | null
  air_date?: string
}

/** Título y sinopsis de un episodio en español (para la pausa). */
export function getEpisodeInfo(tvId: number, season: number, episode: number): Promise<TmdbEpisode> {
  return tmdbCached<TmdbEpisode>(`/tv/${tvId}/season/${season}/episode/${episode}`, { language: LANG })
}

/** v0.26 (ficha-11): la temporada entera en español, en un solo pedido (para la sinopsis de cada episodio en la ficha). */
export async function getSeasonInfo(tvId: number, season: number): Promise<(TmdbEpisode & { episode_number: number })[]> {
  const res = await tmdbCached<{ episodes?: (TmdbEpisode & { episode_number: number })[] }>(`/tv/${tvId}/season/${season}`, { language: LANG })
  return Array.isArray(res.episodes) ? res.episodes : []
}

export type CreditsStinger = 'after' | 'during'

// Palabras clave de TMDB (verificadas contra /keyword/{id}); por las dudas también se compara el nombre.
const STINGER_IDS: Record<number, CreditsStinger> = { 179430: 'after', 179431: 'during' }
const STINGER_NAMES: Record<string, CreditsStinger> = { aftercreditsstinger: 'after', duringcreditsstinger: 'during' }

/** Si la peli tiene escena después (o durante) los créditos, según las palabras clave de TMDB. */
export async function getCreditsStinger(movieId: number): Promise<CreditsStinger | undefined> {
  const res = await tmdbCached<{ keywords?: { id: number; name: string }[] }>(`/movie/${movieId}/keywords`, {}, 30 * DAY)
  const kinds = (res.keywords ?? []).map((k) => STINGER_IDS[k.id] ?? STINGER_NAMES[k.name.toLowerCase().replace(/[\s-]/g, '')])
  return kinds.includes('after') ? 'after' : kinds.includes('during') ? 'during' : undefined
}

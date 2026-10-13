import { CINEMETA_URL, resourceUrl } from './addons'
import { cached, fetchJson, HttpError, isFresh, load, peek } from './cache'
import {
  curatedById,
  oscarsUrl,
  parseOscars,
  rankByImdb,
  SAGA_IDS,
  TOP_PAGE_SIZE,
  TOP_POOL_PAGES,
  intersectCredits,
  type SparqlResponse,
  type TogetherItem,
} from './curated'
import { tmdbDiscoverParams, tmdbKind, type DiscoverFilters } from './discoverFilters'
import { addonsStore } from './store'
import {
  getCollection,
  getPerson,
  LANG,
  REGION,
  tmdbCached,
  tmdbImg,
  tmdbToPreview,
  type TmdbListItem,
  type TmdbPage,
  type TmdbPerson,
} from './tmdb'
import type { CatalogDef, InstalledAddon, MetaPreview } from './types'

// Pedidos de red de la v0.5 (Buscar, Descubrir, listas curadas). Todo pasa por `cached` /
// `tmdbCached` para que volver atrás sea instantáneo.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ---------- Búsqueda ----------

/**
 * Búsqueda en un catálogo que se puede cancelar: mientras escribís, el pedido de la letra
 * anterior se aborta en vez de quedar ocupando la conexión. Usa la misma caché que `getCatalog`.
 */
export async function searchCatalog(
  addon: InstalledAddon,
  catalog: CatalogDef,
  query: string,
  signal: AbortSignal,
): Promise<MetaPreview[]> {
  const url = resourceUrl(addon, 'catalog', catalog.type, catalog.id, { search: query })
  const key = `catalog:${url}`
  const hit = await peek<MetaPreview[]>(key, false)
  if (hit && isFresh(hit, HOUR)) return hit.data
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15000)
  const onAbort = () => ctrl.abort()
  signal.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new HttpError(res.status, url)
    const metas = ((await res.json()) as { metas?: MetaPreview[] }).metas ?? []
    // Se guarda recién al terminar: un pedido abortado nunca queda "en vuelo" para el próximo.
    return load(key, async () => metas, false)
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
  }
}

export interface TmdbPersonResult {
  id: number
  name: string
  profile_path?: string | null
  known_for_department?: string
  popularity?: number
  known_for?: TmdbListItem[]
}

export async function searchPeople(query: string): Promise<TmdbPersonResult[]> {
  const res = await tmdbCached<TmdbPage<TmdbPersonResult>>(
    '/search/person',
    { query: query.trim().toLowerCase(), language: LANG, include_adult: 'false' },
    6 * HOUR,
  )
  return res.results ?? []
}

/** La persona que mejor coincide con un nombre (la primera de TMDB, que ya viene por relevancia). */
export async function findPerson(name: string): Promise<TmdbPersonResult | undefined> {
  return (await searchPeople(name))[0]
}

// ---------- Dos personas juntas ----------

export interface Together {
  a: TmdbPerson
  b: TmdbPerson
  items: TogetherItem[]
}

const allCredits = (p: TmdbPerson) => [...(p.combined_credits?.cast ?? []), ...(p.combined_credits?.crew ?? [])]

/** Títulos en común según los créditos combinados (cine y TV, delante y detrás de cámara). */
export async function getTogether(a: number, b: number): Promise<Together> {
  const [pa, pb] = await Promise.all([getPerson(a), getPerson(b)])
  return { a: pa, b: pb, items: intersectCredits(allCredits(pa), allCredits(pb)) }
}

// ---------- Descubrir con TMDB ----------

export interface DiscoverPage {
  items: MetaPreview[]
  totalPages: number
}

export const today = () => new Date().toISOString().slice(0, 10)

export async function tmdbDiscover(type: string, filters: DiscoverFilters, page: number): Promise<DiscoverPage> {
  const kind = tmdbKind(type)
  const res = await tmdbCached<TmdbPage>(`/discover/${kind}`, tmdbDiscoverParams(filters, kind, page, today()), 6 * HOUR)
  return {
    items: res.results.map((i) => {
      const meta = tmdbToPreview(i, kind)
      // El puntaje de TMDB va en el subtítulo (no es el de IMDb, así que no usa el cartelito amarillo).
      const vote = i.vote_average && i.vote_average > 0 ? `★ ${i.vote_average.toFixed(1)}` : ''
      return { ...meta, releaseInfo: [meta.releaseInfo, vote].filter(Boolean).join(' · ') }
    }),
    // TMDB no deja pasar de la página 500.
    totalPages: Math.min(res.total_pages || 1, 500),
  }
}

export interface ProviderOption {
  id: number
  name: string
  logo?: string
}

interface ProviderListItem {
  provider_id: number
  provider_name: string
  logo_path?: string
  display_priorities?: Record<string, number>
  display_priority?: number
}

/** Plataformas disponibles en Argentina, en el orden en que las muestra JustWatch. */
export async function getProviders(type: string, region = REGION): Promise<ProviderOption[]> {
  const kind = tmdbKind(type)
  const res = await tmdbCached<{ results?: ProviderListItem[] }>(
    `/watch/providers/${kind}`,
    { watch_region: region, language: LANG },
    7 * DAY,
  )
  const prio = (p: ProviderListItem) => p.display_priorities?.[region] ?? p.display_priority ?? 999
  return (res.results ?? [])
    .sort((a, b) => prio(a) - prio(b))
    .slice(0, 40)
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: tmdbImg(p.logo_path, 'w92') }))
}

export interface Keyword {
  id: number
  name: string
}

/** Palabras clave de un título. Las de pelis usan la misma clave de caché que la escena post-créditos. */
export async function getKeywords(type: string, id: number): Promise<Keyword[]> {
  if (tmdbKind(type) === 'movie') {
    const res = await tmdbCached<{ keywords?: Keyword[] }>(`/movie/${id}/keywords`, {}, 30 * DAY)
    return res.keywords ?? []
  }
  const res = await tmdbCached<{ results?: Keyword[] }>(`/tv/${id}/keywords`, {}, 30 * DAY)
  return res.results ?? []
}

export async function getKeywordName(id: number): Promise<string | undefined> {
  return (await tmdbCached<{ name?: string }>(`/keyword/${id}`, {}, 30 * DAY)).name
}

// ---------- Listas curadas ----------

export interface CuratedResult {
  title?: string
  items: MetaPreview[]
}

function cinemetaAddon(): InstalledAddon | undefined {
  return addonsStore.get().find((a) => a.transportUrl === CINEMETA_URL)
}

/** Las N páginas de "Populares" de Cinemeta, ordenadas por IMDb. Se guarda solo el resultado (liviano). */
function imdbTop(type: 'movie' | 'series'): Promise<MetaPreview[]> {
  return cached(
    `curated:imdb-top:${type}`,
    async () => {
      const base = cinemetaAddon()?.transportUrl.replace(/\/manifest\.json$/, '') ?? 'https://v3-cinemeta.strem.io'
      const urls = Array.from({ length: TOP_POOL_PAGES }, (_, i) =>
        i === 0 ? `${base}/catalog/${type}/top.json` : `${base}/catalog/${type}/top/skip=${i * TOP_PAGE_SIZE}.json`,
      )
      // De a 5 para no saturar la conexión del celular.
      const pages: MetaPreview[][] = []
      for (let i = 0; i < urls.length; i += 5) {
        const chunk = await Promise.allSettled(urls.slice(i, i + 5).map((u) => fetchJson<{ metas?: MetaPreview[] }>(u, 20000)))
        for (const r of chunk) if (r.status === 'fulfilled') pages.push((r.value.metas ?? []).map((m) => ({ ...m, type: m.type ?? type })))
      }
      if (pages.length === 0) throw new Error('Cinemeta no respondió')
      return rankByImdb(pages)
    },
    3 * DAY,
  )
}

function oscars(): Promise<MetaPreview[]> {
  return cached('curated:oscars', async () => parseOscars(await fetchJson<SparqlResponse>(oscarsUrl(), 30000)), 7 * DAY)
}

async function sagas(): Promise<MetaPreview[]> {
  const results = await Promise.allSettled(SAGA_IDS.map((id) => getCollection(id)))
  return results.flatMap((r) =>
    r.status === 'fulfilled'
      ? [
          {
            id: `saga-${r.value.id}`,
            type: 'movie',
            name: r.value.name.replace(/\s*-\s*Colección$/i, '').replace(/\s*\(colección\)$/i, ''),
            poster: tmdbImg(r.value.poster_path, 'w342'),
            releaseInfo: `${r.value.parts.length} películas`,
          } satisfies MetaPreview,
        ]
      : [],
  )
}

async function saga(id: number): Promise<CuratedResult> {
  const c = await getCollection(id)
  const parts = [...c.parts].sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
  return { title: c.name.replace(/\s*-\s*Colección$/i, ''), items: parts.map((p) => tmdbToPreview(p, 'movie')) }
}

async function keywordList(keyword: number, type: 'movie' | 'series', page = 1): Promise<MetaPreview[]> {
  return (await tmdbDiscover(type, { keyword, sort: 'popularity' }, page)).items
}

/** Los títulos de una lista curada (o de una saga, `saga-<id>`). */
export async function loadCurated(id: string): Promise<CuratedResult> {
  const def = curatedById(id)
  if (!def) throw new Error('No existe esa lista')
  switch (def.kind) {
    case 'imdb-top':
      return { items: await imdbTop(def.type) }
    case 'oscars':
      return { items: await oscars() }
    case 'sagas':
      return { items: await sagas() }
    case 'saga':
      return saga(def.collection!)
    case 'keyword':
      return { items: await keywordList(def.keyword!, def.type) }
  }
}

/** Ruta de una tarjeta de lista: las sagas abren su propia lista. */
export const curatedItemPath = (m: MetaPreview) => (m.id.startsWith('saga-') ? `/lists/${m.id}` : undefined)

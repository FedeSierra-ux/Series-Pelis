import { CINEMETA_ADDON, getCatalog } from '../../lib/addons'
import { argentinasParams, cleanTrending, discoverPath, isAnime, mixTop10, top10Params, trendingPath, wellRated, type BrowseKind } from '../../lib/browseRows'
import { today } from '../../lib/discoverApi'
import { tmdbCached, tmdbToPreview, type TmdbListItem, type TmdbPage } from '../../lib/tmdb'
import type { MetaPreview } from '../../lib/types'

// Pedidos de las filas de Películas y Series (v0.15). Todo pasa por la caché de siempre: al volver a
// la página las filas salen de memoria o de IndexedDB.

const HOUR = 60 * 60 * 1000

/** "Popular" de Cinemeta (la copia local del manifest: no hace falta tenerlo instalado). */
function cinemetaTop(kind: BrowseKind, extra: Record<string, string | undefined> = {}): Promise<MetaPreview[]> {
  const catalog = CINEMETA_ADDON.manifest.catalogs.find((c) => c.type === kind && c.id === 'top')
  if (!catalog) return Promise.resolve([])
  return getCatalog(CINEMETA_ADDON, catalog, extra).then((list) => list.map((m) => ({ ...m, type: m.type ?? kind })))
}

const tmdbList = async (kind: BrowseKind, params: Record<string, string | number | undefined>): Promise<MetaPreview[]> => {
  const res = await tmdbCached<TmdbPage>(discoverPath(kind), params, 6 * HOUR)
  return (res.results ?? []).map((i) => tmdbToPreview(i, kind === 'movie' ? 'movie' : 'tv'))
}

export interface Top10 {
  items: MetaPreview[]
  /** Salió de las tendencias de TMDB (si no, es "Popular" de Cinemeta). */
  trending: boolean
}

/** Top 10: tendencias de la semana de TMDB; sin key (o si falla), "Popular" de Cinemeta. */
export async function loadTop10(kind: BrowseKind, tmdbOn: boolean): Promise<Top10> {
  if (tmdbOn) {
    try {
      const res = await tmdbCached<TmdbPage>(trendingPath(kind), { language: 'es-MX' }, 3 * HOUR)
      const items = cleanTrending(res.results ?? [], kind).map((i) => tmdbToPreview(i, kind === 'movie' ? 'movie' : 'tv'))
      if (items.length >= 5) return { items, trending: true }
    } catch {
      // Seguimos con Cinemeta.
    }
  }
  return { items: await cinemetaTop(kind), trending: false }
}

/** Lo popular con IMDb ≥ 7: dos páginas de "Popular" (~100 títulos) para que la fila quede llena. */
export async function loadWellRated(kind: BrowseKind): Promise<MetaPreview[]> {
  const pages = await Promise.allSettled([cinemetaTop(kind), cinemetaTop(kind, { skip: '50' })])
  const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []))
  if (ok.length === 0) throw (pages[0] as PromiseRejectedResult).reason
  return wellRated(ok)
}

export const loadGenre = (kind: BrowseKind, genre: string) => cinemetaTop(kind, { genre })

export const loadArgentinas = (kind: BrowseKind) => tmdbList(kind, argentinasParams(kind, today()))

/** "Popular" de Cinemeta para las filas de Inicio (no hace falta TMDB). */
export const loadPopular = (kind: BrowseKind) => cinemetaTop(kind)

/**
 * Top 10 de Inicio (v0.32): películas y series mezcladas, lo más visto en las plataformas de Argentina y sin
 * anime. Sin TMDB (o si falla), el "Popular" de Cinemeta mezclado de la misma forma.
 */
export async function loadTop10Mix(tmdbOn: boolean): Promise<MetaPreview[]> {
  if (tmdbOn) {
    try {
      const [mv, tv] = await Promise.all(
        (['movie', 'series'] as const).map(async (kind) => {
          const res = await tmdbCached<TmdbPage>(discoverPath(kind), top10Params(kind), 3 * HOUR)
          const list = (res.results ?? []).filter((i: TmdbListItem) => !!i.poster_path && !isAnime(i))
          return list.map((i) => tmdbToPreview(i, kind === 'movie' ? 'movie' : 'tv'))
        }),
      )
      const mix = mixTop10(mv, tv)
      if (mix.length >= 5) return mix
    } catch {
      // Seguimos con Cinemeta.
    }
  }
  const [mv, tv] = await Promise.all([cinemetaTop('movie'), cinemetaTop('series')])
  return mixTop10(mv, tv)
}

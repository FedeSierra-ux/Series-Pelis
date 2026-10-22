// Resultados de Buscar (v0.14): agrupar lo que devuelve cada catálogo por tipo (sin nombres de addons),
// elegir el "mejor resultado" y decidir qué estado mostrar (cargando, sin resultados o error).
// Lógica pura, sin navegador, para probarla con vitest.
//
// v0.28: con TMDB se busca también en `/search/multi` (en español), así "Ella y yo" encuentra "His & Hers" aunque
// Cinemeta solo conozca el nombre original. Lo de TMDB va después de lo de los addons y sin repetir: si un título
// ya vino de un addon, gana el del addon (tiene el id de IMDb y el puntaje).

import { filtersToParams } from './discoverFilters'
import { peekTitleEntry, type TitleEntry } from './localTitlesStore'
import type { MetaPreview } from './types'

export type SourceStatus = 'loading' | 'done' | 'error'

/** Un resultado de Buscar: una tarjeta más los otros nombres por los que se lo puede encontrar. */
export interface SearchMeta extends MetaPreview {
  /** Nombre original según TMDB (los de TMDB, y los de un addon que coincidieron con uno de TMDB). */
  originalName?: string
  /** Nombre en español del resultado de TMDB que resultó ser este (un addon con el nombre original). */
  altName?: string
}

/** Un catálogo con búsqueda de un addon (o la búsqueda de TMDB, con `tmdb`). */
export interface SearchSource {
  key: string
  type: string
  addonName: string
  status: SourceStatus
  /** Mientras carga, los resultados de la búsqueda anterior (atenuados). */
  items: SearchMeta[]
  /** Texto del error (ya en español) cuando falló o tardó demasiado. */
  error?: string
  /** v0.28: resultados de TMDB (ids `tmdb:movie:603`); van después de los de los addons y sin repetirlos. */
  tmdb?: boolean
}

export interface SearchGroup {
  type: string
  items: SearchMeta[]
  /** El mejor puesto que le dio alguna fuente a cada ítem (mismo orden que `items`), para el mejor resultado. */
  ranks: number[]
  loading: boolean
  /** Muestra lo anterior atenuado mientras llegan los nuevos. */
  stale: boolean
}

/** Lo que se sabe de un `tt…` en el mapa de nombres (en los tests, uno armado a mano). */
export type TitleLookup = (id: string) => TitleEntry | undefined

const TYPE_ORDER = ['movie', 'series']

/**
 * Junta los catálogos por tipo: "Películas" reúne las de todos los addons (sin repetidos) en el orden de los
 * addons. Películas y Series van primero; los demás tipos después, en el orden en que aparecen.
 *
 * v0.28: lo de TMDB va al final de su grupo, salvo lo que ya trajo un addon (gana el del addon). Es el mismo
 * título si el mapa de nombres ya sabe su id de TMDB (`/find`, que se pide igual para mostrar el nombre en
 * español) o, mientras no se sabe, si tiene el mismo nombre (el original o el español) y el mismo año, ±1.
 * Esa coincidencia por nombre vale solo acá: no se anota en el mapa (un error ahí cambiaría la ficha entera).
 */
export function groupSources(sources: readonly SearchSource[], known: TitleLookup = peekTitleEntry): SearchGroup[] {
  const byType = new Map<string, SearchSource[]>()
  for (const s of sources) byType.set(s.type, [...(byType.get(s.type) ?? []), s])
  const types = [...byType.keys()].sort((a, b) => rank(a) - rank(b))
  const groups = types.map((type) => {
    const list = byType.get(type) ?? []
    const seen = new Set<string>()
    const items: SearchMeta[] = []
    for (const s of list) {
      if (s.tmdb) continue
      for (const m of s.items) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        items.push(m)
      }
    }
    const loading = list.some((s) => s.status === 'loading')
    return { type, list, items, ranks: items.map((_, i) => i), loading }
  })
  // Lo de los addons con el id de TMDB que se sabe (de todos los grupos: Cinemeta y TMDB a veces no coinciden en
  // si es peli o serie).
  const byTmdbId = new Map<string, { g: (typeof groups)[number]; i: number }>()
  for (const g of groups) g.items.forEach((m, i) => byTmdbId.set(tmdbKeyOf(m, known), { g, i }))
  for (const g of groups) {
    const matched = new Set<number>()
    for (const s of g.list) {
      if (!s.tmdb) continue
      s.items.forEach((m, pos) => {
        const same = byTmdbId.get(m.id)
        if (same) {
          same.g.ranks[same.i] = Math.min(same.g.ranks[same.i], pos)
          return
        }
        // Cada resultado de un addon se junta con uno solo de TMDB (el primero que coincide).
        const i = g.items.findIndex((x, j) => !matched.has(j) && sameByName(x, m, known))
        if (i >= 0) {
          matched.add(i)
          g.items[i] = { ...g.items[i], originalName: m.originalName, altName: m.name }
          g.ranks[i] = Math.min(g.ranks[i], pos)
          return
        }
        g.items.push(m)
        g.ranks.push(pos)
      })
    }
  }
  return groups.map(({ type, items, ranks, loading }) => ({ type, items, ranks, loading, stale: loading && items.length > 0 }))
}

/** `tt…` con el id de TMDB conocido → `tmdb:movie:603` (como los de TMDB); si no, el id de siempre. */
function tmdbKeyOf(m: MetaPreview, known: TitleLookup): string {
  const e = m.id.startsWith('tt') ? known(m.id) : undefined
  return e?.t !== undefined && e.k ? `tmdb:${e.k}:${e.t}` : m.id
}

const yearOf = (m: MetaPreview) => Number(/\d{4}/.exec(m.releaseInfo ?? m.year ?? m.released ?? '')?.[0]) || undefined

/**
 * Un resultado de un addon (de IMDb, sin el id de TMDB todavía) y uno de TMDB son el mismo título: mismo nombre
 * (el del addon contra el español o el original de TMDB) y mismo año, con uno de margen (IMDb y TMDB a veces
 * fechan distinto un estreno en festivales). Sin año en alguno de los dos, no.
 */
function sameByName(addon: MetaPreview, tmdb: SearchMeta, known: TitleLookup): boolean {
  if (!addon.id.startsWith('tt') || known(addon.id)?.t !== undefined) return false
  const a = yearOf(addon)
  const b = yearOf(tmdb)
  if (!a || !b || Math.abs(a - b) > 1) return false
  const name = foldTitle(addon.name)
  return !!name && [tmdb.name, tmdb.originalName].some((n) => n && foldTitle(n) === name)
}

function rank(type: string): number {
  const i = TYPE_ORDER.indexOf(type)
  return i === -1 ? TYPE_ORDER.length : i
}

export type SearchOutcome = 'idle' | 'loading' | 'results' | 'empty' | 'error'

/**
 * Qué mostrar. "No encontramos nada" solo cuando todos respondieron y ninguno trajo algo: si alguno falló o
 * tardó demasiado, es un error (con "Reintentar"), porque no sabemos si había resultados.
 */
export function searchOutcome(opts: {
  active: boolean
  sources: readonly SearchSource[]
  people?: { count: number; loading: boolean; failed: boolean }
}): SearchOutcome {
  if (!opts.active) return 'idle'
  const people = opts.people ?? { count: 0, loading: false, failed: false }
  const fresh = opts.sources.filter((s) => s.status === 'done')
  const anyItems = fresh.some((s) => s.items.length > 0) || (!people.loading && people.count > 0)
  if (anyItems) return 'results'
  if (opts.sources.some((s) => s.status === 'loading') || people.loading) return 'loading'
  if (opts.sources.some((s) => s.status === 'error')) return 'error'
  // Sin catálogos y con las personas caídas tampoco se puede decir "no hay nada".
  if (opts.sources.length === 0 && people.failed) return 'error'
  return 'empty'
}

/** Nombres de los addons que fallaron (sin repetir), para el aviso "Cinemeta no respondió". */
export function failedAddons(sources: readonly SearchSource[]): string[] {
  return [...new Set(sources.filter((s) => s.status === 'error').map((s) => s.addonName))]
}

// ---------- Mejor resultado ----------

/** "El Padrino: Parte II" → "el padrino parte ii" (sin tildes, mayúsculas ni signos). */
export function foldTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const ARTICLE = /^(the|el|la|los|las|a|an|le|les|il|lo) /
const noArticle = (s: string) => s.replace(ARTICLE, '')

/** Qué tanto se parece un nombre a lo buscado: 100 igual, 60 empieza igual, 30 tiene todas las palabras, 0 nada. */
export function titleScore(query: string, name: string): number {
  const q = foldTitle(query)
  const n = foldTitle(name)
  if (!q || !n) return 0
  if (n === q || noArticle(n) === noArticle(q)) return 100
  if (n.startsWith(q) || noArticle(n).startsWith(noArticle(q))) return 60
  const words = n.split(' ')
  const all = noArticle(q)
    .split(' ')
    .every((w) => words.some((x) => x.startsWith(w)))
  return all ? 30 : 0
}

/** Cuántos de cada grupo se miran: el addon ya los ordena por relevancia. */
const CANDIDATES = 5
export const MIN_BEST_SCORE = 30

/**
 * v0.28: el parecido de un resultado con lo buscado, por el mejor de sus nombres: el de la tarjeta, el español y el
 * original del mapa de nombres, y los de TMDB que se le juntaron. Así "ella y yo" y "his & hers" dan lo mismo.
 */
export function resultScore(query: string, meta: SearchMeta, known: TitleLookup = peekTitleEntry): number {
  const e = known(meta.id)
  return Math.max(...[meta.name, e?.n, e?.o, meta.originalName, meta.altName].map((n) => (n ? titleScore(query, n) : 0)))
}

/**
 * El título que va destacado arriba en "Todo". Gana el nombre que más se parece a lo buscado; a igual
 * parecido, el que el addon puso más arriba y, después, el del grupo que va primero (Películas). Si
 * ninguno se parece (por ejemplo, buscaste a una persona) no hay mejor resultado.
 *
 * v0.26 (explorar-07): `people` son las personas encontradas (TMDB), en el orden en que llegan. Si una se
 * parece a lo buscado más que el mejor título ("taylor swift" → Taylor Swift antes que "Taylor Swift: The
 * Eras Tour"), gana la persona: no hay mejor resultado y la fila de Personas queda primera. A igual parecido
 * y posición gana el título ("ricardo": "Ricardo Del Rey" antes que Ricardo Darín).
 *
 * v0.28: el puesto es el mejor que le dio alguna fuente (`ranks`): lo de TMDB va al final de la grilla, pero su
 * primer resultado compite como primero. A igual puntaje gana el que está antes en la grilla (el del addon).
 */
export function pickBestResult(
  query: string,
  groups: readonly (Pick<SearchGroup, 'items'> & { ranks?: readonly number[] })[],
  people: readonly { name: string }[] = [],
  known: TitleLookup = peekTitleEntry,
): SearchMeta | undefined {
  let best: { meta: SearchMeta; score: number; vsPeople: number } | undefined
  groups.forEach((g, gi) => {
    g.items.forEach((meta, idx) => {
      const i = g.ranks?.[idx] ?? idx
      if (i >= CANDIDATES) return
      const base = resultScore(query, meta, known)
      if (base < MIN_BEST_SCORE) return
      // Posición dentro del grupo pesa más que el grupo: "Dune" (peli, 1.º) le gana a "Dune" (serie, 1.º) por poco.
      const score = base - i * 3 - gi * 0.5
      if (!best || score > best.score) best = { meta, score, vsPeople: base - i * 3 }
    })
  })
  if (!best) return undefined
  const top = best
  // Misma vara que los títulos (parecido menos la posición, sin el desempate por grupo, que es solo entre
  // títulos); a igual puntaje gana el título.
  const personWins = people.slice(0, CANDIDATES).some((p, i) => {
    const base = titleScore(query, p.name)
    return base >= MIN_BEST_SCORE && base - i * 3 > top.vsPeople
  })
  return personWins ? undefined : top.meta
}

// ---------- Pestañas ----------

export type SearchTab = 'all' | 'movie' | 'series' | 'people'

export const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movie', label: 'Películas' },
  { id: 'series', label: 'Series' },
  { id: 'people', label: 'Personas' },
]

export function parseTab(v: string | null | undefined): SearchTab {
  return SEARCH_TABS.some((t) => t.id === v) ? (v as SearchTab) : 'all'
}

// ---------- Buscar vacío: géneros ----------

/** Géneros (con el nombre de Cinemeta, que Descubrir entiende con o sin TMDB) para los chips de Buscar. */
export const SUGGESTED_GENRES: Record<'movie' | 'series', string[]> = {
  movie: ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Romance', 'Animation', 'Crime', 'Fantasy', 'Documentary', 'Family'],
  series: ['Drama', 'Comedy', 'Crime', 'Sci-Fi', 'Mystery', 'Animation', 'Documentary', 'Reality-TV', 'Family', 'Fantasy'],
}

/** Películas o Series con el género ya filtrado (mismo formato de URL que la barra de filtros). */
export function genreLink(type: 'movie' | 'series', genre: string): string {
  const qs = filtersToParams({ sort: 'popularity', genre }).toString()
  return `/discover/${type}${qs ? `?${qs}` : ''}`
}

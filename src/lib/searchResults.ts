// Resultados de Buscar (v0.14): agrupar lo que devuelve cada catálogo por tipo (sin nombres de addons),
// elegir el "mejor resultado" y decidir qué estado mostrar (cargando, sin resultados o error).
// Lógica pura, sin navegador, para probarla con vitest.

import { filtersToParams } from './discoverFilters'
import type { MetaPreview } from './types'

export type SourceStatus = 'loading' | 'done' | 'error'

/** Un catálogo con búsqueda de un addon. */
export interface SearchSource {
  key: string
  type: string
  addonName: string
  status: SourceStatus
  /** Mientras carga, los resultados de la búsqueda anterior (atenuados). */
  items: MetaPreview[]
  /** Texto del error (ya en español) cuando falló o tardó demasiado. */
  error?: string
}

export interface SearchGroup {
  type: string
  items: MetaPreview[]
  loading: boolean
  /** Muestra lo anterior atenuado mientras llegan los nuevos. */
  stale: boolean
}

const TYPE_ORDER = ['movie', 'series']

/**
 * Junta los catálogos por tipo: "Películas" reúne las de todos los addons (sin repetidos) en el orden de los
 * addons. Películas y Series van primero; los demás tipos después, en el orden en que aparecen.
 */
export function groupSources(sources: readonly SearchSource[]): SearchGroup[] {
  const byType = new Map<string, SearchSource[]>()
  for (const s of sources) byType.set(s.type, [...(byType.get(s.type) ?? []), s])
  const types = [...byType.keys()].sort((a, b) => rank(a) - rank(b))
  return types.map((type) => {
    const list = byType.get(type) ?? []
    const seen = new Set<string>()
    const items: MetaPreview[] = []
    for (const s of list) {
      for (const m of s.items) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        items.push(m)
      }
    }
    const loading = list.some((s) => s.status === 'loading')
    return { type, items, loading, stale: loading && items.length > 0 }
  })
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
 * El título que va destacado arriba en "Todo". Gana el nombre que más se parece a lo buscado; a igual
 * parecido, el que el addon puso más arriba y, después, el del grupo que va primero (Películas). Si
 * ninguno se parece (por ejemplo, buscaste a una persona) no hay mejor resultado.
 */
export function pickBestResult(query: string, groups: readonly Pick<SearchGroup, 'items'>[]): MetaPreview | undefined {
  let best: { meta: MetaPreview; score: number } | undefined
  groups.forEach((g, gi) => {
    g.items.slice(0, CANDIDATES).forEach((meta, i) => {
      const base = titleScore(query, meta.name)
      if (base < MIN_BEST_SCORE) return
      // Posición dentro del grupo pesa más que el grupo: "Dune" (peli, 1.º) le gana a "Dune" (serie, 1.º) por poco.
      const score = base - i * 3 - gi * 0.5
      if (!best || score > best.score) best = { meta, score }
    })
  })
  return best?.meta
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

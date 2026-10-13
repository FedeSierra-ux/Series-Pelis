// Listas curadas y "personas juntas" (v0.5). Lógica pura: definiciones de las listas,
// parseo de la respuesta de Wikidata, ranking del "Top IMDb" aproximado e intersección de
// créditos de dos personas. Lo que pide a la red está en `discoverApi.ts`.

import type { TmdbListItem } from './tmdb'
import type { MetaPreview } from './types'

export type CuratedKind = 'imdb-top' | 'oscars' | 'sagas' | 'saga' | 'keyword'

export interface CuratedDef {
  id: string
  title: string
  description: string
  kind: CuratedKind
  type: 'movie' | 'series'
  needsTmdb: boolean
  /** Palabra clave de TMDB (listas `keyword`). */
  keyword?: number
  /** Colección de TMDB (listas `saga`). */
  collection?: number
}

/** Cuántos títulos populares de Cinemeta se miran para armar el "Top IMDb". */
export const TOP_POOL_PAGES = 20
export const TOP_PAGE_SIZE = 50
export const TOP_SIZE = 250

export const CURATED: CuratedDef[] = [
  {
    id: 'top-imdb-movie',
    title: 'Mejor puntaje IMDb: películas',
    description: `Aproximación al Top 250: las ${TOP_SIZE} con mejor puntaje de IMDb entre las ${TOP_POOL_PAGES * TOP_PAGE_SIZE} películas más populares de Cinemeta. No es la lista oficial.`,
    kind: 'imdb-top',
    type: 'movie',
    needsTmdb: false,
  },
  {
    id: 'top-imdb-series',
    title: 'Mejor puntaje IMDb: series',
    description: `Aproximación al Top 250: las ${TOP_SIZE} con mejor puntaje de IMDb entre las ${TOP_POOL_PAGES * TOP_PAGE_SIZE} series más populares de Cinemeta. No es la lista oficial.`,
    kind: 'imdb-top',
    type: 'series',
    needsTmdb: false,
  },
  {
    id: 'oscars',
    title: 'Ganadoras del Oscar a Mejor película',
    description: 'Todas las ganadoras, de la más reciente a la primera (datos de Wikidata).',
    kind: 'oscars',
    type: 'movie',
    needsTmdb: false,
  },
  {
    id: 'sagas',
    title: 'Sagas populares',
    description: 'Las grandes sagas del cine, con todas sus partes en orden.',
    kind: 'sagas',
    type: 'movie',
    needsTmdb: true,
  },
  ...(
    [
      ['true-story', 'Basadas en hechos reales', 9672],
      ['books', 'Basadas en libros', 818],
      ['time-travel', 'Viajes en el tiempo', 4379],
      ['heist', 'Robos y atracos', 10051],
      ['dystopia', 'Distopías', 4565],
      ['space', 'En el espacio', 9882],
      ['superhero', 'Superhéroes', 9715],
      ['zombies', 'Zombis', 12377],
      ['christmas', 'Navidad', 207317],
      ['post-credits', 'Con escena después de los créditos', 179430],
    ] as const
  ).map(
    ([id, title, keyword]): CuratedDef => ({
      id: `kw-${id}`,
      title,
      description: 'Películas con esta palabra clave en TMDB, de las más populares a las menos.',
      kind: 'keyword',
      type: 'movie',
      needsTmdb: true,
      keyword,
    }),
  ),
]

/** Colecciones de TMDB (verificadas contra /collection/{id}). */
export const SAGA_IDS = [
  1241, 10, 119, 121938, 86311, 10194, 328, 9485, 87359, 645, 2344, 264, 84, 295, 230, 404609, 2150, 263, 8091, 528,
  1575, 748, 8650, 131635,
]

export function curatedById(id: string): CuratedDef | undefined {
  const saga = /^saga-(\d+)$/.exec(id)
  if (saga)
    return {
      id,
      title: 'Saga',
      description: 'Todas las partes, en orden de estreno.',
      kind: 'saga',
      type: 'movie',
      needsTmdb: true,
      collection: Number(saga[1]),
    }
  return CURATED.find((l) => l.id === id)
}

/** A dónde lleva una lista: las de palabra clave van a Descubrir (con todos sus filtros). */
export function curatedPath(def: CuratedDef): string {
  if (def.kind === 'keyword' && def.keyword)
    return `/discover/${def.type}?src=tmdb&keyword=${def.keyword}&kw=${encodeURIComponent(def.title)}`
  return `/lists/${def.id}`
}

// ---------- Wikidata: ganadoras del Oscar a Mejor película ----------

// P166 = premio recibido, Q102427 = Oscar a Mejor película, P585 = fecha (de la ceremonia),
// P345 = id de IMDb. El premio también se lo dan a los productores: nos quedamos con los `tt`.
export const OSCARS_SPARQL = `SELECT ?film ?filmLabel ?imdb (MAX(YEAR(?date)) AS ?year) WHERE {
  ?film p:P166 ?aw . ?aw ps:P166 wd:Q102427 .
  OPTIONAL { ?aw pq:P585 ?date }
  ?film wdt:P345 ?imdb .
  FILTER(STRSTARTS(?imdb, "tt"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,mul". }
} GROUP BY ?film ?filmLabel ?imdb ORDER BY DESC(?year)`

export const oscarsUrl = () => `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(OSCARS_SPARQL)}`

interface SparqlValue {
  value: string
}
export interface SparqlResponse {
  results?: { bindings?: Record<string, SparqlValue | undefined>[] }
}

/** Respuesta de Wikidata → tarjetas (una por película, aunque tenga dos ids de IMDb o dos fechas). */
export function parseOscars(res: SparqlResponse): MetaPreview[] {
  const seen = new Set<string>()
  const out: MetaPreview[] = []
  for (const b of res.results?.bindings ?? []) {
    const imdb = b.imdb?.value
    const film = b.film?.value
    if (!imdb || !/^tt\d+$/.test(imdb) || seen.has(imdb) || (film && seen.has(film))) continue
    seen.add(imdb)
    if (film) seen.add(film)
    const label = b.filmLabel?.value
    const year = b.year?.value
    out.push({
      id: imdb,
      type: 'movie',
      // Sin etiqueta en español, inglés ni "mul", Wikidata devuelve el id (Q…): mejor nada.
      name: label && !/^Q\d+$/.test(label) ? label : imdb,
      releaseInfo: year ? `Oscar ${year}` : undefined,
    })
  }
  return out
}

// ---------- "Top IMDb" aproximado ----------

/** Une las páginas de populares, saca repetidos y ordena por puntaje de IMDb. */
export function rankByImdb(pages: readonly (readonly MetaPreview[])[], limit = TOP_SIZE): MetaPreview[] {
  const byId = new Map<string, MetaPreview>()
  for (const page of pages) for (const m of page) if (!byId.has(m.id)) byId.set(m.id, m)
  const rating = (m: MetaPreview) => parseFloat(m.imdbRating ?? '') || 0
  return [...byId.values()]
    .filter((m) => rating(m) > 0)
    .sort((a, b) => rating(b) - rating(a))
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
      poster: m.poster,
      releaseInfo: m.releaseInfo ?? m.year,
      imdbRating: m.imdbRating,
    }))
}

// ---------- Dos personas juntas ----------

export interface TogetherItem extends TmdbListItem {
  /** Qué hace cada persona en ese título (personaje o trabajo). */
  roleA?: string
  roleB?: string
}

const creditKey = (c: TmdbListItem) => `${c.media_type}:${c.id}`

/**
 * Títulos donde aparecen las dos personas (delante o detrás de cámara), sin repetidos y
 * del más popular al menos popular.
 */
export function intersectCredits(a: readonly TmdbListItem[], b: readonly TmdbListItem[]): TogetherItem[] {
  const roles = (list: readonly TmdbListItem[]) => {
    const map = new Map<string, { item: TmdbListItem; roles: string[] }>()
    for (const c of list) {
      if (c.media_type !== 'movie' && c.media_type !== 'tv') continue
      const k = creditKey(c)
      const entry = map.get(k) ?? { item: c, roles: [] }
      const role = c.character || c.job
      if (role && !entry.roles.includes(role)) entry.roles.push(role)
      map.set(k, entry)
    }
    return map
  }
  const ra = roles(a)
  const rb = roles(b)
  const out: TogetherItem[] = []
  for (const [k, ea] of ra) {
    const eb = rb.get(k)
    if (!eb) continue
    out.push({ ...ea.item, roleA: ea.roles.join(', ') || undefined, roleB: eb.roles.join(', ') || undefined })
  }
  return out.sort((x, y) => (y.popularity ?? 0) - (x.popularity ?? 0))
}

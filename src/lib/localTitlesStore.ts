import { createStore, get, set } from 'idb-keyval'

// v0.28: nombres en español latino de pelis y series (los de TMDB en es-MX, como en Netflix/Disney+ Argentina).
// Cinemeta y lo guardado (historial, Mi lista, D1) siguen con el nombre original: se traduce recién al mostrar.
// Esta parte es solo el mapa `tt… → nombre` y sus reglas (sin pedidos); la cola y el hook están en `localTitles.ts`.
// Va en un IndexedDB aparte: en la caché general (`cache.ts`, tope de 600) cientos de nombres sacarían las fichas.

export interface TitleEntry {
  /** Nombre en español; sin él, TMDB no tiene traducción (o está en otro alfabeto) y va el de Cinemeta. */
  n?: string
  /** Nombre original (para "Título original" y para buscar por los dos). */
  o?: string
  /** Id de TMDB: así `findByImdb` no vuelve a preguntar. */
  t?: number
  /** `movie` | `tv` de TMDB. */
  k?: 'movie' | 'tv'
  /** Cuándo se averiguó (ms). */
  at: number
}

/** Lo que trae TMDB de un título (de `/find`, de una ficha o de una lista). */
export interface TmdbTitleLike {
  id?: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
}

const DAY = 24 * 60 * 60 * 1000
/** Con nombre: 30 días. Sin traducción: 7 (por si TMDB la suma después). */
export const NAME_TTL_MS = 30 * DAY
export const MISSING_TTL_MS = 7 * DAY
/** Tope del mapa (se borran los más viejos). Unos 100 bytes cada uno. */
export const MAX_ENTRIES = 5000
const SAVE_DELAY_MS = 2000

const idb = createStore('flix-names', 'kv')
const KEY = 'names'

/** `tt0133093:1:2` (episodio) → `tt0133093`. Otro id (TMDB, addons): `undefined`. */
export function baseImdbId(id: string | undefined): string | undefined {
  return id ? /^(tt\d+)/.exec(id)?.[1] : undefined
}

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u

/**
 * El nombre para mostrar a partir de lo que trae TMDB en es-MX. Si TMDB no tiene traducción manda el original:
 * sirve si está en alfabeto latino (una peli argentina o francesa); en japonés, coreano… no (va el de Cinemeta).
 */
export function spanishName(item: TmdbTitleLike | undefined): string | undefined {
  const name = (item?.title ?? item?.name)?.trim()
  return name && LATIN.test(name) ? name : undefined
}

export function originalName(item: TmdbTitleLike | undefined): string | undefined {
  return (item?.original_title ?? item?.original_name)?.trim() || undefined
}

export function isFresh(e: TitleEntry | undefined, now = Date.now()): boolean {
  return !!e && now - e.at < (e.n ? NAME_TTL_MS : MISSING_TTL_MS)
}

/** Deja los `max` más nuevos. */
export function pruneEntries(entries: Record<string, TitleEntry>, max = MAX_ENTRIES): Record<string, TitleEntry> {
  const list = Object.entries(entries)
  if (list.length <= max) return entries
  return Object.fromEntries(list.sort((a, b) => b[1].at - a[1].at).slice(0, max))
}

/** Lo que se guardó, limpio (una base rota o de otra versión no rompe nada). */
export function cleanEntries(raw: unknown): Record<string, TitleEntry> {
  const out: Record<string, TitleEntry> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^tt\d+$/.test(k) || !v || typeof v !== 'object') continue
    const e = v as Partial<TitleEntry>
    if (typeof e.at !== 'number') continue
    out[k] = {
      at: e.at,
      n: typeof e.n === 'string' ? e.n : undefined,
      o: typeof e.o === 'string' ? e.o : undefined,
      t: typeof e.t === 'number' ? e.t : undefined,
      k: e.k === 'movie' || e.k === 'tv' ? e.k : undefined,
    }
  }
  return out
}

// ---------- Mapa en memoria + IndexedDB ----------

const map = new Map<string, TitleEntry>()
const listeners = new Map<string, Set<() => void>>()
const anyListeners = new Set<() => void>()
let version = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let loading: Promise<void> | undefined

/** Se llama al arrancar (junto con los stores): así el primer render ya tiene los nombres. */
export function loadLocalTitles(): Promise<void> {
  loading ??= (async () => {
    try {
      const stored = cleanEntries(await get(KEY, idb))
      for (const [k, e] of Object.entries(stored)) if (!map.has(k)) map.set(k, e)
    } catch {
      // Sin IndexedDB: los nombres valen solo para esta sesión.
    }
  })()
  return loading
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    const all = pruneEntries(Object.fromEntries(map))
    if (Object.keys(all).length < map.size) {
      map.clear()
      for (const [k, e] of Object.entries(all)) map.set(k, e)
    }
    set(KEY, all, idb).catch(() => {})
  }, SAVE_DELAY_MS)
}

export function peekTitleEntry(imdbId: string): TitleEntry | undefined {
  const tt = baseImdbId(imdbId)
  return tt ? map.get(tt) : undefined
}

/** Anota lo que se supo de un título y avisa a quien lo esté mostrando. */
export function rememberTitle(imdbId: string, item: TmdbTitleLike | undefined, kind?: 'movie' | 'tv', now = Date.now()): void {
  const tt = baseImdbId(imdbId)
  if (!tt) return
  const prev = map.get(tt)
  const next: TitleEntry = { n: spanishName(item), o: originalName(item), t: item?.id ?? prev?.t, k: kind ?? prev?.k, at: now }
  if (!item) Object.assign(next, { n: prev?.n, o: prev?.o })
  map.set(tt, next)
  scheduleSave()
  if (prev?.n === next.n && prev?.o === next.o) return
  version++
  listeners.get(tt)?.forEach((l) => l())
  anyListeners.forEach((l) => l())
}

export function subscribeTitle(imdbId: string, fn: () => void): () => void {
  const tt = baseImdbId(imdbId)
  if (!tt) return () => {}
  let subs = listeners.get(tt)
  if (!subs) listeners.set(tt, (subs = new Set()))
  subs.add(fn)
  return () => {
    subs.delete(fn)
    if (!subs.size) listeners.delete(tt)
  }
}

/** Para listas que ordenan o filtran por nombre: cambia cada vez que llega un nombre nuevo. */
export function subscribeAnyTitle(fn: () => void): () => void {
  anyListeners.add(fn)
  return () => anyListeners.delete(fn)
}

export const titlesVersion = () => version

/** El nombre para mostrar: el español si se sabe, si no `fallback` (el de Cinemeta o el guardado). */
export function localTitle(id: string | undefined, fallback: string): string {
  return (id && peekTitleEntry(id)?.n) || fallback
}

/** Para los tests. */
export function resetLocalTitles(): void {
  map.clear()
  listeners.clear()
  anyListeners.clear()
  version = 0
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
}

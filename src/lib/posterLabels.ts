import { useSyncExternalStore } from 'react'
import { metaKey } from './addons'
import { peek } from './cache'
import { progressStore, settingsStore, watchlistStore, type ListItem, type WatchEntry } from './store'
import { getTrending, hasTmdb, imdbFromTmdb, onServerTmdbChange, peekTmdb, LANG, type TmdbPage } from './tmdb'
import type { Meta, MetaPreview, Video } from './types'
import { episodeNumber, mapLimit, releaseDate } from './upNext'

// Etiquetas sobre los pósters ("Episodio nuevo", "Temporada nueva", "Top 10", "Estreno").
// Nunca piden nada por póster: salen de lo que ya está en caché (fichas de las series que seguís,
// que carga "Próximos episodios", y el Top 10 de TMDB que usa la portada) más la fecha de estreno
// que ya viene en el catálogo.

export type PosterLabel = 'new-episode' | 'new-season' | 'top10' | 'premiere'

export const LABEL_TEXT: Record<PosterLabel, string> = {
  'new-episode': 'Episodio nuevo',
  'new-season': 'Temporada nueva',
  top10: 'Top 10',
  premiere: 'Estreno',
}

/** De más a menos importante: primero lo tuyo (series que seguís), después lo general. */
export const LABEL_PRIORITY: PosterLabel[] = ['new-episode', 'new-season', 'top10', 'premiere']

const DAY = 24 * 60 * 60 * 1000
/** Un episodio es "nuevo" durante 3 semanas; una temporada, durante 45 días. */
export const NEW_EPISODE_DAYS = 21
export const NEW_SEASON_DAYS = 45
/** "Estreno": salió en el último mes. */
export const PREMIERE_DAYS = 30
const MAX_SERIES = 60

/** Elige una sola etiqueta según la prioridad. */
export function pickPosterLabel(found: Partial<Record<PosterLabel, boolean>>): PosterLabel | undefined {
  return LABEL_PRIORITY.find((l) => found[l])
}

/** Estrenada en los últimos `days` días (con un día de tolerancia por la zona horaria). */
export function isRecentRelease(released: string | undefined, now = Date.now(), days = PREMIERE_DAYS): boolean {
  if (!released) return false
  const rel = releaseDate({ id: '', released })
  if (!rel) return false
  return rel.at <= now + DAY && now - rel.at <= days * DAY
}

/**
 * "Episodio nuevo" / "Temporada nueva" para una serie que seguís: hay un episodio sin ver, posterior
 * al último que viste, que salió después de la última vez que viste algo de la serie (y hace poco).
 * Si todavía no empezó la serie (solo está en Mi lista), solo cuenta una temporada 2+ recién estrenada.
 */
export function seriesLabel(
  videos: Video[],
  progress: Record<string, WatchEntry>,
  metaId: string,
  now = Date.now(),
): 'new-episode' | 'new-season' | undefined {
  const eps = videos
    .filter((v) => (v.season ?? 0) > 0)
    .map((v) => ({ v, season: v.season ?? 0, rel: releaseDate(v) }))
    .filter((e): e is { v: Video; season: number; rel: { at: number; hasTime: boolean } } => !!e.rel && e.rel.at <= now)
    .sort((a, b) => a.season - b.season || (episodeNumber(a.v) ?? 0) - (episodeNumber(b.v) ?? 0))
  if (eps.length === 0) return undefined

  const entries = Object.values(progress).filter((e) => e.metaId === metaId)
  const latest = entries.reduce<WatchEntry | undefined>((a, e) => (!a || e.updatedAt > a.updatedAt ? e : a), undefined)
  // Si la sacó de "Seguir viendo", tampoco le insistimos con etiquetas.
  if (latest?.hidden) return undefined

  let lastWatched = -1
  eps.forEach((e, i) => progress[e.v.id]?.watched && (lastWatched = i))

  if (lastWatched < 0) {
    const lastSeason = eps[eps.length - 1].season
    const premiere = eps.find((e) => e.season === lastSeason)!
    return lastSeason > 1 && now - premiere.rel.at <= NEW_SEASON_DAYS * DAY ? 'new-season' : undefined
  }

  const seenSeason = eps[lastWatched].season
  const lastActivity = latest?.updatedAt ?? 0
  const fresh = eps.slice(lastWatched + 1).filter((e) => {
    if (progress[e.v.id]?.watched) return false
    const maxDays = e.season > seenSeason ? NEW_SEASON_DAYS : NEW_EPISODE_DAYS
    return e.rel.at > lastActivity && now - e.rel.at <= maxDays * DAY
  })
  if (fresh.length === 0) return undefined
  return fresh.some((e) => e.season > seenSeason) ? 'new-season' : 'new-episode'
}

/** Series que seguís: las que viste algo o tenés en Mi lista, las más recientes primero. */
export function followedSeriesIds(progress: Record<string, WatchEntry>, watchlist: Record<string, ListItem>, max = MAX_SERIES): string[] {
  const last = new Map<string, number>()
  for (const e of Object.values(progress)) if (e.type === 'series') last.set(e.metaId, Math.max(last.get(e.metaId) ?? 0, e.updatedAt))
  for (const i of Object.values(watchlist)) if (i.type === 'series' && !last.has(i.id)) last.set(i.id, i.addedAt)
  return [...last.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id)
}

// ---------- Índice en memoria (uno para toda la app) ----------

let seriesIndex = new Map<string, 'new-episode' | 'new-season'>()
let top10 = new Set<string>()
let version = 0
const listeners = new Set<() => void>()
let started = false
let timer: ReturnType<typeof setTimeout> | undefined
let running = false
let again = false
/** Top 10 ya traducido a ids de IMDb, por lista de ids de TMDB (cambia cada pocas horas). */
let top10Resolved: { sig: string; ids: Set<string> } | undefined

function emit() {
  version++
  listeners.forEach((l) => l())
}

async function cachedMeta(id: string): Promise<Meta | undefined> {
  // Solo memoria + IndexedDB: si la ficha no está, no se pide (la carga "Próximos episodios").
  return (await peek<Meta>(metaKey('series', id)))?.data
}

async function buildTop10(): Promise<Set<string>> {
  if (!hasTmdb()) return new Set()
  // Mismo pedido (y misma caché de 3 h) que la portada de Inicio: no suma pedidos.
  const page = peekTmdb<TmdbPage>('/trending/all/day', { language: LANG }) ?? (await getTrending('all', 'day').catch(() => undefined))
  const items = (page?.results ?? []).filter((i) => i.media_type === 'movie' || i.media_type === 'tv').slice(0, 10)
  const sig = items.map((i) => `${i.media_type}:${i.id}`).join(',')
  if (top10Resolved?.sig === sig) return top10Resolved.ids
  const ids = new Set(items.map((i) => `tmdb:${i.media_type}:${i.id}`))
  // Los pósters de Cinemeta usan el id de IMDb: son 10 pedidos una vez (quedan 30 días en caché).
  await mapLimit(items, 3, async (i) => {
    const tt = await imdbFromTmdb(i.id, i.media_type as 'movie' | 'tv').catch(() => undefined)
    if (tt) ids.add(tt)
  })
  top10Resolved = { sig, ids }
  return ids
}

async function rebuild() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    if (!settingsStore.get().posterLabels) {
      seriesIndex = new Map()
      top10 = new Set()
    } else {
      const progress = progressStore.get()
      const ids = followedSeriesIds(progress, watchlistStore.get())
      const next = new Map<string, 'new-episode' | 'new-season'>()
      const now = Date.now()
      await mapLimit(ids, 6, async (id) => {
        const meta = await cachedMeta(id)
        const label = meta?.videos?.length ? seriesLabel(meta.videos, progress, id, now) : undefined
        if (label) next.set(id, label)
      })
      seriesIndex = next
      top10 = await buildTop10()
    }
    emit()
  } finally {
    running = false
    if (again) {
      again = false
      schedule(0)
    }
  }
}

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => rebuild().catch(() => {}), ms)
}

/** Avisa que hay fichas nuevas en caché (lo llama "Próximos episodios" al terminar de cargar). */
export function refreshPosterLabels() {
  if (started) schedule(300)
}

function start() {
  if (started) return
  started = true
  // El progreso se guarda cada 5 s mientras se reproduce: esperamos a que se calme.
  progressStore.subscribe(() => schedule(3000))
  watchlistStore.subscribe(() => schedule(1000))
  let prev = settingsStore.get()
  settingsStore.subscribe(() => {
    const s = settingsStore.get()
    if (s.posterLabels !== prev.posterLabels || s.tmdbKey !== prev.tmdbKey) schedule(0)
    prev = s
  })
  // También cuando el sitio responde que tiene TMDB.
  onServerTmdbChange(() => schedule(0))
  schedule(0)
}

function subscribe(listener: () => void) {
  start()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getVersion = () => version

/**
 * Etiqueta (una sola) para un póster, o `undefined`. Con `noTop10` (v0.26: filas de recomendaciones de Inicio,
 * que ya tiene la fila del Top 10) nunca da "Top 10" y pasa a la siguiente (ej. "Estreno").
 */
export function usePosterLabel(meta: Pick<MetaPreview, 'id' | 'type' | 'released'>, enabled: boolean, noTop10 = false): PosterLabel | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  if (!enabled) return undefined
  const series = seriesIndex.get(meta.id)
  return pickPosterLabel({
    'new-episode': series === 'new-episode',
    'new-season': series === 'new-season',
    top10: !noTop10 && top10.has(meta.id),
    premiere: isRecentRelease(meta.released),
  })
}

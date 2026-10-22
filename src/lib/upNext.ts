import { useEffect, useState } from 'react'
import { getMeta } from './addons'
import { localTitle } from './localTitlesStore'
import { useAddons } from './hooks'
import { continueWatching, progressStore, useStore, watchlistStore, type ListItem, type WatchEntry } from './store'
import { refreshPosterLabels } from './posterLabels'
import type { InstalledAddon, Meta, Video } from './types'

// "Próximos episodios": a partir de las series que el usuario sigue (las que vio o tiene en
// Mi lista) calcula el siguiente episodio para ver y los estrenos cercanos para el calendario.

const DAY = 24 * 60 * 60 * 1000
const CALENDAR_AHEAD_DAYS = 60
const CALENDAR_BEHIND_DAYS = 7
/** Tope de series a consultar: más que esto sería abusar de Cinemeta. */
const MAX_SERIES = 60

export interface EpisodeItem {
  metaId: string
  /**
   * Nombre de la serie: el español si ya se sabía al calcular (v0.28), si no el de Cinemeta. Lo que se muestra
   * igual pasa por `useLocalTitle`, así un nombre que llega después también se ve.
   */
  seriesName: string
  poster?: string
  videoId: string
  season: number
  episode?: number
  title?: string
  thumbnail?: string
  /** Fecha de estreno (ms). */
  released: number
  /** false si Cinemeta solo da el día, sin la hora. */
  hasTime: boolean
  watched: boolean
  /** 0..1 si ya lo empezó. */
  progress?: number
  /** Lo último que vio de la serie (ms). Solo en `next`: para ordenarlo con "Seguir viendo". */
  lastActivity?: number
}

export interface UpNextData {
  /** Siguiente episodio sin ver de cada serie, la más reciente primero. */
  next: EpisodeItem[]
  /** Episodios de los últimos 7 días y los próximos 60, ordenados por fecha. */
  calendar: EpisodeItem[]
  followed: number
}

/** Ejecuta `fn` sobre la lista con a lo sumo `limit` tareas a la vez. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export const episodeNumber = (v: Video) => v.episode ?? v.number

/**
 * Cinemeta manda muchas fechas como medianoche UTC ("2026-10-13T00:00:00.000Z"), que en
 * Argentina caerían el día anterior: esas las tomamos como fecha local sin hora.
 */
export function releaseDate(v: Video): { at: number; hasTime: boolean } | undefined {
  const raw = v.released ?? v.firstAired
  if (!raw) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?Z?)?$/.exec(raw)
  if (m) return { at: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), hasTime: false }
  const at = Date.parse(raw)
  return Number.isNaN(at) ? undefined : { at, hasTime: true }
}

export function episodeLink(metaId: string, season: number | undefined, videoId: string) {
  return `/detail/series/${encodeURIComponent(metaId)}${season !== undefined ? `?season=${season}&video=${encodeURIComponent(videoId)}` : ''}`
}

interface Followed {
  id: string
  name: string
  poster?: string
  lastActivity: number
}

function followedSeries(progress: Record<string, WatchEntry>, watchlist: Record<string, ListItem>): Followed[] {
  const map = new Map<string, Followed>()
  for (const e of Object.values(progress)) {
    if (e.type !== 'series') continue
    const cur = map.get(e.metaId)
    if (!cur || e.updatedAt > cur.lastActivity) map.set(e.metaId, { id: e.metaId, name: e.name, poster: e.poster, lastActivity: e.updatedAt })
  }
  for (const item of Object.values(watchlist)) {
    if (item.type !== 'series' || map.has(item.id)) continue
    map.set(item.id, { id: item.id, name: item.name, poster: item.poster, lastActivity: item.addedAt })
  }
  return [...map.values()].sort((a, b) => b.lastActivity - a.lastActivity).slice(0, MAX_SERIES)
}

function toItem(meta: Meta, f: Followed, v: Video, progress: Record<string, WatchEntry>): EpisodeItem | undefined {
  const rel = releaseDate(v)
  if (!rel) return undefined
  const entry = progress[v.id]
  return {
    metaId: f.id,
    seriesName: localTitle(f.id, meta.name || f.name),
    poster: meta.poster ?? f.poster,
    videoId: v.id,
    season: v.season ?? 0,
    episode: episodeNumber(v),
    title: v.title ?? v.name,
    thumbnail: v.thumbnail,
    released: rel.at,
    hasTime: rel.hasTime,
    watched: !!entry?.watched,
    progress: entry && !entry.watched && entry.duration ? entry.position / entry.duration : undefined,
  }
}

export function computeUpNext(
  followed: Followed[],
  metas: Map<string, Meta>,
  progress: Record<string, WatchEntry>,
  now = Date.now(),
): UpNextData {
  const inContinue = new Set(continueWatching(progress).map((e) => e.metaId))
  // Lo último que tocó de cada serie: si lo ocultó de "Seguir viendo", tampoco lo sugerimos acá.
  const latest = new Map<string, WatchEntry>()
  for (const e of Object.values(progress)) {
    const cur = latest.get(e.metaId)
    if (!cur || e.updatedAt > cur.updatedAt) latest.set(e.metaId, e)
  }

  const todayStart = new Date(now).setHours(0, 0, 0, 0)
  const from = todayStart - CALENDAR_BEHIND_DAYS * DAY
  const to = now + CALENDAR_AHEAD_DAYS * DAY

  const next: EpisodeItem[] = []
  const calendar: EpisodeItem[] = []

  for (const f of followed) {
    const meta = metas.get(f.id)
    if (!meta?.videos?.length) continue
    // Sin especiales (temporada 0): no suelen seguir el orden de la serie.
    const videos = meta.videos
      .filter((v) => (v.season ?? 0) > 0)
      .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (episodeNumber(a) ?? 0) - (episodeNumber(b) ?? 0))

    let lastWatched = -1
    videos.forEach((v, i) => progress[v.id]?.watched && (lastWatched = i))
    const skip = inContinue.has(f.id) || latest.get(f.id)?.hidden
    if (lastWatched >= 0 && !skip) {
      const candidate = videos.slice(lastWatched + 1).find((v) => !progress[v.id]?.watched)
      const rel = candidate && releaseDate(candidate)
      if (candidate && rel && rel.at <= now) {
        const item = toItem(meta, f, candidate, progress)
        if (item) next.push({ ...item, lastActivity: latest.get(f.id)?.updatedAt ?? f.lastActivity })
      }
    }

    for (const v of videos) {
      const rel = releaseDate(v)
      if (!rel || rel.at < from || rel.at > to) continue
      const item = toItem(meta, f, v, progress)
      if (item) calendar.push(item)
    }
  }

  calendar.sort((a, b) => a.released - b.released || a.seriesName.localeCompare(b.seriesName) || (a.episode ?? 0) - (b.episode ?? 0))
  return { next, calendar, followed: followed.length }
}

/** Una tarjeta de la fila "Seguir viendo" de Inicio: algo empezado o el siguiente episodio de una serie. */
export type ContinueItem =
  | { kind: 'resume'; key: string; at: number; entry: WatchEntry }
  | { kind: 'next'; key: string; at: number; episode: EpisodeItem; label: 'Siguiente' | 'Episodio nuevo' }

/**
 * Une "Seguir viendo" y "Tus series: siguiente episodio" en una sola fila, la más reciente primero.
 * Lo empezado cuenta desde la última vez que se vio; el siguiente episodio, desde lo último que se vio
 * de la serie o desde su estreno si salió después ("Episodio nuevo"). Una serie aparece una sola vez.
 */
export function continueRowItems(resume: WatchEntry[], next: EpisodeItem[]): ContinueItem[] {
  const items: ContinueItem[] = resume.map((entry) => ({ kind: 'resume', key: entry.videoId, at: entry.updatedAt, entry }))
  const taken = new Set(resume.map((e) => e.metaId))
  for (const ep of next) {
    if (taken.has(ep.metaId)) continue
    taken.add(ep.metaId)
    const seen = ep.lastActivity ?? 0
    const isNew = ep.released > seen
    items.push({ kind: 'next', key: ep.videoId, at: Math.max(seen, ep.released), episode: ep, label: isNew ? 'Episodio nuevo' : 'Siguiente' })
  }
  return items.sort((a, b) => b.at - a.at)
}

export async function loadUpNext(
  addons: InstalledAddon[],
  progress: Record<string, WatchEntry>,
  watchlist: Record<string, ListItem>,
): Promise<UpNextData> {
  const followed = followedSeries(progress, watchlist)
  const metas = new Map<string, Meta>()
  // getMeta ya cachea 24 h (memoria + IndexedDB): las veces siguientes esto no toca la red.
  await mapLimit(followed, 4, async (f) => {
    try {
      metas.set(f.id, await getMeta(addons, 'series', f.id))
    } catch {
      // Si una serie no carga, seguimos con las demás.
    }
  })
  return computeUpNext(followed, metas, progress)
}

let lastResult: UpNextData | undefined

/** Próximos episodios y calendario; se recalcula cuando cambia el progreso o Mi lista. */
export function useUpNext() {
  const addons = useAddons()
  const progress = useStore(progressStore)
  const watchlist = useStore(watchlistStore)
  const [state, setState] = useState<{ data?: UpNextData; loading: boolean }>({ data: lastResult, loading: !lastResult })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    loadUpNext(addons, progress, watchlist)
      .then((data) => {
        lastResult = data
        // Las fichas recién cargadas también sirven para las etiquetas de los pósters (v0.5).
        refreshPosterLabels()
        if (alive) setState({ data, loading: false })
      })
      .catch(() => alive && setState((s) => ({ ...s, loading: false })))
    return () => {
      alive = false
    }
  }, [addons, progress, watchlist])

  return state
}

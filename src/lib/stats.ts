import { getMeta, metaKey } from './addons'
import { peek } from './cache'
import { episodeLabel } from './format'
import { genreLabel } from './i18n'
import type { WatchEntry } from './store'
import type { InstalledAddon, Meta } from './types'
import { mapLimit } from './upNext'

// Estadísticas de "Tu año", calculadas solo con el historial local (y las fichas que ya
// estén en caché para los géneros). Las horas son solo lo reproducido: no se estiman.

const DAY = 24 * 60 * 60 * 1000
/** Cuántas fichas se piden como máximo a la red para completar los géneros. */
const MAX_META_FETCH = 40

export interface TitleStat {
  metaId: string
  type: string
  name: string
  poster?: string
  seconds: number
  episodes: number
}

export interface DayCell {
  /** Medianoche local del día (ms). */
  date: number
  seconds: number
  titles: string[]
  level: 0 | 1 | 2 | 3 | 4
}

export interface YearStats {
  year: number
  seconds: number
  movies: number
  episodes: number
  series: number
  activeDays: number
  genres: { genre: string; label: string; seconds: number }[]
  topSeries: TitleStat[]
  topMovies: TitleStat[]
  busiestWeekday?: { label: string; seconds: number }
  streak: { days: number; from?: number; to?: number }
  first?: WatchEntry
  last?: WatchEntry
  /** Todos los días del año, en orden. */
  days: DayCell[]
  /** Columna de la semana (lunes = 0) en la que cae el 1 de enero. */
  offset: number
}

const yearOf = (ts: number) => new Date(ts).getFullYear()

/** Años con actividad, del más reciente al más viejo (siempre incluye el actual). */
export function availableYears(progress: Record<string, WatchEntry>): number[] {
  const years = new Set<number>([new Date().getFullYear()])
  for (const e of Object.values(progress)) {
    years.add(yearOf(e.updatedAt))
    if (e.firstWatchedAt) years.add(yearOf(e.firstWatchedAt))
  }
  return [...years].sort((a, b) => b - a)
}

/**
 * Segundos reproducidos de verdad. Lo marcado como visto sin reproducir cuenta como título
 * pero no suma tiempo: el usuario no quiere horas estimadas.
 */
function entrySeconds(e: WatchEntry): number {
  if (!e.watched) return e.position || 0
  return e.duration > 0 ? e.duration : e.position || 0
}

/** Entradas con actividad en el año (por la última vez que se vio). */
export function entriesOfYear(progress: Record<string, WatchEntry>, year: number): WatchEntry[] {
  return Object.values(progress).filter((e) => yearOf(e.updatedAt) === year)
}

function dayIndex(ts: number, year: number) {
  const d = new Date(ts)
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1)) / DAY)
}

const WEEKDAYS_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

export function computeYearStats(progress: Record<string, WatchEntry>, year: number, metas: Map<string, Meta>): YearStats {
  const entries = entriesOfYear(progress, year)
  const daysInYear = dayIndex(new Date(year, 11, 31).getTime(), year) + 1
  const days: DayCell[] = Array.from({ length: daysInYear }, (_, i) => ({
    date: new Date(year, 0, 1 + i).getTime(),
    seconds: 0,
    titles: [],
    level: 0,
  }))
  const offset = (new Date(year, 0, 1).getDay() + 6) % 7

  const byTitle = new Map<string, TitleStat>()
  const weekday = new Array<number>(7).fill(0)
  const genreSeconds = new Map<string, number>()
  const seriesSeen = new Set<string>()
  const moviesSeen = new Set<string>()
  let seconds = 0
  let episodes = 0

  const touch = (idx: number, name: string, secs: number) => {
    const cell = days[idx]
    if (!cell) return
    cell.seconds += secs
    if (!cell.titles.includes(name)) cell.titles.push(name)
  }

  for (const e of entries) {
    const meta = metas.get(e.metaId)
    const secs = entrySeconds(e)
    seconds += secs

    if (e.type === 'series') {
      seriesSeen.add(e.metaId)
      if (e.watched) episodes++
    } else if (e.watched) moviesSeen.add(e.metaId)

    const t = byTitle.get(e.metaId) ?? { metaId: e.metaId, type: e.type, name: e.name, poster: meta?.poster ?? e.poster, seconds: 0, episodes: 0 }
    t.seconds += secs
    if (e.type === 'series' && e.watched) t.episodes++
    byTitle.set(e.metaId, t)

    const label = e.season !== undefined ? `${e.name} ${episodeLabel(e.season, e.episode) || `T${e.season}`}` : e.name
    touch(dayIndex(e.updatedAt, year), label, secs)
    // El día que lo empezó también cuenta como día con actividad.
    if (e.firstWatchedAt && yearOf(e.firstWatchedAt) === year && dayIndex(e.firstWatchedAt, year) !== dayIndex(e.updatedAt, year)) {
      touch(dayIndex(e.firstWatchedAt, year), label, 0)
    }
    weekday[new Date(e.updatedAt).getDay()] += secs

    for (const g of meta?.genres ?? meta?.genre ?? []) genreSeconds.set(g, (genreSeconds.get(g) ?? 0) + secs)

  }

  // Niveles de intensidad por cuartiles de los días con actividad.
  const nonZero = days.filter((d) => d.seconds > 0).map((d) => d.seconds).sort((a, b) => a - b)
  const q1 = quantile(nonZero, 0.25)
  const q2 = quantile(nonZero, 0.5)
  const q3 = quantile(nonZero, 0.75)
  for (const d of days) {
    if (!d.titles.length) continue
    d.level = d.seconds <= q1 ? 1 : d.seconds <= q2 ? 2 : d.seconds <= q3 ? 3 : 4
  }

  // Racha más larga de días seguidos.
  let streak = { days: 0, from: undefined as number | undefined, to: undefined as number | undefined }
  let run = 0
  days.forEach((d, i) => {
    run = d.titles.length ? run + 1 : 0
    if (run > streak.days) streak = { days: run, from: days[i - run + 1].date, to: d.date }
  })

  const titles = [...byTitle.values()].sort((a, b) => b.seconds - a.seconds)

  const maxWeekday = Math.max(...weekday)
  const sortedByStart = [...entries].sort((a, b) => (a.firstWatchedAt || a.updatedAt) - (b.firstWatchedAt || b.updatedAt))
  const first = sortedByStart.find((e) => yearOf(e.firstWatchedAt || e.updatedAt) === year) ?? sortedByStart[0]
  const last = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)[0]

  return {
    year,
    seconds,
    movies: moviesSeen.size,
    episodes,
    series: seriesSeen.size,
    activeDays: days.filter((d) => d.titles.length).length,
    genres: [...genreSeconds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, secs]) => ({ genre, label: genreLabel(genre), seconds: secs })),
    topSeries: titles.filter((t) => t.type === 'series').slice(0, 5),
    topMovies: titles.filter((t) => t.type === 'movie').slice(0, 5),
    busiestWeekday: maxWeekday > 0 ? { label: WEEKDAYS_PLURAL[weekday.indexOf(maxWeekday)], seconds: maxWeekday } : undefined,
    streak,
    first,
    last,
    days,
    offset,
  }
}

/**
 * Fichas para géneros y duración: primero lo que haya en caché (sin red) y, de lo que falte,
 * pide a lo sumo 40 (los títulos más vistos primero) de a 4 por vez.
 */
export async function loadYearMetas(addons: InstalledAddon[], entries: WatchEntry[]): Promise<Map<string, Meta>> {
  const weight = new Map<string, { type: string; seconds: number }>()
  for (const e of entries) {
    const w = weight.get(e.metaId) ?? { type: e.type, seconds: 0 }
    w.seconds += entrySeconds(e)
    weight.set(e.metaId, w)
  }
  const ids = [...weight.entries()].sort((a, b) => b[1].seconds - a[1].seconds)
  const metas = new Map<string, Meta>()
  const missing: [string, string][] = []
  await mapLimit(ids, 8, async ([id, w]) => {
    const hit = await peek<Meta>(metaKey(w.type, id))
    if (hit) metas.set(id, hit.data)
    else missing.push([id, w.type])
  })
  // mapLimit termina en cualquier orden: volvemos a ordenar por lo más visto.
  const order = new Map(ids.map(([id], i) => [id, i]))
  const toFetch = missing.sort((a, b) => order.get(a[0])! - order.get(b[0])!).slice(0, MAX_META_FETCH)
  await mapLimit(toFetch, 4, async ([id, type]) => {
    try {
      metas.set(id, await getMeta(addons, type, id))
    } catch {
      // Sin ficha: ese título no suma géneros, nada más.
    }
  })
  return metas
}

/** "12 h", "1 h 20 min", "35 min". */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h >= 10) return `${h} h`
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`
  return `${m} min`
}

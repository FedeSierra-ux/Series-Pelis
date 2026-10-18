import { wholeHours } from './watchStats'
import { dayStart, type DiaryEntry } from './diary'
import type { Meta } from './types'

// Metas anuales y logros, calculados con el diario. Lógica pura (el store es `goalsStore` en store.ts).

const DAY = 24 * 60 * 60 * 1000

export interface YearGoal {
  /** Pelis distintas terminadas en el año (0 = sin meta). */
  movies: number
  episodes: number
  hours: number
}

export interface GoalsState {
  /** Por año ("2026"). */
  byYear: Record<string, YearGoal>
  /** Logros ya vistos en la pantalla de logros (`2026:movies-10`), para marcar los nuevos. */
  seen: string[]
}

export const EMPTY_GOAL: YearGoal = { movies: 0, episodes: 0, hours: 0 }

export const hasGoal = (g?: YearGoal) => !!g && (g.movies > 0 || g.episodes > 0 || g.hours > 0)

const inYear = (entries: DiaryEntry[], year: number) => entries.filter((d) => new Date(d.watchedAt).getFullYear() === year)

export interface YearCounts {
  movies: number
  episodes: number
  seconds: number
}

/** Pelis distintas y episodios distintos terminados en el año (volver a ver uno no suma). */
export function yearCounts(entries: DiaryEntry[], year: number, seconds: number): YearCounts {
  const list = inYear(entries, year)
  return {
    movies: new Set(list.filter((d) => d.type === 'movie').map((d) => d.metaId)).size,
    episodes: new Set(list.filter((d) => d.type !== 'movie').map((d) => d.videoId)).size,
    seconds,
  }
}

export type GoalMetric = keyof YearGoal

export interface GoalLine {
  metric: GoalMetric
  current: number
  target: number
  /** 0-1 */
  pct: number
  /** Lo que tendrías que llevar a esta altura del año para llegar justo. */
  expected: number
  done: boolean
}

/** Qué parte del año pasó (0-1) a la fecha `now`. */
export function yearFraction(year: number, now: number): number {
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

export function goalProgress(goal: YearGoal | undefined, counts: YearCounts, year: number, now = Date.now()): GoalLine[] {
  if (!goal) return []
  const frac = yearFraction(year, now)
  const current: Record<GoalMetric, number> = { movies: counts.movies, episodes: counts.episodes, hours: wholeHours(counts.seconds) }
  return (['movies', 'episodes', 'hours'] as GoalMetric[])
    .filter((m) => goal[m] > 0)
    .map((m) => ({
      metric: m,
      current: current[m],
      target: goal[m],
      pct: Math.min(1, current[m] / goal[m]),
      expected: Math.round(goal[m] * frac),
      done: current[m] >= goal[m],
    }))
}

// ---------- Rachas ----------

/** Número de día "calendario" (sin problemas de horario de verano). */
const dayNumber = (ts: number) => {
  const d = new Date(ts)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
}

export interface Streak {
  days: number
  from?: number
  to?: number
  /** Cuándo la racha llegó a N días por primera vez, por cada N (índice N-1): medianoche local. */
  reachedAt: number[]
}

/** Racha más larga de días seguidos con algo terminado. */
export function longestStreak(timestamps: number[]): Streak {
  const days = [...new Set(timestamps.map(dayStart))].sort((a, b) => a - b)
  const out: Streak = { days: 0, reachedAt: [] }
  let run = 0
  let runFrom = 0
  days.forEach((d, i) => {
    run = i > 0 && dayNumber(d) - dayNumber(days[i - 1]) === 1 ? run + 1 : 1
    if (run === 1) runFrom = d
    if (out.reachedAt[run - 1] === undefined) out.reachedAt[run - 1] = d
    if (run > out.days) Object.assign(out, { days: run, from: runFrom, to: d })
  })
  return out
}

// ---------- Series terminadas ----------

const ONGOING = /continuing|returning|in production|en emisi/i

/**
 * Series de las que viste todos los episodios (sin especiales), solo si ya terminó de emitirse.
 * Devuelve la fecha en que viste el último que faltaba.
 */
export function completedSeries(entries: DiaryEntry[], metas: Map<string, Meta>, now = Date.now()): { metaId: string; name: string; at: number }[] {
  const byMeta = new Map<string, Map<string, number>>()
  for (const d of entries) {
    if (d.type === 'movie') continue
    const seen = byMeta.get(d.metaId) ?? new Map<string, number>()
    // La primera vez que vio cada episodio.
    seen.set(d.videoId, Math.min(seen.get(d.videoId) ?? Infinity, d.watchedAt))
    byMeta.set(d.metaId, seen)
  }
  const out: { metaId: string; name: string; at: number }[] = []
  for (const [metaId, seen] of byMeta) {
    const meta = metas.get(metaId)
    if (!meta?.videos?.length || (meta.status && ONGOING.test(meta.status))) continue
    const eps = meta.videos.filter((v) => (v.season ?? 0) > 0 && (!v.released || Date.parse(v.released) <= now))
    if (!eps.length || !eps.every((v) => seen.has(v.id))) continue
    out.push({ metaId, name: meta.name, at: Math.max(...eps.map((v) => seen.get(v.id)!)) })
  }
  return out.sort((a, b) => a.at - b.at)
}

// ---------- Logros ----------

export interface Achievement {
  id: string
  icon: string
  title: string
  description: string
  current: number
  target: number
  /** Cuándo se desbloqueó (undefined = bloqueado). */
  unlockedAt?: number
  /** Dato extra para mostrar (ej. el nombre de la serie terminada). */
  detail?: string
}

/** Fecha del N-ésimo elemento distinto (por `key`) en orden cronológico. */
function nthDistinct(entries: DiaryEntry[], key: (d: DiaryEntry) => string, n: number): number | undefined {
  const seen = new Set<string>()
  for (const d of entries) {
    seen.add(key(d))
    if (seen.size >= n) return d.watchedAt
  }
  return undefined
}

/** Máximo de entradas en un mismo día y cuándo se llegó a `n` por primera vez. */
function busiestDay(entries: DiaryEntry[], n: number): { max: number; reachedAt?: number } {
  const perDay = new Map<number, number>()
  let max = 0
  let reachedAt: number | undefined
  for (const d of entries) {
    const k = dayStart(d.watchedAt)
    const c = (perDay.get(k) ?? 0) + 1
    perDay.set(k, c)
    max = Math.max(max, c)
    if (c >= n && reachedAt === undefined) reachedAt = d.watchedAt
  }
  return { max, reachedAt }
}

const isNight = (ts: number) => {
  const h = new Date(ts).getHours()
  return h >= 2 && h < 5
}

/** Logros del año. `completed` = resultado de `completedSeries` (si hay fichas cargadas). */
export function computeAchievements(all: DiaryEntry[], year: number, completed: { metaId: string; name: string; at: number }[] = []): Achievement[] {
  const entries = inYear(all, year).sort((a, b) => a.watchedAt - b.watchedAt)
  const movies = entries.filter((d) => d.type === 'movie')
  const episodes = entries.filter((d) => d.type !== 'movie')
  const movieCount = new Set(movies.map((d) => d.metaId)).size
  const episodeCount = new Set(episodes.map((d) => d.videoId)).size
  const streak = longestStreak(entries.map((d) => d.watchedAt))
  const marathon = busiestDay(episodes, 5)
  const double = busiestDay(movies, 2)
  const night = entries.find((d) => isNight(d.watchedAt))
  const series = completed.filter((c) => new Date(c.at).getFullYear() === year)

  const count = (id: string, icon: string, title: string, description: string, list: DiaryEntry[], key: (d: DiaryEntry) => string, current: number, target: number): Achievement => ({
    id, icon, title, description, current: Math.min(current, target), target,
    unlockedAt: current >= target ? nthDistinct(list, key, target) : undefined,
  })
  const byMeta = (d: DiaryEntry) => d.metaId
  const byVideo = (d: DiaryEntry) => d.videoId

  return [
    count('first-movie', '🎬', 'Primera peli del año', `Terminá una película en ${year}.`, movies, byMeta, movieCount, 1),
    count('first-episode', '📺', 'Primer episodio del año', `Terminá un episodio en ${year}.`, episodes, byVideo, episodeCount, 1),
    count('movies-10', '🍿', '10 pelis', '10 películas distintas en el año.', movies, byMeta, movieCount, 10),
    count('movies-52', '🗓️', 'Una por semana', '52 películas distintas en el año.', movies, byMeta, movieCount, 52),
    count('episodes-100', '💯', '100 episodios', '100 episodios en el año.', episodes, byVideo, episodeCount, 100),
    {
      id: 'double-feature', icon: '🎞️', title: 'Función doble', description: 'Dos películas el mismo día.',
      current: Math.min(double.max, 2), target: 2, unlockedAt: double.reachedAt,
    },
    {
      id: 'marathon-5', icon: '🏃', title: 'Maratón', description: '5 episodios en un mismo día.',
      current: Math.min(marathon.max, 5), target: 5, unlockedAt: marathon.reachedAt,
    },
    {
      id: 'streak-7', icon: '🔥', title: 'Racha de 7 días', description: 'Terminá algo 7 días seguidos.',
      current: Math.min(streak.days, 7), target: 7, unlockedAt: streak.reachedAt[6],
    },
    {
      id: 'streak-30', icon: '⚡', title: 'Un mes sin cortar', description: 'Terminá algo 30 días seguidos.',
      current: Math.min(streak.days, 30), target: 30, unlockedAt: streak.reachedAt[29],
    },
    {
      id: 'night-owl', icon: '🦉', title: 'Trasnochador', description: 'Terminá algo entre las 2 y las 5 de la mañana.',
      current: night ? 1 : 0, target: 1, unlockedAt: night?.watchedAt,
    },
    {
      id: 'series-complete', icon: '🏁', title: 'Serie terminada', description: 'Viste todos los episodios de una serie que ya terminó.',
      current: Math.min(series.length, 1), target: 1, unlockedAt: series[0]?.at,
      detail: series.length ? series.map((s) => s.name).join(', ') : undefined,
    },
  ]
}

/** Logros desbloqueados que todavía no se vieron en la pantalla de logros. */
export function unseenAchievements(list: Achievement[], year: number, seen: string[]): Achievement[] {
  const s = new Set(seen)
  return list.filter((a) => a.unlockedAt !== undefined && !s.has(`${year}:${a.id}`))
}

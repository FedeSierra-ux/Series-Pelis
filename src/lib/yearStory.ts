import type { GoalLine } from './goals'
import type { DayCell, TitleStat, YearStats } from './stats'

// Pantallas del modo "historia" de Tu año (tipo Wrapped). Lógica pura: qué pantallas hay y con qué datos.
// A pedido del usuario NO hay "la que más volviste a ver".

export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export type StorySlide =
  | { kind: 'intro'; year: number }
  | { kind: 'hours'; seconds: number; approx: boolean; activeDays: number }
  | { kind: 'counts'; movies: number; episodes: number; series: number }
  | { kind: 'topSeries'; items: TitleStat[] }
  | { kind: 'topMovies'; items: TitleStat[] }
  | { kind: 'genre'; label: string; seconds: number; others: string[] }
  | { kind: 'month'; month: number; seconds: number }
  | { kind: 'streak'; days: number; from?: number; to?: number }
  | { kind: 'weekday'; label: string; seconds: number }
  | { kind: 'goal'; lines: GoalLine[] }
  | { kind: 'summary'; year: number }

/** Mes con más tiempo visto (0-11). */
export function busiestMonth(days: DayCell[]): { month: number; seconds: number } | undefined {
  const totals = new Array<number>(12).fill(0)
  for (const d of days) totals[new Date(d.date).getMonth()] += d.seconds
  const max = Math.max(...totals)
  return max > 0 ? { month: totals.indexOf(max), seconds: max } : undefined
}

/** Las pantallas en orden; se saltean las que no tienen datos. */
export function buildStory(s: YearStats, goal: GoalLine[] = []): StorySlide[] {
  const slides: StorySlide[] = [{ kind: 'intro', year: s.year }]
  if (s.seconds > 0) slides.push({ kind: 'hours', seconds: s.seconds, approx: s.approx, activeDays: s.activeDays })
  if (s.movies + s.episodes > 0) slides.push({ kind: 'counts', movies: s.movies, episodes: s.episodes, series: s.series })
  if (s.topSeries.length) slides.push({ kind: 'topSeries', items: s.topSeries.slice(0, 5) })
  if (s.topMovies.length) slides.push({ kind: 'topMovies', items: s.topMovies.slice(0, 5) })
  if (s.genres.length) slides.push({ kind: 'genre', label: s.genres[0].label, seconds: s.genres[0].seconds, others: s.genres.slice(1, 4).map((g) => g.label) })
  const month = busiestMonth(s.days)
  if (month) slides.push({ kind: 'month', ...month })
  if (s.streak.days > 1) slides.push({ kind: 'streak', days: s.streak.days, from: s.streak.from, to: s.streak.to })
  if (s.busiestWeekday) slides.push({ kind: 'weekday', ...s.busiestWeekday })
  if (goal.length) slides.push({ kind: 'goal', lines: goal })
  slides.push({ kind: 'summary', year: s.year })
  return slides
}

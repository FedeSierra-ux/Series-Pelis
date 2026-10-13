import { describe, expect, it } from 'vitest'
import type { YearStats } from './stats'
import { buildStory, busiestMonth } from './yearStory'

const day = (m: number, d: number, seconds: number) => ({ date: new Date(2026, m, d).getTime(), seconds, titles: seconds ? ['x'] : [], level: 0 as const })

const stats = (p: Partial<YearStats> = {}): YearStats => ({
  year: 2026,
  seconds: 0,
  approx: false,
  movies: 0,
  episodes: 0,
  series: 0,
  activeDays: 0,
  genres: [],
  topSeries: [],
  topMovies: [],
  streak: { days: 0 },
  days: [],
  offset: 0,
  ...p,
})

describe('busiestMonth', () => {
  it('suma los días de cada mes', () => {
    expect(busiestMonth([day(0, 1, 100), day(2, 1, 60), day(2, 9, 60), day(5, 1, 0)])).toEqual({ month: 2, seconds: 120 })
    expect(busiestMonth([day(0, 1, 0)])).toBeUndefined()
  })
})

describe('buildStory', () => {
  it('sin datos: solo intro y cierre', () => {
    expect(buildStory(stats()).map((s) => s.kind)).toEqual(['intro', 'summary'])
  })

  it('con datos, en orden y sin "la que más volviste a ver"', () => {
    const s = stats({
      seconds: 36000,
      movies: 3,
      episodes: 10,
      series: 2,
      activeDays: 5,
      genres: [
        { genre: 'Drama', label: 'Drama', seconds: 9000 },
        { genre: 'Comedy', label: 'Comedia', seconds: 3000 },
      ],
      topSeries: [{ metaId: 's', type: 'series', name: 'S', seconds: 1, episodes: 10 }],
      topMovies: [{ metaId: 'm', type: 'movie', name: 'M', seconds: 1, episodes: 0 }],
      streak: { days: 4 },
      busiestWeekday: { label: 'los viernes', seconds: 100 },
      days: [day(3, 1, 36000)],
    })
    const kinds = buildStory(s, [{ metric: 'movies', current: 3, target: 12, pct: 0.25, expected: 9, done: false }]).map((x) => x.kind)
    expect(kinds).toEqual(['intro', 'hours', 'counts', 'topSeries', 'topMovies', 'genre', 'month', 'streak', 'weekday', 'goal', 'summary'])
    expect(kinds.some((k) => /rewatch|again/i.test(k))).toBe(false)
  })

  it('una racha de 1 día no merece pantalla', () => {
    expect(buildStory(stats({ streak: { days: 1 } })).some((s) => s.kind === 'streak')).toBe(false)
  })
})

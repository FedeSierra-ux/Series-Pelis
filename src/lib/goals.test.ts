import { describe, expect, it } from 'vitest'
import { diaryEntryFrom, type DiaryEntry } from './diary'
import { completedSeries, computeAchievements, goalProgress, longestStreak, unseenAchievements, yearCounts, yearFraction } from './goals'
import type { Meta } from './types'

const at = (y: number, m: number, d: number, h = 21) => new Date(y, m - 1, d, h).getTime()
const movie = (id: string, ts: number): DiaryEntry => diaryEntryFrom({ videoId: id, metaId: id, type: 'movie', name: id }, ts, 'player')
const ep = (show: string, s: number, e: number, ts: number): DiaryEntry =>
  diaryEntryFrom({ videoId: `${show}:${s}:${e}`, metaId: show, type: 'series', name: show, season: s, episode: e }, ts, 'player')

const find = (list: ReturnType<typeof computeAchievements>, id: string) => list.find((a) => a.id === id)!

describe('longestStreak', () => {
  it('cuenta días seguidos aunque haya varias cosas el mismo día', () => {
    const s = longestStreak([at(2026, 3, 1), at(2026, 3, 1, 23), at(2026, 3, 2), at(2026, 3, 3), at(2026, 3, 5), at(2026, 3, 6)])
    expect(s.days).toBe(3)
    expect(new Date(s.from!).getDate()).toBe(1)
    expect(new Date(s.to!).getDate()).toBe(3)
    expect(new Date(s.reachedAt[2]).getDate()).toBe(3)
  })
  it('cruza el cambio de mes y el horario de verano', () => {
    expect(longestStreak([at(2026, 3, 30), at(2026, 3, 31), at(2026, 4, 1)]).days).toBe(3)
    expect(longestStreak([at(2026, 10, 3), at(2026, 10, 4), at(2026, 10, 5)]).days).toBe(3)
  })
  it('vacío', () => {
    expect(longestStreak([]).days).toBe(0)
  })
})

describe('metas', () => {
  const entries = [movie('a', at(2026, 1, 5)), movie('a', at(2026, 2, 5)), movie('b', at(2026, 3, 5)), movie('c', at(2025, 12, 31)), ep('s', 1, 1, at(2026, 1, 1)), ep('s', 1, 1, at(2026, 6, 1))]

  it('cuenta pelis y episodios distintos del año', () => {
    expect(yearCounts(entries, 2026, 7200)).toEqual({ movies: 2, episodes: 1, seconds: 7200 })
  })

  it('progreso y ritmo esperado', () => {
    const mid = new Date(2026, 6, 2, 12).getTime()
    expect(yearFraction(2026, mid)).toBeCloseTo(0.5, 1)
    const lines = goalProgress({ movies: 52, episodes: 0, hours: 10 }, { movies: 13, episodes: 0, seconds: 36000 }, 2026, mid)
    expect(lines.map((l) => l.metric)).toEqual(['movies', 'hours'])
    expect(lines[0]).toMatchObject({ current: 13, target: 52, pct: 0.25, expected: 26, done: false })
    expect(lines[1]).toMatchObject({ current: 10, done: true, pct: 1 })
  })

  it('un año pasado espera el total', () => {
    expect(goalProgress({ movies: 10, episodes: 0, hours: 0 }, { movies: 0, episodes: 0, seconds: 0 }, 2025, at(2026, 1, 1))[0].expected).toBe(10)
    expect(goalProgress(undefined, { movies: 0, episodes: 0, seconds: 0 }, 2025)).toEqual([])
  })
})

describe('logros', () => {
  it('primera peli, 10 pelis y función doble', () => {
    const list = Array.from({ length: 10 }, (_, i) => movie(`m${i}`, at(2026, 1, 1 + i * 3)))
    list.push(movie('m0', at(2026, 3, 1))) // repetida: no suma
    list.push(movie('x', at(2026, 1, 1, 23)))
    const a = computeAchievements(list, 2026)
    expect(find(a, 'first-movie').unlockedAt).toBe(at(2026, 1, 1))
    expect(find(a, 'movies-10')).toMatchObject({ current: 10, unlockedAt: at(2026, 1, 25) })
    expect(find(a, 'movies-52')).toMatchObject({ current: 11, target: 52, unlockedAt: undefined })
    expect(find(a, 'double-feature').unlockedAt).toBe(at(2026, 1, 1, 23))
  })

  it('maratón de 5 episodios en un día', () => {
    const list = [1, 2, 3, 4].map((e) => ep('s', 1, e, at(2026, 4, 1, 14 + e)))
    expect(find(computeAchievements(list, 2026), 'marathon-5')).toMatchObject({ current: 4, unlockedAt: undefined })
    list.push(ep('s', 1, 5, at(2026, 4, 1, 23)))
    expect(find(computeAchievements(list, 2026), 'marathon-5').unlockedAt).toBe(at(2026, 4, 1, 23))
  })

  it('racha de 7 días y trasnochador', () => {
    const list = Array.from({ length: 7 }, (_, i) => movie(`m${i}`, at(2026, 5, 10 + i)))
    list.push(movie('late', at(2026, 6, 1, 3)))
    const a = computeAchievements(list, 2026)
    expect(new Date(find(a, 'streak-7').unlockedAt!).getDate()).toBe(16)
    expect(find(a, 'streak-30').current).toBe(7)
    expect(find(a, 'night-owl').unlockedAt).toBe(at(2026, 6, 1, 3))
  })

  it('solo cuenta el año pedido', () => {
    const a = computeAchievements([movie('a', at(2025, 5, 1))], 2026)
    expect(a.every((x) => x.unlockedAt === undefined)).toBe(true)
  })

  it('logros nuevos (sin ver)', () => {
    const a = computeAchievements([movie('a', at(2026, 5, 1))], 2026)
    expect(unseenAchievements(a, 2026, []).map((x) => x.id)).toEqual(['first-movie'])
    expect(unseenAchievements(a, 2026, ['2026:first-movie'])).toEqual([])
  })
})

describe('completedSeries', () => {
  const meta = (status?: string): Meta => ({
    id: 's',
    type: 'series',
    name: 'Serie',
    status,
    videos: [
      { id: 's:0:1', season: 0, episode: 1 },
      { id: 's:1:1', season: 1, episode: 1, released: '2020-01-01' },
      { id: 's:1:2', season: 1, episode: 2, released: '2020-01-08' },
      { id: 's:2:1', season: 2, episode: 1, released: '2099-01-01' },
    ],
  })
  const list = [ep('s', 1, 1, at(2026, 1, 1)), ep('s', 1, 2, at(2026, 2, 1)), ep('s', 1, 2, at(2026, 3, 1))]

  it('todos los episodios emitidos (sin especiales ni futuros) = terminada', () => {
    const done = completedSeries(list, new Map([['s', meta('Ended')]]), at(2026, 10, 1))
    expect(done).toEqual([{ metaId: 's', name: 'Serie', at: at(2026, 2, 1) }])
    expect(find(computeAchievements(list, 2026, done), 'series-complete')).toMatchObject({ unlockedAt: at(2026, 2, 1), detail: 'Serie' })
  })

  it('si sigue en emisión o falta uno, no', () => {
    expect(completedSeries(list, new Map([['s', meta('Continuing')]]), at(2026, 10, 1))).toEqual([])
    expect(completedSeries(list.slice(0, 1), new Map([['s', meta('Ended')]]), at(2026, 10, 1))).toEqual([])
    expect(completedSeries(list, new Map(), at(2026, 10, 1))).toEqual([])
  })
})

describe('íconos de los logros (visual-pc-14)', () => {
  it('son nombres del set de íconos de línea de la app, sin emojis, y no se repiten', () => {
    const icons = computeAchievements([], 2026).map((a) => a.icon as string)
    expect(icons).toHaveLength(11)
    for (const icon of icons) expect(icon).toMatch(/^[a-z]+$/)
    expect(new Set(icons).size).toBe(icons.length)
  })
})

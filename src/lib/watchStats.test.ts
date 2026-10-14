import { describe, expect, it } from 'vitest'
import { formatWatchTime, plural, watchStats } from './watchStats'

describe('plural', () => {
  it('singular solo con 1', () => {
    expect(plural(1, 'película', 'películas')).toBe('1 película')
    expect(plural(0, 'película', 'películas')).toBe('0 películas')
    expect(plural(2, 'episodio', 'episodios')).toBe('2 episodios')
  })
})

describe('formatWatchTime', () => {
  it('menos de una hora va en minutos (antes "0 h")', () => {
    expect(formatWatchTime(7 * 60)).toBe('7 min')
    expect(formatWatchTime(0)).toBe('0 min')
    expect(formatWatchTime(20)).toBe('menos de 1 min')
    expect(formatWatchTime(59 * 60 + 20)).toBe('59 min')
  })
  it('horas y minutos', () => {
    expect(formatWatchTime(3600)).toBe('1 h')
    expect(formatWatchTime(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
    expect(formatWatchTime(59 * 60 + 40)).toBe('1 h')
  })
  it('desde las 10 h, solo horas', () => {
    expect(formatWatchTime(42 * 3600 + 35 * 60)).toBe('42 h')
  })
  it('valores raros cuentan como 0', () => {
    expect(formatWatchTime(Number.NaN)).toBe('0 min')
    expect(formatWatchTime(-5)).toBe('0 min')
  })
})

describe('watchStats', () => {
  it('cuenta películas distintas, episodios y el tiempo', () => {
    const s = watchStats([
      { type: 'movie', metaId: 'tt1', watched: true, position: 10, duration: 5400 },
      { type: 'movie', metaId: 'tt1', watched: true, position: 10, duration: 5400 },
      { type: 'series', metaId: 'tt2', watched: true, position: 0, duration: 1800 },
      { type: 'series', metaId: 'tt2', watched: false, position: 420, duration: 1800 },
      { type: 'movie', metaId: 'tt3', watched: false, position: Number.NaN, duration: 0 },
    ])
    expect(s).toEqual({ movies: 1, episodes: 1, seconds: 5400 * 2 + 1800 + 420 })
  })
})

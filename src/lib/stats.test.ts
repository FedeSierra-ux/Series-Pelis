import { describe, expect, it } from 'vitest'
import { computeYearStats } from './stats'
import type { WatchEntry } from './store'

const at = new Date(2026, 4, 10, 21).getTime()
const entry = (over: Partial<WatchEntry>): WatchEntry => ({
  videoId: 'tt1',
  metaId: 'tt1',
  type: 'movie',
  name: 'Peli',
  position: 0,
  duration: 0,
  watched: false,
  updatedAt: at,
  firstWatchedAt: at,
  ...over,
})

describe('computeYearStats', () => {
  it('no estima la duración de lo marcado como visto sin reproducir', () => {
    const progress = {
      a: entry({ videoId: 'tt1', metaId: 'tt1', watched: true, duration: 0 }),
      b: entry({ videoId: 'tt2', metaId: 'tt2', watched: true, duration: 6000, position: 5900 }),
      c: entry({ videoId: 'tt3', metaId: 'tt3', position: 600, duration: 7000 }),
    }
    const metas = new Map([['tt1', { id: 'tt1', type: 'movie', name: 'Peli', runtime: '2h 10min' }]])
    const s = computeYearStats(progress, 2026, metas as never)
    expect(s.movies).toBe(2)
    expect(s.seconds).toBe(6000 + 600)
  })
})

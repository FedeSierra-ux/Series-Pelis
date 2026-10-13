import { describe, expect, it } from 'vitest'
import {
  applyActors,
  buildSeeds,
  diversify,
  favoriteActors,
  hiddenIdSet,
  pickSeeds,
  scoreCandidates,
  starWeight,
  whyLine,
  withoutHidden,
  type Seed,
} from './recommend'
import type { RatingEntry, WatchEntry } from './store'

const NOW = Date.UTC(2026, 9, 13)
const DAY = 24 * 60 * 60 * 1000

const watch = (metaId: string, name: string, opts: Partial<WatchEntry> = {}): WatchEntry => ({
  videoId: opts.videoId ?? metaId,
  metaId,
  type: 'movie',
  name,
  position: 100,
  duration: 100,
  watched: true,
  updatedAt: NOW - DAY,
  firstWatchedAt: NOW - DAY,
  ...opts,
})

const rating = (name: string, stars: number, type = 'series'): RatingEntry => ({ stars, at: NOW - DAY, type, name })

const seed = (name: string, weight: number, stars?: number): Seed => ({ metaId: `tt-${name}`, type: 'series', name, weight, stars, episodes: 0, lastAt: NOW })

describe('peso de las estrellas', () => {
  it('5★ pesa más que 4★, y 2,5★ o menos resta', () => {
    expect(starWeight(5)).toBeGreaterThan(starWeight(4))
    expect(starWeight(4)).toBeGreaterThan(starWeight(3.5))
    expect(starWeight(3)).toBeGreaterThan(0)
    expect(starWeight(2.5)).toBeLessThan(0)
    expect(starWeight(0.5)).toBeLessThan(starWeight(2))
  })
})

describe('buildSeeds', () => {
  it('junta episodios por serie y usa las estrellas cuando las hay', () => {
    const progress = {
      a1: watch('ttA', 'A', { videoId: 'a1', type: 'series', season: 1, episode: 1 }),
      a2: watch('ttA', 'A', { videoId: 'a2', type: 'series', season: 1, episode: 2 }),
      ttB: watch('ttB', 'B'),
      ttC: watch('ttC', 'C', { watched: false, position: 5 }),
    }
    const seeds = buildSeeds(progress, { ttB: rating('B', 5, 'movie'), ttD: rating('D', 1) }, NOW)
    const by = Object.fromEntries(seeds.map((s) => [s.metaId, s]))
    expect(by.ttA.episodes).toBe(2)
    expect(by.ttB.stars).toBe(5)
    expect(by.ttB.weight).toBeGreaterThan(by.ttA.weight)
    // Una peli que dejaste al 5% casi no pesa.
    expect(by.ttC.weight).toBeLessThan(by.ttA.weight)
    // Puntuada sin verla en la app también cuenta (y resta).
    expect(by.ttD.weight).toBeLessThan(0)
    expect(seeds).toHaveLength(4)
  })

  it('lo visto hace mucho pesa menos', () => {
    const recent = buildSeeds({ x: watch('ttX', 'X') }, {}, NOW)[0]
    const old = buildSeeds({ x: watch('ttX', 'X', { updatedAt: NOW - 400 * DAY }) }, {}, NOW)[0]
    expect(old.weight).toBeLessThan(recent.weight)
    expect(old.weight).toBeGreaterThanOrEqual(0.5)
  })

  it('pickSeeds separa lo que suma de lo que resta', () => {
    const { positive, negative } = pickSeeds([seed('a', 1), seed('b', 3), seed('c', -2), seed('d', -0.5)], 1, 1)
    expect(positive.map((s) => s.name)).toEqual(['b'])
    expect(negative.map((s) => s.name)).toEqual(['c'])
  })
})

describe('scoreCandidates', () => {
  const dark = seed('Dark', 3, 5)
  const bb = seed('Breaking Bad', 1)
  const bad = seed('Mala', -2, 1)

  it('suma por cada título que la recomienda y saca lo excluido', () => {
    const out = scoreCandidates(
      [
        { seed: dark, recs: [{ key: 'tmdb:tv:1' }, { key: 'tmdb:tv:2' }, { key: 'tmdb:tv:3' }] },
        { seed: bb, recs: [{ key: 'tmdb:tv:3' }, { key: 'tmdb:tv:4' }] },
      ],
      new Set(['tmdb:tv:2']),
    )
    expect(out.map((c) => c.key)).not.toContain('tmdb:tv:2')
    expect(out[0].key).toBe('tmdb:tv:1')
    const three = out.find((c) => c.key === 'tmdb:tv:3')!
    expect(three.because.map((b) => b.seed.name)).toEqual(['Dark', 'Breaking Bad'])
  })

  it('lo que recomienda algo que puntuaste bajo baja o desaparece', () => {
    const out = scoreCandidates(
      [
        { seed: bb, recs: [{ key: 'tmdb:movie:9' }, { key: 'tmdb:movie:8' }] },
        { seed: bad, recs: [{ key: 'tmdb:movie:9' }, { key: 'tmdb:movie:7' }] },
      ],
      new Set(),
    )
    expect(out.map((c) => c.key)).toEqual(['tmdb:movie:8'])
  })

  it('el puntaje de TMDB desempata', () => {
    const out = scoreCandidates([{ seed: bb, recs: [{ key: 'a', vote: 5 }] }, { seed: { ...bb, metaId: 'z' }, recs: [{ key: 'b', vote: 8.5 }] }], new Set())
    expect(out[0].key).toBe('b')
  })
})

describe('diversify', () => {
  it('intercala títulos de distintos puntos de partida', () => {
    const dark = seed('Dark', 3, 5)
    const bb = seed('Breaking Bad', 1)
    const out = scoreCandidates(
      [
        { seed: dark, recs: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((key) => ({ key })) },
        { seed: bb, recs: [{ key: 'b1' }, { key: 'b2' }] },
      ],
      new Set(),
    )
    expect(out.slice(0, 6).every((c) => c.key.startsWith('d'))).toBe(true)
    const mixed = diversify(out).map((c) => c.key)
    expect(mixed[0]).toBe('d1')
    expect(mixed.slice(0, 6)).toContain('b1')
    expect(mixed).toHaveLength(out.length)
  })
})

describe('actores y "por qué"', () => {
  it('encuentra actores repetidos en tus títulos', () => {
    const favs = favoriteActors([
      { cast: [{ id: 1, name: 'Cillian Murphy' }, { id: 2, name: 'Otro' }] },
      { cast: [{ id: 1, name: 'Cillian Murphy' }] },
      { cast: [{ id: 1, name: 'Cillian Murphy' }, { id: 1, name: 'Cillian Murphy' }] },
    ])
    expect([...favs.values()]).toEqual([{ id: 1, name: 'Cillian Murphy', count: 3 }])
  })

  it('arma la línea del porqué', () => {
    const favs = new Map([[1, { id: 1, name: 'Cillian Murphy', count: 3 }]])
    const [byStars] = scoreCandidates([{ seed: seed('Dark', 3, 5), recs: [{ key: 'k1' }] }], new Set())
    expect(whyLine(byStars)).toBe('Porque le diste 5★ a Dark')
    const [half] = scoreCandidates([{ seed: seed('Dark', 2.5, 4.5), recs: [{ key: 'k1' }] }], new Set())
    expect(whyLine(half)).toBe('Porque le diste 4,5★ a Dark')

    const [plain] = scoreCandidates([{ seed: seed('Breaking Bad', 1), recs: [{ key: 'k2' }] }], new Set())
    expect(whyLine(plain)).toBe('Porque viste Breaking Bad')
    const [withActor] = applyActors([plain], new Map([['k2', [{ id: 1, name: 'Cillian Murphy' }]]]), favs)
    expect(whyLine(withActor)).toBe('Con Cillian Murphy, que viste en 3 títulos')
    expect(withActor.score).toBeGreaterThan(plain.score)

    const two = scoreCandidates(
      [
        { seed: seed('Breaking Bad', 1), recs: [{ key: 'k3' }] },
        { seed: seed('Ozark', 0.8), recs: [{ key: 'k3' }] },
      ],
      new Set(),
    )[0]
    expect(whyLine(two)).toBe('Porque viste Breaking Bad y Ozark')
  })
})

describe('Ya no me interesa', () => {
  it('esconde por id de IMDb y de TMDB', () => {
    const hidden = hiddenIdSet([
      { id: 'tt1', type: 'movie', tmdbId: 603 },
      { id: 'tt2', type: 'series', tmdbId: 1396 },
      { id: 'tt3', type: 'series' },
    ])
    expect([...hidden].sort()).toEqual(['tmdb:movie:603', 'tmdb:tv:1396', 'tt1', 'tt2', 'tt3'])
    expect(withoutHidden([{ id: 'tt1' }, { id: 'tmdb:tv:1396' }, { id: 'tt9' }], hidden)).toEqual([{ id: 'tt9' }])
  })
})

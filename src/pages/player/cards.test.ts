import { describe, expect, it } from 'vitest'
import { countdownFraction, nextEpisodeTitle } from './NextCard'
import { postPlayPicks } from './PostPlay'

describe('tarjeta del siguiente episodio', () => {
  it('"T1 E5 · Título"', () => {
    expect(nextEpisodeTitle({ season: 1, episode: 5, title: 'Gray Matter' })).toBe('T1 · E5 · Gray Matter')
    // Algunos addons solo mandan `number` y `name`.
    expect(nextEpisodeTitle({ season: 2, number: 3, name: 'Bit by a Dead Bee' })).toBe('T2 · E3 · Bit by a Dead Bee')
    expect(nextEpisodeTitle({ season: 1, episode: 5 })).toBe('T1 · E5')
    expect(nextEpisodeTitle(undefined)).toBe('')
  })

  it('la barra se llena con la cuenta regresiva', () => {
    expect(countdownFraction(10, 10)).toBe(0)
    expect(countdownFraction(5, 10)).toBe(0.5)
    expect(countdownFraction(0, 10)).toBe(1)
    expect(countdownFraction(-3, 10)).toBe(1)
    expect(countdownFraction(5, 0)).toBe(0)
  })
})

describe('"Más como esto" al final de una peli', () => {
  const item = (id: number, extra = {}) => ({ id, title: `Peli ${id}`, backdrop_path: `/b${id}.jpg`, release_date: '2001-01-01', ...extra })

  it('3 recomendaciones, con la imagen apaisada', () => {
    const picks = postPlayPicks({ recommendations: { page: 1, results: [item(1), item(2), item(3), item(4)], total_pages: 1, total_results: 4 } }, new Set())
    expect(picks.map((p) => p.id)).toEqual(['tmdb:movie:1', 'tmdb:movie:2', 'tmdb:movie:3'])
    expect(picks[0].still).toBe('https://image.tmdb.org/t/p/w300/b1.jpg')
    expect(picks[0].releaseInfo).toBe('2001')
  })

  it('sin recomendaciones usa las similares; saca las marcadas "Ya no me interesa"', () => {
    const picks = postPlayPicks(
      { recommendations: { page: 1, results: [], total_pages: 1, total_results: 0 }, similar: { page: 1, results: [item(7), item(8)], total_pages: 1, total_results: 2 } },
      new Set(['tmdb:movie:7']),
    )
    expect(picks.map((p) => p.id)).toEqual(['tmdb:movie:8'])
  })

  it('sin datos, nada', () => {
    expect(postPlayPicks(undefined, new Set())).toEqual([])
  })
})

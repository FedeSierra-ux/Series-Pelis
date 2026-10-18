import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => undefined,
  update: async () => undefined,
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))

import { buildInfo, parseDetailHref, shortText } from './focusBillboardData'

describe('fondo que sigue al foco: datos', () => {
  it('saca el tipo y el id del enlace del póster', () => {
    expect(parseDetailHref('/detail/movie/tt0133093')).toEqual({ type: 'movie', id: 'tt0133093' })
    expect(parseDetailHref('/detail/series/tt0903747?season=2&video=tt0903747%3A2%3A1')).toEqual({ type: 'series', id: 'tt0903747' })
    expect(parseDetailHref('/detail/movie/tmdb%3Amovie%3A603')).toEqual({ type: 'movie', id: 'tmdb:movie:603' })
    expect(parseDetailHref('/person/123')).toBeUndefined()
    expect(parseDetailHref(null)).toBeUndefined()
  })

  it('recorta la sinopsis sin cortar palabras', () => {
    expect(shortText('Corta.')).toBe('Corta.')
    const long = 'palabra '.repeat(60)
    const out = shortText(long, 50)!
    expect(out.length).toBeLessThanOrEqual(51)
    expect(out.endsWith('palabra…')).toBe(true)
    expect(shortText('   ')).toBeUndefined()
  })

  it('nombre original de Cinemeta, sinopsis en español de TMDB, duración legible', () => {
    const info = buildInfo(
      'movie:tt1',
      { id: 'tt1', type: 'movie', name: 'The Matrix', imdbRating: '8.7', releaseInfo: '1999', runtime: '136 min', description: 'English text', genres: ['Action'] },
      { id: 603, title: 'Matrix', overview: 'Texto en español', genres: [{ id: 1, name: 'Acción' }, { id: 2, name: 'Ciencia ficción' }] },
    )
    expect(info).toMatchObject({ name: 'The Matrix', rating: '8.7', description: 'Texto en español' })
    expect(info.facts).toEqual(['1999', '2 h 16 min', 'Acción · Ciencia ficción'])
    expect(info.background).toBe('https://images.metahub.space/background/medium/tt1/img')
  })

  it('series: sin duración y, con una sola temporada, el año sin guion', () => {
    const meta = { id: 'tt2', type: 'series', name: 'Nueva', releaseInfo: '2026–', runtime: '50 min', videos: [{ id: 'tt2:1:1', season: 1, episode: 1 }] }
    expect(buildInfo('series:tt2', meta, undefined).facts).toEqual(['2026'])
    expect(buildInfo('series:tt2', meta, { id: 9, number_of_seasons: 2, first_air_date: '2026-01-10' }).facts).toEqual(['2026–'])
  })

  it('sin datos usa el nombre de la tarjeta', () => {
    expect(buildInfo('movie:x', undefined, undefined, 'Algo').name).toBe('Algo')
  })
})

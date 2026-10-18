import { describe, expect, it } from 'vitest'
import { CINEMETA_URL } from './addons'
import {
  argentinasMoreTo,
  argentinasParams,
  cleanTrending,
  discoverPath,
  exploreAllTo,
  GENRE_ROWS,
  genreMoreTo,
  isBrowseKind,
  trendingPath,
  TV_NOISE,
  wantsGrid,
  wellRated,
  wellRatedMoreTo,
} from './browseRows'
import type { MetaPreview } from './types'

const meta = (id: string, imdbRating?: string): MetaPreview => ({ id, type: 'movie', name: id, imdbRating })

describe('Top 10 de la semana', () => {
  it('pide las tendencias de la semana de TMDB', () => {
    expect(trendingPath('movie')).toBe('/trending/movie/week')
    expect(trendingPath('series')).toBe('/trending/tv/week')
  })

  it('saca lo que no tiene póster y, en series, noticieros, reality y entrevistas', () => {
    const items = [
      { id: 1, poster_path: '/a.jpg', genre_ids: [18] },
      { id: 2, poster_path: null, genre_ids: [18] },
      { id: 3, poster_path: '/c.jpg', genre_ids: [10764] },
      { id: 4, poster_path: '/d.jpg', genre_ids: [35, 10767] },
      { id: 5, poster_path: '/e.jpg' },
    ]
    expect(cleanTrending(items, 'series').map((i) => i.id)).toEqual([1, 5])
    expect(cleanTrending(items, 'movie').map((i) => i.id)).toEqual([1, 3, 4, 5])
  })
})

describe('argentinasParams', () => {
  it('filtra por país de origen, sin plataformas', () => {
    const p = argentinasParams('series', '2026-10-14')
    expect(p.with_origin_country).toBe('AR')
    expect(p.with_watch_providers).toBeUndefined()
    expect(p.without_genres).toBe(TV_NOISE)
  })
})

describe('discoverPath', () => {
  it('series va a /discover/tv de TMDB', () => {
    expect(discoverPath('movie')).toBe('/discover/movie')
    expect(discoverPath('series')).toBe('/discover/tv')
  })
})

describe('wellRated', () => {
  it('deja IMDb ≥ 7, sin repetidos y en orden', () => {
    const pages = [
      [meta('a', '7.9'), meta('b', '6.9'), meta('c', '7.0')],
      [meta('a', '7.9'), meta('d'), meta('e', '8.5')],
    ]
    expect(wellRated(pages).map((m) => m.id)).toEqual(['a', 'c', 'e'])
  })

  it('acepta otro mínimo', () => {
    expect(wellRated([[meta('a', '7.9'), meta('b', '8.1')]], 8).map((m) => m.id)).toEqual(['b'])
  })
})

describe('géneros', () => {
  it('películas y series tienen las mismas filas, en el orden pedido', () => {
    const titles = ['Drama', 'Suspenso', 'Ciencia ficción', 'Comedias']
    expect(GENRE_ROWS.movie.map((g) => g.title)).toEqual(titles)
    expect(GENRE_ROWS.series.map((g) => g.title)).toEqual(titles)
  })
})

describe('"Ver todo"', () => {
  const params = (to: string) => new URL(to, 'https://x').searchParams

  it('los géneros y "Bien calificadas" abren la grilla de "Popular" de Cinemeta', () => {
    const g = params(genreMoreTo('series', 'Sci-Fi'))
    expect(g.get('addon')).toBe(CINEMETA_URL)
    expect(g.get('catalog')).toBe('top')
    expect(g.get('genre')).toBe('Sci-Fi')
    expect(genreMoreTo('series', 'Sci-Fi').startsWith('/discover/series?')).toBe(true)
    expect(params(wellRatedMoreTo('movie')).get('rating')).toBe('7')
  })

  it('"Argentinas" abre la grilla de TMDB por país', () => {
    expect(argentinasMoreTo('movie')).toBe('/discover/movie?src=tmdb&country=AR')
  })

  it('todos llevan a la grilla y no a las filas', () => {
    for (const to of [genreMoreTo('movie', 'Drama'), wellRatedMoreTo('movie'), argentinasMoreTo('movie'), exploreAllTo('movie')]) {
      expect(wantsGrid(params(to))).toBe(true)
    }
  })
})

describe('wantsGrid / isBrowseKind', () => {
  it('sin parámetros muestra las filas', () => {
    expect(wantsGrid(new URLSearchParams())).toBe(false)
    expect(wantsGrid(new URLSearchParams('all=1'))).toBe(true)
  })

  it('solo películas y series tienen página de filas', () => {
    expect(isBrowseKind('movie')).toBe(true)
    expect(isBrowseKind('series')).toBe(true)
    expect(isBrowseKind('anime')).toBe(false)
  })
})

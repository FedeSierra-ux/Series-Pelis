import { describe, expect, it } from 'vitest'
import { CINEMETA_URL } from './addons'
import {
  AR_PROVIDERS,
  argentinasMoreTo,
  argentinasParams,
  discoverPath,
  exploreAllTo,
  GENRE_ROWS,
  genreMoreTo,
  isBrowseKind,
  top10Params,
  TV_NOISE,
  wantsGrid,
  wellRated,
  wellRatedMoreTo,
} from './browseRows'
import type { MetaPreview } from './types'

const meta = (id: string, imdbRating?: string): MetaPreview => ({ id, type: 'movie', name: id, imdbRating })

describe('top10Params', () => {
  it('pide lo popular en las plataformas de Argentina y ya estrenado', () => {
    const p = top10Params('movie', '2026-10-14')
    expect(p).toMatchObject({
      sort_by: 'popularity.desc',
      watch_region: 'AR',
      with_watch_monetization_types: 'flatrate',
      with_watch_providers: AR_PROVIDERS,
      'primary_release_date.lte': '2026-10-14',
    })
    expect(p.without_genres).toBeUndefined()
  })

  it('en series usa la fecha de estreno de la serie y saca noticieros y reality', () => {
    const p = top10Params('series', '2026-10-14')
    expect(p['first_air_date.lte']).toBe('2026-10-14')
    expect(p['primary_release_date.lte']).toBeUndefined()
    expect(p.without_genres).toBe(TV_NOISE)
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

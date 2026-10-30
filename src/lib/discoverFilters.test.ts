import { describe, expect, it } from 'vitest'
import {
  applyClientFilters,
  cinemetaToTmdbGenre,
  clearAll,
  clearPanel,
  decades,
  filtersToParams,
  needsTmdb,
  panelFilters,
  parseFilters,
  ratingLabel,
  tmdbDiscoverParams,
  tmdbToCinemetaGenre,
  withoutFilter,
  yearOf,
  yearOptions,
  yearsLabel,
} from './discoverFilters'
import type { MetaPreview } from './types'

const parse = (qs: string) => parseFilters(new URLSearchParams(qs))

describe('filtros ↔ URL', () => {
  it('sin nada: orden por popularidad y nada más', () => {
    expect(parse('')).toEqual({
      src: undefined,
      addon: undefined,
      catalog: undefined,
      genre: undefined,
      from: undefined,
      to: undefined,
      rating: undefined,
      lang: undefined,
      country: undefined,
      provider: undefined,
      sort: 'popularity',
      keyword: undefined,
      kw: undefined,
    })
    expect(filtersToParams(parse('')).toString()).toBe('')
  })

  it('ida y vuelta conserva todo', () => {
    const qs = 'src=tmdb&genre=28&from=1990&to=1999&rating=7.5&lang=es&country=AR&provider=8&sort=rating&keyword=10051&kw=heist'
    expect(filtersToParams(parse(qs)).toString()).toBe(qs)
  })

  it('limpia valores inválidos y da vuelta el rango de años', () => {
    const f = parse('from=2020&to=1990&rating=99&lang=español&country=arg&provider=x&sort=raro&keyword=-1')
    expect(f.from).toBe(1990)
    expect(f.to).toBe(2020)
    expect(f.rating).toBeUndefined()
    expect(f.lang).toBeUndefined()
    expect(f.country).toBeUndefined()
    expect(f.provider).toBeUndefined()
    expect(f.sort).toBe('popularity')
    expect(f.keyword).toBeUndefined()
  })

  it('normaliza mayúsculas de idioma y país', () => {
    const f = parse('lang=ES&country=ar')
    expect(f.lang).toBe('es')
    expect(f.country).toBe('AR')
  })

  it('con TMDB no escribe addon/catalog; sin palabra clave no escribe su nombre', () => {
    expect(filtersToParams({ src: 'tmdb', addon: 'x', catalog: 'top', sort: 'popularity', kw: 'suelto' }).toString()).toBe('src=tmdb')
  })

  it('sabe cuáles necesitan TMDB', () => {
    expect(needsTmdb(parse('genre=Drama&from=2000&rating=7&sort=date&lang=en'))).toBe(true)
    expect(needsTmdb(parse('from=2000&rating=7'))).toBe(false)
  })
})

describe('panel "Filtros" y chips', () => {
  it('lista los filtros puestos: el orden cuenta si no es el de siempre; el género no', () => {
    expect(panelFilters(parse('genre=Drama&from=2000&rating=7&sort=date&lang=en'))).toEqual(['years', 'rating', 'lang', 'sort'])
    expect(panelFilters(parse('to=1999&country=AR&provider=8&keyword=5&kw=x'))).toEqual(['years', 'country', 'provider', 'keyword'])
    expect(panelFilters(parse('genre=Drama&sort=rating'))).toEqual(['sort'])
    expect(panelFilters(parse('genre=Drama'))).toEqual([])
  })

  it('saca uno solo: años saca el rango; palabra clave, también su nombre', () => {
    const f = parse('src=tmdb&genre=28&from=1990&to=1999&rating=7&keyword=5&kw=heist')
    expect(filtersToParams(withoutFilter(f, 'years')).toString()).toBe('src=tmdb&genre=28&rating=7&keyword=5&kw=heist')
    expect(filtersToParams(withoutFilter(f, 'keyword')).toString()).toBe('src=tmdb&genre=28&from=1990&to=1999&rating=7')
    expect(withoutFilter(parse('sort=title'), 'sort').sort).toBe('popularity')
  })

  it('"Limpiar todo" de los chips deja catálogo y género', () => {
    const f = parse('addon=x&catalog=top&genre=Drama&from=2000&rating=7&sort=date&lang=en')
    expect(filtersToParams(clearPanel(f)).toString()).toBe('addon=x&catalog=top&genre=Drama')
  })

  it('"Limpiar filtros" de la grilla vacía deja solo el catálogo', () => {
    const f = parse('row=merge:1&genre=Drama&from=2000&sort=date')
    expect(clearAll(f)).toEqual({ src: undefined, addon: undefined, catalog: undefined, row: 'merge:1', sort: 'popularity' })
  })

  it('décadas de la más nueva a la más vieja, y "antes de"', () => {
    const ds = decades(2026)
    expect(ds[0]).toEqual({ label: 'Años 2020', from: 2020, to: 2029 })
    expect(ds.find((d) => d.from === 1990)?.label).toBe('Años 90')
    expect(ds.at(-1)).toEqual({ label: 'Antes de 1970', to: 1969 })
  })

  it('texto del chip de años', () => {
    expect(yearsLabel(1990, 1999, 2026)).toBe('Años 90')
    expect(yearsLabel(undefined, 1969, 2026)).toBe('Antes de 1970')
    expect(yearsLabel(1995, 2004, 2026)).toBe('1995–2004')
    expect(yearsLabel(2001, 2001, 2026)).toBe('2001')
    expect(yearsLabel(2010, undefined, 2026)).toBe('Desde 2010')
    expect(yearsLabel(undefined, 1980, 2026)).toBe('Hasta 1980')
  })

  it('puntaje con punto decimal, como las insignias de IMDb', () => {
    expect(ratingLabel(7)).toBe('7+')
    expect(ratingLabel(7.5)).toBe('7.5+')
  })
})

describe('géneros', () => {
  it('Cinemeta → TMDB según el tipo', () => {
    expect(cinemetaToTmdbGenre('Action', 'movie')).toBe('28')
    expect(cinemetaToTmdbGenre('Action', 'series')).toBe('10759')
    expect(cinemetaToTmdbGenre('Horror', 'series')).toBeUndefined()
    expect(cinemetaToTmdbGenre('35', 'movie')).toBe('35')
  })
  it('TMDB → Cinemeta', () => {
    expect(tmdbToCinemetaGenre('878', 'movie')).toBe('Sci-Fi')
    expect(tmdbToCinemetaGenre('Drama', 'movie')).toBe('Drama')
    expect(tmdbToCinemetaGenre('99999', 'movie')).toBeUndefined()
  })
})

describe('TMDB discover', () => {
  const today = '2026-10-13'

  it('por defecto: popularidad', () => {
    const p = tmdbDiscoverParams(parse('src=tmdb'), 'movie', 1, today)
    expect(p.sort_by).toBe('popularity.desc')
    expect(p.page).toBe(1)
    expect(p['vote_count.gte']).toBeUndefined()
  })

  it('pelis: fechas, puntaje, idioma, país, plataforma y palabra clave', () => {
    const p = tmdbDiscoverParams(parse('src=tmdb&genre=28&from=1990&to=1999&rating=7&lang=es&country=AR&provider=8&keyword=10051'), 'movie', 3, today)
    expect(p).toMatchObject({
      page: 3,
      with_genres: '28',
      'primary_release_date.gte': '1990-01-01',
      'primary_release_date.lte': '1999-12-31',
      'vote_average.gte': 7,
      'vote_count.gte': 50,
      with_original_language: 'es',
      with_origin_country: 'AR',
      with_watch_providers: 8,
      watch_region: 'AR',
      with_keywords: 10051,
    })
  })

  it('series usan first_air_date y name.asc', () => {
    const p = tmdbDiscoverParams(parse('sort=title&from=2010'), 'tv', 1, today)
    expect(p.sort_by).toBe('name.asc')
    expect(p['first_air_date.gte']).toBe('2010-01-01')
    expect(p['primary_release_date.gte']).toBeUndefined()
  })

  it('"más nuevas" no muestra lo que todavía no se estrenó', () => {
    expect(tmdbDiscoverParams(parse('sort=date'), 'movie', 1, today)['primary_release_date.lte']).toBe(today)
    expect(tmdbDiscoverParams(parse('sort=date&to=2030'), 'movie', 1, today)['primary_release_date.lte']).toBe(today)
    expect(tmdbDiscoverParams(parse('sort=date&to=2000'), 'movie', 1, today)['primary_release_date.lte']).toBe('2000-12-31')
  })

  it('por puntaje exige muchos votos; un género de Cinemeta no se manda', () => {
    const p = tmdbDiscoverParams(parse('sort=rating&genre=Drama'), 'movie', 1, today)
    expect(p.sort_by).toBe('vote_average.desc')
    expect(p['vote_count.gte']).toBe(300)
    expect(p.with_genres).toBeUndefined()
  })
})

describe('filtros del lado del cliente', () => {
  const m = (name: string, year: string, imdbRating?: string): MetaPreview => ({ id: name, type: 'movie', name, releaseInfo: year, imdbRating })
  const items = [m('Bravo', '2010', '7.1'), m('alfa', '1999', '8.4'), m('Charlie', '2015–2019', ''), m('Delta', '2021', '6.0')]

  it('lee el año de "2015–2019"', () => {
    expect(yearOf(items[2])).toBe(2015)
    expect(yearOf({ releaseInfo: undefined })).toBeUndefined()
  })

  it('sin filtros respeta el orden del catálogo', () => {
    expect(applyClientFilters(items, parse('')).map((x) => x.name)).toEqual(['Bravo', 'alfa', 'Charlie', 'Delta'])
  })

  it('rango de años', () => {
    expect(applyClientFilters(items, parse('from=2000&to=2016')).map((x) => x.name)).toEqual(['Bravo', 'Charlie'])
  })

  it('puntaje mínimo deja afuera lo que no tiene puntaje', () => {
    expect(applyClientFilters(items, parse('rating=7')).map((x) => x.name)).toEqual(['Bravo', 'alfa'])
  })

  it('ordena por puntaje, fecha y título', () => {
    expect(applyClientFilters(items, parse('sort=rating')).map((x) => x.name)).toEqual(['alfa', 'Bravo', 'Delta', 'Charlie'])
    expect(applyClientFilters(items, parse('sort=date')).map((x) => x.name)).toEqual(['Delta', 'Charlie', 'Bravo', 'alfa'])
    expect(applyClientFilters(items, parse('sort=title')).map((x) => x.name)).toEqual(['alfa', 'Bravo', 'Charlie', 'Delta'])
  })

  it('no modifica la lista original', () => {
    const copy = [...items]
    applyClientFilters(items, parse('sort=title'))
    expect(items).toEqual(copy)
  })
})

it('años para el selector: del que viene hacia atrás', () => {
  const ys = yearOptions(2026, 2020)
  expect(ys[0]).toBe(2027)
  expect(ys.at(-1)).toBe(2020)
  expect(ys).toHaveLength(8)
})

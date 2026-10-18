import { describe, expect, it } from 'vitest'
import {
  failedAddons,
  foldTitle,
  genreLink,
  groupSources,
  parseTab,
  pickBestResult,
  searchOutcome,
  titleScore,
  type SearchSource,
} from './searchResults'
import { parseFilters } from './discoverFilters'
import type { MetaPreview } from './types'

const m = (id: string, name: string, type = 'movie'): MetaPreview => ({ id, name, type })
const src = (over: Partial<SearchSource>): SearchSource => ({
  key: over.key ?? Math.random().toString(36),
  type: 'movie',
  addonName: 'Cinemeta',
  status: 'done',
  items: [],
  ...over,
})

describe('groupSources', () => {
  it('junta por tipo, sin repetidos, Películas y Series primero', () => {
    const groups = groupSources([
      src({ type: 'anime', items: [m('a1', 'Naruto', 'anime')] }),
      src({ type: 'series', items: [m('s1', 'Dark', 'series')] }),
      src({ type: 'movie', addonName: 'Cinemeta', items: [m('tt1', 'Dune'), m('tt2', 'Dune Parte Dos')] }),
      src({ type: 'movie', addonName: 'Otro', items: [m('tt2', 'Dune Parte Dos'), m('x3', 'Dunas')] }),
    ])
    expect(groups.map((g) => g.type)).toEqual(['movie', 'series', 'anime'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['tt1', 'tt2', 'x3'])
  })

  it('cargando con resultados anteriores = atenuado', () => {
    const [g] = groupSources([src({ status: 'loading', items: [m('tt1', 'Dune')] }), src({ status: 'done' })])
    expect(g.loading).toBe(true)
    expect(g.stale).toBe(true)
  })
})

describe('searchOutcome', () => {
  it('sin búsqueda: idle', () => {
    expect(searchOutcome({ active: false, sources: [] })).toBe('idle')
  })
  it('un addon que falló no es "no encontramos nada" (bug #2)', () => {
    expect(searchOutcome({ active: true, sources: [src({ status: 'error', error: 'HTTP 503' })] })).toBe('error')
    expect(searchOutcome({ active: true, sources: [src({ status: 'error' }), src({ status: 'done' })] })).toBe('error')
  })
  it('todos respondieron vacío: empty', () => {
    expect(searchOutcome({ active: true, sources: [src({}), src({ type: 'series' })] })).toBe('empty')
  })
  it('cargando sin nada nuevo: loading (aunque haya resultados viejos)', () => {
    expect(searchOutcome({ active: true, sources: [src({ status: 'loading', items: [m('a', 'A')] })] })).toBe('loading')
  })
  it('con resultados aunque otro falle: results', () => {
    expect(searchOutcome({ active: true, sources: [src({ items: [m('a', 'A')] }), src({ status: 'error' })] })).toBe('results')
  })
  it('las personas también cuentan', () => {
    expect(searchOutcome({ active: true, sources: [src({})], people: { count: 3, loading: false, failed: false } })).toBe('results')
    expect(searchOutcome({ active: true, sources: [src({})], people: { count: 0, loading: true, failed: false } })).toBe('loading')
    expect(searchOutcome({ active: true, sources: [], people: { count: 0, loading: false, failed: true } })).toBe('error')
  })
  it('failedAddons no repite nombres', () => {
    expect(failedAddons([src({ status: 'error' }), src({ status: 'error', type: 'series' }), src({ addonName: 'Otro' })])).toEqual(['Cinemeta'])
  })
})

describe('mejor resultado', () => {
  it('foldTitle saca tildes y signos', () => {
    expect(foldTitle('  El Padrino: Parte II ')).toBe('el padrino parte ii')
    expect(foldTitle('Ñandú')).toBe('nandu')
  })

  it('titleScore', () => {
    expect(titleScore('breaking bad', 'Breaking Bad')).toBe(100)
    expect(titleScore('godfather', 'The Godfather')).toBe(100)
    expect(titleScore('dune', 'Dune: Prophecy')).toBe(60)
    expect(titleScore('bad breaking', 'El Camino: A Breaking Bad Movie')).toBe(30)
    expect(titleScore('darin', 'Relatos salvajes')).toBe(0)
  })

  it('gana el nombre exacto aunque esté en Series', () => {
    const best = pickBestResult('breaking bad', [
      { items: [m('tt9', 'El Camino: A Breaking Bad Movie')] },
      { items: [m('tt0903747', 'Breaking Bad', 'series')] },
    ])
    expect(best?.id).toBe('tt0903747')
  })

  it('a igual nombre, el primero del addon y después Películas', () => {
    const best = pickBestResult('dune', [
      { items: [m('tt1160419', 'Dune'), m('tt0087182', 'Dune')] },
      { items: [m('tt0142032', 'Dune', 'series')] },
    ])
    expect(best?.id).toBe('tt1160419')
  })

  it('sin parecido no hay mejor resultado (búsqueda de una persona)', () => {
    expect(pickBestResult('ricardo darin', [{ items: [m('a', 'Relatos salvajes'), m('b', 'Nueve reinas')] }])).toBeUndefined()
    expect(pickBestResult('x', [])).toBeUndefined()
  })

  it('gana una persona que se parece igual o más que el mejor título (v0.26)', () => {
    const groups = [{ items: [m('tt1', 'Ricardo Del Rey')] }]
    expect(pickBestResult('ricardo', groups, [{ name: 'Ricardo Darín' }])).toBeUndefined()
    expect(pickBestResult('taylor swift', [{ items: [m('tt2', 'Taylor Swift: The Eras Tour')] }], [{ name: 'Taylor Swift' }])).toBeUndefined()
    // Sin personas, como siempre.
    expect(pickBestResult('ricardo', groups, [])?.id).toBe('tt1')
  })

  it('el título gana si se parece más que las personas', () => {
    expect(pickBestResult('joker', [{ items: [m('tt7286456', 'Joker')] }], [{ name: 'Joker Xue' }])?.id).toBe('tt7286456')
    // Una persona que no se parece (o muy abajo en la lista) no cuenta.
    expect(pickBestResult('dune', [{ items: [m('tt1160419', 'Dune')] }], [{ name: 'Denis Villeneuve' }])?.id).toBe('tt1160419')
    const far = ['A', 'B', 'C', 'D', 'E', 'Dune Person'].map((name) => ({ name }))
    expect(pickBestResult('dune', [{ items: [m('tt1160419', 'Dune Part')] }], far)?.id).toBe('tt1160419')
  })

  it('solo mira los primeros de cada grupo', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'Matrix'].map((n, i) => m(String(i), n))
    expect(pickBestResult('matrix', [{ items }])).toBeUndefined()
  })
})

describe('parseTab', () => {
  it('valores válidos o Todo', () => {
    expect(parseTab('series')).toBe('series')
    expect(parseTab('people')).toBe('people')
    expect(parseTab('nada')).toBe('all')
    expect(parseTab(null)).toBe('all')
  })
})

describe('genreLink', () => {
  it('usa el formato de URL de los filtros de Descubrir', () => {
    expect(genreLink('movie', 'Comedy')).toBe('/discover/movie?genre=Comedy')
    expect(genreLink('series', 'Sci-Fi')).toBe('/discover/series?genre=Sci-Fi')
    expect(parseFilters(new URLSearchParams(genreLink('movie', 'Horror').split('?')[1])).genre).toBe('Horror')
  })
})

import { describe, expect, it } from 'vitest'
import {
  failedAddons,
  foldTitle,
  genreLink,
  groupSources,
  parseTab,
  pickBestResult,
  resultScore,
  searchOutcome,
  titleScore,
  type SearchMeta,
  type SearchSource,
  type TitleLookup,
} from './searchResults'
import type { TitleEntry } from './localTitlesStore'
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

describe('groupSources con TMDB (v0.28)', () => {
  // TMDB: ids `tmdb:…`, nombre en español y el original aparte.
  const t = (id: string, name: string, originalName: string, year: string, type = 'movie'): SearchMeta => ({
    id,
    name,
    originalName,
    type: type as SearchMeta['type'],
    releaseInfo: year,
  })
  const y = (id: string, name: string, year: string, type = 'movie'): MetaPreview => ({ ...m(id, name, type), releaseInfo: year })
  const lookup =
    (entries: Record<string, Partial<TitleEntry>>): TitleLookup =>
    (id) =>
      entries[id] ? { at: 1, ...entries[id] } : undefined
  const tmdbSrc = (items: SearchMeta[], type = 'movie') => src({ key: `tmdb|${type}`, type, addonName: 'TMDB', tmdb: true, items })

  it('lo de TMDB va después de lo de los addons', () => {
    const [g] = groupSources([tmdbSrc([t('tmdb:movie:1', 'Ella y yo', 'His & Hers', '2025')]), src({ items: [y('tt5', 'Otra', '2020')] })])
    expect(g.items.map((i) => i.id)).toEqual(['tt5', 'tmdb:movie:1'])
    // El puesto para el mejor resultado es el de su fuente: el primero de TMDB compite como primero.
    expect(g.ranks).toEqual([0, 0])
  })

  it('con el id de TMDB conocido, gana el del addon (aunque el nombre no coincida)', () => {
    const known = lookup({ tt100: { t: 7, k: 'movie', n: 'Ella y yo' } })
    const [g] = groupSources(
      [src({ items: [y('tt9', 'Otra', '2020'), y('tt100', 'His & Hers', '2025')] }), tmdbSrc([t('tmdb:movie:7', 'Ella y yo', 'His & Hers', '2025')])],
      known,
    )
    expect(g.items.map((i) => i.id)).toEqual(['tt9', 'tt100'])
    expect(g.ranks).toEqual([0, 0])
  })

  it('el id conocido junta aunque Cinemeta y TMDB no coincidan en peli o serie', () => {
    const known = lookup({ tt3: { t: 8, k: 'tv' } })
    const groups = groupSources(
      [src({ items: [y('tt3', 'Miniserie', '2019')] }), tmdbSrc([], 'movie'), tmdbSrc([t('tmdb:tv:8', 'Miniserie', 'Miniserie', '2019', 'series')], 'series')],
      known,
    )
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(['tt3'])
  })

  it('sin el id de TMDB todavía: mismo nombre (original o español) y mismo año ±1 = el mismo', () => {
    const [g] = groupSources([
      src({ items: [y('tt1', 'His & Hers', '2025'), y('tt2', 'Nueve reinas', '2000'), y('tt3', 'Dune', '1984')] }),
      tmdbSrc([
        t('tmdb:movie:1', 'Ella y yo', 'His & Hers', '2026'),
        t('tmdb:movie:2', 'Nueve reinas', 'Nueve reinas', '2000'),
        // Mismo nombre, otro año: es otra peli.
        t('tmdb:movie:3', 'Dune', 'Dune', '2021'),
      ]),
    ])
    expect(g.items.map((i) => i.id)).toEqual(['tt1', 'tt2', 'tt3', 'tmdb:movie:3'])
    // El del addon se queda con los nombres de TMDB para el mejor resultado.
    expect(g.items[0]).toMatchObject({ id: 'tt1', altName: 'Ella y yo', originalName: 'His & Hers' })
  })

  it('cada uno del addon se junta con uno solo de TMDB', () => {
    const [g] = groupSources([src({ items: [y('tt1', 'Dune', '2021')] }), tmdbSrc([t('tmdb:movie:1', 'Dune', 'Dune', '2021'), t('tmdb:movie:2', 'Dune', 'Dune', '2021')])])
    expect(g.items.map((i) => i.id)).toEqual(['tt1', 'tmdb:movie:2'])
  })

  it('un título del addon con otro id de TMDB conocido no se junta por nombre', () => {
    const known = lookup({ tt1: { t: 99, k: 'movie' } })
    const [g] = groupSources([src({ items: [y('tt1', 'Dune', '2021')] }), tmdbSrc([t('tmdb:movie:1', 'Dune', 'Dune', '2021')])], known)
    expect(g.items.map((i) => i.id)).toEqual(['tt1', 'tmdb:movie:1'])
  })

  it('TMDB cargando también atenúa el grupo', () => {
    const [g] = groupSources([src({ items: [m('tt1', 'Dune')] }), { ...tmdbSrc([]), status: 'loading' }])
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

  it('gana una persona que se parece más que el mejor título (v0.26)', () => {
    expect(pickBestResult('taylor swift', [{ items: [m('tt2', 'Taylor Swift: The Eras Tour')] }], [{ name: 'Taylor Swift' }])).toBeUndefined()
    // La persona primera le gana a un título que se parece igual pero va más abajo en su grupo.
    expect(pickBestResult('ricardo', [{ items: [m('x', 'Otra'), m('tt1', 'Ricardo Del Rey')] }], [{ name: 'Ricardo Darín' }])).toBeUndefined()
  })

  it('a igual puntaje gana el título', () => {
    const groups = [{ items: [m('tt1', 'Ricardo Del Rey')] }]
    expect(pickBestResult('ricardo', groups, [{ name: 'Ricardo Darín' }])?.id).toBe('tt1')
    expect(pickBestResult('oppenheimer', [{ items: [m('tt15398776', 'Oppenheimer')] }], [{ name: 'Oppenheimer' }])?.id).toBe('tt15398776')
    // También si el título es del segundo grupo (Series): el desempate por grupo es solo entre títulos.
    expect(pickBestResult('ricardo', [{ items: [] }, { items: [m('s1', 'Ricardo Show', 'series')] }], [{ name: 'Ricardo Darín' }])?.id).toBe('s1')
    // La persona más abajo en su lista tampoco gana.
    expect(pickBestResult('ricardo', groups, [{ name: 'Otro' }, { name: 'Ricardo Darín' }])?.id).toBe('tt1')
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

  it('busca por los dos nombres (v0.28)', () => {
    const known: TitleLookup = (id) => (id === 'tt1' ? { at: 1, n: 'Ella y yo', o: 'His & Hers' } : undefined)
    expect(resultScore('ella y yo', m('tt1', 'His & Hers'), known)).toBe(100)
    expect(resultScore('his & hers', m('tt1', 'His & Hers'), known)).toBe(100)
    // Los nombres de TMDB que se le juntaron también cuentan, aunque el mapa todavía no lo sepa.
    expect(resultScore('ella y yo', { ...m('tt2', 'His & Hers'), altName: 'Ella y yo' }, () => undefined)).toBe(100)
    expect(resultScore('ella y yo', m('tt2', 'His & Hers'), () => undefined)).toBe(0)
    const best = pickBestResult('ella y yo', [{ items: [m('tt9', 'Ella'), m('tt1', 'His & Hers')] }], [], known)
    expect(best?.id).toBe('tt1')
  })

  it('el primero de TMDB compite como primero aunque vaya al final de la grilla (v0.28)', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'Ella y yo'].map((n, i) => m(i === 5 ? 'tmdb:movie:1' : `tt${i}`, n))
    expect(pickBestResult('ella y yo', [{ items, ranks: [0, 1, 2, 3, 4, 0] }], [], () => undefined)?.id).toBe('tmdb:movie:1')
    // A igual puntaje y puesto, el del addon (va antes en la grilla).
    const tie = [m('tt1', 'Dune'), m('tmdb:movie:2', 'Dune')]
    expect(pickBestResult('dune', [{ items: tie, ranks: [0, 0] }], [], () => undefined)?.id).toBe('tt1')
  })

  it('con el nombre en español, una persona igual necesita más puntaje que el título (v0.27.1)', () => {
    const known: TitleLookup = (id) => (id === 'tt1' ? { at: 1, n: 'Ricardo' } : undefined)
    expect(pickBestResult('ricardo', [{ items: [m('tt1', 'Richard')] }], [{ name: 'Ricardo' }], known)?.id).toBe('tt1')
    expect(pickBestResult('ricardo', [{ items: [m('x', 'Otra'), m('tt1', 'Richard')] }], [{ name: 'Ricardo' }], known)).toBeUndefined()
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

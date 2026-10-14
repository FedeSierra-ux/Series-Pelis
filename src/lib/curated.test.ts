import { describe, expect, it } from 'vitest'
import { CURATED, curatedById, curatedPath, intersectCredits, parseOscars } from './curated'
import type { TmdbListItem } from './tmdb'

describe('listas curadas', () => {
  it('ids únicos', () => {
    const ids = CURATED.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('las de palabra clave van a Descubrir; las demás a /lists', () => {
    const heist = curatedById('kw-heist')!
    expect(curatedPath(heist)).toBe('/discover/movie?src=tmdb&keyword=10051&kw=Robos%20y%20atracos')
    expect(curatedPath(curatedById('oscars')!)).toBe('/lists/oscars')
  })

  it('una saga se arma desde su id', () => {
    expect(curatedById('saga-1241')).toMatchObject({ kind: 'saga', collection: 1241, needsTmdb: true })
    expect(curatedById('no-existe')).toBeUndefined()
  })

  it('las listas "Mejor puntaje IMDb" ya no existen (v0.13.0)', () => {
    expect(curatedById('top-imdb-movie')).toBeUndefined()
    expect(curatedById('top-imdb-series')).toBeUndefined()
  })
})

describe('Wikidata: ganadoras del Oscar', () => {
  const b = (film: string, label: string, imdb: string, year?: string) => ({
    film: { value: `http://www.wikidata.org/entity/${film}` },
    filmLabel: { value: label },
    imdb: { value: imdb },
    ...(year ? { year: { value: year } } : {}),
  })

  it('una tarjeta por película, con el año de la ceremonia', () => {
    const res = {
      results: {
        bindings: [
          b('Q1', 'Anora', 'tt28607951', '2025'),
          b('Q2', 'Oppenheimer', 'tt15398776', '2024'),
          b('Q2', 'Oppenheimer', 'tt15398776', '2024'),
          b('Q3', 'Q134773', 'tt0109830', '1995'),
          b('Q4', 'Sin id', 'nm0048918', '2025'),
          b('Q5', 'Alas', 'tt0018578'),
        ],
      },
    }
    expect(parseOscars(res)).toEqual([
      { id: 'tt28607951', type: 'movie', name: 'Anora', releaseInfo: 'Oscar 2025' },
      { id: 'tt15398776', type: 'movie', name: 'Oppenheimer', releaseInfo: 'Oscar 2024' },
      { id: 'tt0109830', type: 'movie', name: 'tt0109830', releaseInfo: 'Oscar 1995' },
      { id: 'tt0018578', type: 'movie', name: 'Alas', releaseInfo: undefined },
    ])
  })

  it('respuesta vacía', () => {
    expect(parseOscars({})).toEqual([])
  })
})

describe('dos personas juntas', () => {
  const c = (media_type: 'movie' | 'tv', id: number, popularity: number, role: { character?: string; job?: string } = {}): TmdbListItem => ({
    id,
    media_type,
    popularity,
    ...role,
  })

  it('cruza los créditos (actuación y equipo), sin repetidos y por popularidad', () => {
    const a = [c('movie', 1, 10, { character: 'Ricardo' }), c('movie', 2, 50, { character: 'Tomás' }), c('tv', 2, 5), c('movie', 1, 10, { job: 'Producer' })]
    const b = [c('movie', 1, 10, { job: 'Director' }), c('movie', 2, 50, { character: 'Pablo' }), c('movie', 3, 99)]
    const out = intersectCredits(a, b)
    expect(out.map((x) => `${x.media_type}:${x.id}`)).toEqual(['movie:2', 'movie:1'])
    expect(out[1].roleA).toBe('Ricardo, Producer')
    expect(out[1].roleB).toBe('Director')
  })

  it('pelis y series con el mismo número no se confunden', () => {
    expect(intersectCredits([c('tv', 7, 1)], [c('movie', 7, 1)])).toEqual([])
  })
})

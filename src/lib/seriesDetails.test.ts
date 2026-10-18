import { describe, expect, it } from 'vitest'
import { countryName, hasSeriesDetails, providerGroups, seriesCountries, seriesDirectors, seriesFacts, seriesPeople } from './seriesDetails'
import type { TmdbDetails, TmdbProvider } from './tmdb'

const prov = (provider_id: number, provider_name: string, display_priority = 1): TmdbProvider => ({
  provider_id,
  provider_name,
  display_priority,
  logo_path: '/x.png',
})

describe('seriesPeople', () => {
  it('usa "Creación" con created_by, sin repetir', () => {
    const d = {
      id: 1,
      created_by: [
        { id: 7, name: 'Vince Gilligan' },
        { id: 7, name: 'Vince Gilligan' },
        { id: 8, name: ' Peter Gould ' },
      ],
    } as TmdbDetails
    expect(seriesPeople(d)).toEqual({
      label: 'Creación',
      people: [
        { id: 7, name: 'Vince Gilligan' },
        { id: 8, name: 'Peter Gould' },
      ],
    })
  })

  it('sin creación, "Dirección" con los directores del equipo agregado (los de más episodios primero, tope 3)', () => {
    const d = {
      id: 1,
      created_by: [],
      aggregate_credits: {
        cast: [],
        crew: [
          { id: 1, name: 'Uno', jobs: [{ job: 'Director', episode_count: 2 }] },
          { id: 2, name: 'Guionista', jobs: [{ job: 'Writer', episode_count: 10 }] },
          { id: 3, name: 'Tres', jobs: [{ job: 'Producer', episode_count: 9 }, { job: 'Director', episode_count: 6 }] },
          { id: 4, name: 'Cuatro', jobs: [{ job: 'Director', episode_count: 4 }] },
          { id: 5, name: 'Cinco', jobs: [{ job: 'Director', episode_count: 1 }] },
          { id: 3, name: 'Tres', jobs: [{ job: 'Director', episode_count: 6 }] },
        ],
      },
    } as TmdbDetails
    expect(seriesPeople(d)).toEqual({
      label: 'Dirección',
      people: [
        { id: 3, name: 'Tres' },
        { id: 4, name: 'Cuatro' },
        { id: 1, name: 'Uno' },
      ],
    })
  })

  it('también toma los directores de credits.crew', () => {
    const d = {
      id: 1,
      credits: {
        cast: [],
        crew: [
          { id: 9, name: 'Directora', job: 'Director', department: 'Directing' },
          { id: 10, name: 'Montajista', job: 'Editor', department: 'Editing' },
          { id: 9, name: 'Directora', job: 'Director', department: 'Directing' },
        ],
      },
    } as TmdbDetails
    expect(seriesDirectors(d)).toEqual([{ id: 9, name: 'Directora' }])
  })

  it('sin TMDB usa los creadores de Cinemeta; sin nada, no hay fila', () => {
    expect(seriesPeople(undefined, { writer: ['Matt Duffer', 'Ross Duffer', 'Matt Duffer'] })).toEqual({
      label: 'Creación',
      people: [{ name: 'Matt Duffer' }, { name: 'Ross Duffer' }],
    })
    expect(seriesPeople(undefined, {})).toBeUndefined()
    expect(seriesPeople({ id: 1, created_by: [], aggregate_credits: { cast: [] } } as TmdbDetails)).toBeUndefined()
  })
})

describe('seriesCountries', () => {
  it('traduce origin_country al español', () => {
    expect(seriesCountries({ id: 1, origin_country: ['US', 'GB', 'US'] } as TmdbDetails)).toEqual(['Estados Unidos', 'Reino Unido'])
  })

  it('sin origin_country usa production_countries; los códigos viejos tienen nombre propio', () => {
    const d = {
      id: 1,
      origin_country: [],
      production_countries: [
        { iso_3166_1: 'AR', name: 'Argentina' },
        { iso_3166_1: 'SU', name: 'Soviet Union' },
      ],
    } as TmdbDetails
    expect(seriesCountries(d)).toEqual(['Argentina', 'Unión Soviética'])
  })

  it('un código desconocido usa el nombre de TMDB o se deja afuera', () => {
    expect(countryName('QQ', 'Tierra Media')).toBe('Tierra Media')
    expect(countryName('QQ')).toBeUndefined()
  })

  it('sin TMDB traduce el texto en inglés de Cinemeta y deja afuera lo que no reconoce', () => {
    expect(seriesCountries(undefined, { country: 'United States, France, Narnia' })).toEqual(['Estados Unidos', 'Francia'])
    expect(seriesCountries(undefined, { country: 'USA, South Korea' })).toEqual(['Estados Unidos', 'Corea del Sur'])
    expect(seriesCountries(undefined, {})).toEqual([])
  })
})

describe('providerGroups', () => {
  it('agrupa suscripción, alquiler y compra en ese orden, sin repetir y por prioridad', () => {
    expect(
      providerGroups({
        buy: [prov(2, 'Apple TV'), prov(3, 'Google Play Movies', 2)],
        flatrate: [prov(8, 'Netflix', 3), prov(337, 'Disney Plus', 1), prov(8, 'Netflix', 3)],
        free: [prov(9, 'Pluto TV')],
      }),
    ).toEqual([
      { label: 'Suscripción', names: ['Disney Plus', 'Netflix'] },
      { label: 'Compra', names: ['Apple TV', 'Google Play Movies'] },
    ])
  })

  it('sin datos de Argentina no hay grupos', () => {
    expect(providerGroups(undefined)).toEqual([])
    expect(providerGroups({ link: 'https://x' })).toEqual([])
  })
})

describe('seriesFacts / hasSeriesDetails', () => {
  it('lee los proveedores de la región AR', () => {
    const d = {
      id: 1,
      'watch/providers': { results: { US: { flatrate: [prov(1, 'Hulu')] }, AR: { rent: [prov(2, 'Apple TV')] } } },
    } as TmdbDetails
    expect(seriesFacts(d).providers).toEqual([{ label: 'Alquiler', names: ['Apple TV'] }])
  })

  it('la pestaña se esconde solo si no hay nada (ni reparto)', () => {
    const empty = seriesFacts(undefined, {})
    expect(hasSeriesDetails(empty, 0)).toBe(false)
    expect(hasSeriesDetails(empty, 3)).toBe(true)
    expect(hasSeriesDetails(seriesFacts(undefined, { country: 'Argentina' }), 0)).toBe(true)
  })
})

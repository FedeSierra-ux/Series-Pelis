import { describe, expect, it } from 'vitest'
import { detailPathFor, safeDecode } from './fallback'

describe('recargar el reproductor vuelve a la ficha (auditoría #4)', () => {
  it('peli: la ficha de la peli', () => {
    expect(detailPathFor('movie', 'tt0012349')).toBe('/detail/movie/tt0012349')
  })

  it('episodio: la ficha de la serie con la temporada y el episodio elegidos', () => {
    expect(detailPathFor('series', 'tt0903747%3A1%3A2')).toBe('/detail/series/tt0903747?season=1&video=tt0903747%3A1%3A2')
    expect(detailPathFor('series', 'tt0903747:3:7')).toBe('/detail/series/tt0903747?season=3&video=tt0903747%3A3%3A7')
  })

  it('usa el progreso guardado si lo hay (ids de otros addons)', () => {
    const progress = { 'kitsu:1:5': { metaId: 'kitsu:1', season: undefined } }
    expect(detailPathFor('series', 'kitsu:1:5', progress)).toBe('/detail/series/kitsu%3A1?video=kitsu%3A1%3A5')
  })

  it('sin id, a Inicio', () => {
    expect(detailPathFor('movie', '')).toBe('/')
  })

  it('safeDecode no rompe con un % suelto', () => {
    expect(safeDecode('tt1%3A1%3A1')).toBe('tt1:1:1')
    expect(safeDecode('100%')).toBe('100%')
  })
})

import { describe, expect, it } from 'vitest'
import { resultsAnnouncement } from './announce'

describe('anuncio de resultados de Buscar (a11y-05)', () => {
  it('cuenta películas y series', () => {
    expect(resultsAnnouncement({ query: 'matrix', movies: 3, series: 2, people: 0, total: 5 })).toBe('3 películas y 2 series para “matrix”')
  })
  it('singular y personas', () => {
    expect(resultsAnnouncement({ query: 'darín', movies: 1, series: 0, people: 1, total: 2 })).toBe('1 película y 1 persona para “darín”')
    expect(resultsAnnouncement({ query: 'x', movies: 2, series: 1, people: 3, total: 6 })).toBe('2 películas, 1 serie y 3 personas para “x”')
  })
  it('sin nada', () => {
    expect(resultsAnnouncement({ query: 'zzz', movies: 0, series: 0, people: 0, total: 0 })).toBe('Sin resultados para “zzz”')
  })
  it('otros tipos de catálogo cuentan como resultados', () => {
    expect(resultsAnnouncement({ query: 'q', movies: 0, series: 0, people: 0, total: 4 })).toBe('4 resultados para “q”')
  })
})

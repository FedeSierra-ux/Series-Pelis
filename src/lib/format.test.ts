import { describe, expect, it } from 'vitest'
import { seasonCount, seriesYear } from './format'

describe('seasonCount', () => {
  it('cuenta temporadas distintas sin los especiales', () => {
    expect(seasonCount([{ season: 1 }, { season: 1 }, { season: 2 }, { season: 0 }])).toBe(2)
    expect(seasonCount([{ season: 1 }, { season: 0 }])).toBe(1)
  })
  it('sin episodios con temporada no sabe', () => {
    expect(seasonCount(undefined)).toBeUndefined()
    expect(seasonCount([{}, { season: 0 }])).toBeUndefined()
  })
})

describe('seriesYear', () => {
  it('una sola temporada en emisión: solo el año', () => {
    expect(seriesYear('2026–', 1)).toBe('2026')
    expect(seriesYear('2026-', 1)).toBe('2026')
  })
  it('con más temporadas o sin saberlo, deja el guion', () => {
    expect(seriesYear('2024–', 2)).toBe('2024–')
    expect(seriesYear('2024–', undefined)).toBe('2024–')
  })
  it('mismo año al principio y al final: uno solo', () => {
    expect(seriesYear('2019–2019', 1)).toBe('2019')
    expect(seriesYear('2019–2019', undefined)).toBe('2019')
  })
  it('lo demás queda igual', () => {
    expect(seriesYear('2011–2019', 8)).toBe('2011–2019')
    expect(seriesYear('2010', 1)).toBe('2010')
    expect(seriesYear(undefined, 1)).toBeUndefined()
  })
})

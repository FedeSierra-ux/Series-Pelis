import { describe, expect, it } from 'vitest'
import { clockTime, seasonCount, seriesYear } from './format'

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
  it('con más temporadas, deja el guion', () => {
    expect(seriesYear('2026–', 2, 2026)).toBe('2026–')
    expect(seriesYear('2024–', 2)).toBe('2024–')
  })
  it('sin saber las temporadas, solo saca el guion si arrancó este año', () => {
    expect(seriesYear('2026–', undefined, 2026)).toBe('2026')
    expect(seriesYear('2025–', undefined, 2026)).toBe('2025–')
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

describe('clockTime', () => {
  it('hora en 24 h, sin "p. m."', () => {
    expect(clockTime(new Date(2026, 0, 1, 20, 5))).toBe('20:05')
    expect(clockTime(new Date(2026, 0, 1, 8, 5).getTime())).toBe('08:05')
    expect(clockTime(new Date(2026, 0, 1, 0, 30))).toBe('00:30')
  })
})

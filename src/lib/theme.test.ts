import { describe, expect, it } from 'vitest'
import { continueSubtitle, remainingLabel } from './remaining'
import { normalizeTheme } from './theme'

describe('normalizeTheme', () => {
  it('solo "2" activa el Tema 2', () => {
    expect(normalizeTheme('2')).toBe('2')
    expect(normalizeTheme(2)).toBe('2')
  })
  it('lo demás es el Tema 1', () => {
    for (const v of ['1', undefined, null, '', 'oscuro', 3, {}]) expect(normalizeTheme(v)).toBe('1')
  })
})

describe('remainingLabel', () => {
  it('minutos', () => {
    expect(remainingLabel(600, 2040)).toBe('quedan 24 min')
  })
  it('horas y minutos', () => {
    expect(remainingLabel(0, 72 * 60)).toBe('quedan 1 h 12 min')
    expect(remainingLabel(0, 7200)).toBe('quedan 2 h')
  })
  it('al final queda al menos 1 min', () => {
    expect(remainingLabel(1199, 1200)).toBe('quedan 1 min')
    expect(remainingLabel(5000, 1200)).toBe('quedan 1 min')
  })
  it('sin duración no dice nada', () => {
    expect(remainingLabel(100, 0)).toBe('')
    expect(remainingLabel(Number.NaN, 100)).toBe('')
  })
})

describe('continueSubtitle', () => {
  it('episodio y tiempo restante', () => {
    expect(continueSubtitle({ season: 1, episode: 3, position: 600, duration: 2040 })).toBe('T1 E3 · quedan 24 min')
  })
  it('película', () => {
    expect(continueSubtitle({ position: 0, duration: 4320 })).toBe('quedan 1 h 12 min')
  })
  it('sin datos', () => {
    expect(continueSubtitle({ position: 0, duration: 0 })).toBe('Continuar')
    expect(continueSubtitle({ season: 2, episode: 1, position: 0, duration: 0 })).toBe('T2 E1')
  })
})

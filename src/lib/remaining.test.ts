import { describe, expect, it } from 'vitest'
import { episodeLabel } from './format'
import { continueSubtitle } from './remaining'

describe('código de episodio único (sistema-11)', () => {
  it('episodeLabel da "T1 · E2" y vacío sin datos', () => {
    expect(episodeLabel(1, 2)).toBe('T1 · E2')
    expect(episodeLabel(1, undefined)).toBe('')
  })
  it('"Seguir viendo" usa el mismo formato', () => {
    expect(continueSubtitle({ season: 1, episode: 3, position: 600, duration: 2400 })).toBe('T1 · E3 · quedan 30 min')
    expect(continueSubtitle({ position: 600, duration: 2400 })).toBe('quedan 30 min')
    expect(continueSubtitle({ position: 0, duration: 0 })).toBe('Continuar')
  })
})

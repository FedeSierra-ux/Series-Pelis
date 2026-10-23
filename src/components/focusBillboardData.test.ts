import { describe, expect, it } from 'vitest'
import type { Meta } from '../lib/types'
import { buildInfo, portraitLogo } from './focusBillboardData'

describe('portraitLogo (visual-01)', () => {
  it('un logo vertical o cuadrado de metahub se trata como roto', () => {
    expect(portraitLogo(780, 1141)).toBe(true)
    expect(portraitLogo(500, 500)).toBe(true)
    expect(portraitLogo(500, 401)).toBe(true)
  })

  it('un logo apaisado normal se deja', () => {
    expect(portraitLogo(800, 310)).toBe(false)
    expect(portraitLogo(500, 400)).toBe(false)
  })

  it('sin medidas (todavía no cargó) no se decide nada', () => {
    expect(portraitLogo(0, 0)).toBe(false)
  })
})

describe('buildInfo: géneros de Cinemeta en español (pc-03 / visual-12)', () => {
  const meta = { id: 'tt0133093', type: 'movie', name: 'The Matrix', genres: ['Action', 'Sci-Fi', 'Thriller'], releaseInfo: '1999' } as Meta

  it('traduce con genreLabel y deja solo los dos primeros', () => {
    const info = buildInfo('k', meta, undefined)
    expect(info.facts).toContain('Acción · Ciencia ficción')
  })

  it('el campo viejo `genre` también se traduce', () => {
    const info = buildInfo('k', { ...meta, genres: undefined, genre: ['Horror', 'Drama'] } as Meta, undefined)
    expect(info.facts).toContain('Terror · Drama')
  })
})

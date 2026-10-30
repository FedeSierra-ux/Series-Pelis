import { describe, expect, it } from 'vitest'
import { initialOf, placeholderSrc, placeholderSvg } from './imgPlaceholder'

describe('imgPlaceholder (visual-pc-03)', () => {
  it('la inicial salta signos y respeta los acentos', () => {
    expect(initialOf('The Wire')).toBe('T')
    expect(initialOf('¿Qué fue?')).toBe('Q')
    expect(initialOf('érase una vez')).toBe('É')
    expect(initialOf('24')).toBe('2')
    expect(initialOf('…')).toBe('')
    expect(initialOf(undefined)).toBe('')
  })
  it('con título lleva la inicial; sin título, un ícono', () => {
    expect(placeholderSvg('poster', 'Dune')).toContain('>D</text>')
    expect(placeholderSvg('wide')).not.toContain('<text')
    expect(placeholderSvg('wide')).toContain('<rect x=')
  })
  it('solo mete letras o números en el SVG y sale como data URI', () => {
    expect(placeholderSvg('poster', '<b>')).not.toContain('<b>')
    expect(placeholderSvg('poster', '&Co')).toContain('>C</text>')
    expect(placeholderSrc('poster', 'Dune').startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
  })
  it('las dos formas tienen la proporción del recurso (2:3 y 16:9)', () => {
    expect(placeholderSvg('poster')).toContain('viewBox="0 0 200 300"')
    expect(placeholderSvg('wide')).toContain('viewBox="0 0 320 180"')
  })
})

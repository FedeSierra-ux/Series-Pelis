import { describe, expect, it } from 'vitest'
import { clampStars, formatStars, isHighStars, isLowStars, starFill, starsFromKey, starsFromPointer, starsLabel } from './stars'

describe('estrellas', () => {
  it('redondea a media estrella entre 0,5 y 5', () => {
    expect(clampStars(3.3)).toBe(3.5)
    expect(clampStars(3.2)).toBe(3)
    expect(clampStars(0)).toBe(0.5)
    expect(clampStars(9)).toBe(5)
    expect(clampStars(Number.NaN)).toBe(0.5)
  })

  it('formatea con coma decimal', () => {
    expect(formatStars(4.5)).toBe('4,5')
    expect(formatStars(4)).toBe('4')
    expect(starsLabel(1)).toBe('1 estrella')
    expect(starsLabel(0.5)).toBe('0,5 estrellas')
  })

  it('pinta llenas, medias y vacías', () => {
    expect([1, 2, 3, 4, 5].map((i) => starFill(3.5, i))).toEqual(['full', 'full', 'full', 'half', 'empty'])
    expect(starFill(0, 1)).toBe('empty')
  })

  it('el clic en el lado izquierdo resta media', () => {
    expect(starsFromPointer(4, 0.2)).toBe(3.5)
    expect(starsFromPointer(4, 0.7)).toBe(4)
    // Un toque al centro cuenta la estrella entera.
    expect(starsFromPointer(5, 0.48)).toBe(5)
    expect(starsFromPointer(1, 0)).toBe(0.5)
  })

  it('maneja las teclas del control remoto', () => {
    expect(starsFromKey(undefined, 'ArrowRight')).toBe(0.5)
    expect(starsFromKey(undefined, 'ArrowLeft')).toBeUndefined()
    expect(starsFromKey(3, 'ArrowLeft')).toBe(2.5)
    expect(starsFromKey(5, 'ArrowRight')).toBe(5)
    expect(starsFromKey(0.5, 'ArrowLeft')).toBe(0.5)
    expect(starsFromKey(2, '4')).toBe(4)
    expect(starsFromKey(2, 'End')).toBe(5)
    expect(starsFromKey(2, 'ArrowUp')).toBeUndefined()
    expect(starsFromKey(2, 'Enter')).toBeUndefined()
  })

  it('bajo y alto', () => {
    expect(isLowStars(2.5)).toBe(true)
    expect(isLowStars(3)).toBe(false)
    expect(isHighStars(4)).toBe(true)
    expect(isHighStars(3.5)).toBe(false)
  })
})

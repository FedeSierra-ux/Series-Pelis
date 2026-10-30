import { describe, expect, it } from 'vitest'
import { insetStyle, leftInsetFraction, MAX_INSET } from './logoInset'

/** Imagen RGBA de `w`×`h` transparente con tinta en las columnas [from, to). */
function image(w: number, h: number, from: number, to: number, alpha = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = from; x < to; x++) d[(y * w + x) * 4 + 3] = alpha
  return d
}

describe('leftInsetFraction (visual-pc-05)', () => {
  it('mide el aire transparente de la izquierda como fracción del ancho', () => {
    expect(leftInsetFraction(image(100, 10, 20, 90), 100)).toBe(0.2)
    expect(leftInsetFraction(image(128, 50, 32, 128), 128)).toBe(0.25)
  })
  it('un logo recortado (tinta desde la primera columna) no se corrige', () => {
    expect(leftInsetFraction(image(100, 10, 0, 100), 100)).toBe(0)
    expect(leftInsetFraction(image(100, 10, 2, 100), 100)).toBe(0)
  })
  it('alcanza una sola fila con tinta más a la izquierda', () => {
    const d = image(100, 10, 40, 90)
    d[(5 * 100 + 10) * 4 + 3] = 255
    expect(leftInsetFraction(d, 100)).toBe(0.1)
  })
  it('ignora lo casi transparente', () => {
    expect(leftInsetFraction(image(100, 10, 5, 90, 20), 100)).toBe(0)
  })
  it('sin tinta o con ancho inválido da 0, y hay un tope', () => {
    expect(leftInsetFraction(new Uint8ClampedArray(400), 10)).toBe(0)
    expect(leftInsetFraction(new Uint8ClampedArray(400), 0)).toBe(0)
    expect(leftInsetFraction(image(100, 10, 90, 100), 100)).toBe(MAX_INSET)
  })
})

describe('insetStyle', () => {
  it('corre a la izquierda en porcentaje de su propio ancho', () => {
    expect(insetStyle(0.215)).toEqual({ transform: 'translateX(-21.5%)' })
    expect(insetStyle(0)).toBeUndefined()
  })
})

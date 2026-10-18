import { describe, expect, it } from 'vitest'
import { canShiftCueBox, cuePlacement, placeCue } from './subtitlePrefs'

describe('cuePlacement', () => {
  it('sin nada en la esquina queda como siempre', () => {
    expect(cuePlacement(0)).toEqual({ line: undefined, shift: 0 })
    expect(cuePlacement(10)).toEqual({ line: 82, shift: 0 })
    expect(cuePlacement(0, 20)).toEqual({ line: 78, shift: 0 })
    expect(cuePlacement(10, 5)).toEqual({ line: 82, shift: 0 })
    // `shiftBox` solo cuenta con `bottom`: PC/TV y el celular sin esquina siguen igual en Chromium.
    expect(cuePlacement(0, 20, 0, true)).toEqual({ line: 78, shift: 0 })
    expect(cuePlacement(10, 0, 0, true)).toEqual({ line: 82, shift: 0 })
  })

  it('con algo en la esquina, en Chromium sube la caja y el cue queda en auto', () => {
    expect(cuePlacement(0, 20, 70, true)).toEqual({ line: undefined, shift: 30 })
  })

  it('con algo en la esquina, en Firefox el final del cue va en `line`', () => {
    expect(cuePlacement(0, 20, 70, false)).toEqual({ line: 70, shift: 0 })
  })

  it('"Posición" gana si deja el subtítulo más arriba', () => {
    expect(cuePlacement(30, 20, 70, true)).toEqual({ line: undefined, shift: 38 })
    expect(cuePlacement(30, 20, 70, false)).toEqual({ line: 62, shift: 0 })
    expect(cuePlacement(5, 20, 70, true)).toEqual({ line: undefined, shift: 30 })
  })

  it('nunca queda más abajo que lo que dejan libre los controles', () => {
    expect(cuePlacement(0, 30, 75, false)).toEqual({ line: 68, shift: 0 })
    expect(cuePlacement(0, 30, 75, true)).toEqual({ line: undefined, shift: 32 })
  })

  it('redondea para arriba (el final nunca baja) y no se pasa de la pantalla', () => {
    expect(cuePlacement(0, 0, 73.46, false)).toEqual({ line: 73.4, shift: 0 })
    expect(cuePlacement(0, 0, 73.46, true)).toEqual({ line: undefined, shift: 26.6 })
    expect(cuePlacement(95, 0, 50, false)).toEqual({ line: 0, shift: 0 })
  })
})

describe('placeCue', () => {
  const cue = () => ({ line: 'auto' as number | 'auto', snapToLines: true, lineAlign: 'start' }) as unknown as VTTCue

  it('pone `line` en % con lineAlign end, y vuelve a auto cuando no hace falta', () => {
    const c = cue()
    placeCue(c, 0, 20)
    expect([c.line, c.snapToLines, c.lineAlign]).toEqual([78, false, 'end'])
    placeCue(c, 0, 20, 70, true)
    expect([c.line, c.snapToLines, c.lineAlign]).toEqual(['auto', true, 'start'])
    placeCue(c, 0, 20, 70, false)
    expect([c.line, c.snapToLines, c.lineAlign]).toEqual([70, false, 'end'])
    placeCue(c, 0)
    expect([c.line, c.snapToLines, c.lineAlign]).toEqual(['auto', true, 'start'])
  })

  it('sin `line` (cues que no son VTT) no hace nada', () => {
    expect(() => placeCue({} as TextTrackCue, 0, 20, 70, true)).not.toThrow()
  })
})

describe('canShiftCueBox', () => {
  it('sin CSS.supports (node) es falso', () => {
    expect(canShiftCueBox()).toBe(false)
  })
})

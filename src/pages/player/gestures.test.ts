import { describe, expect, it } from 'vitest'
import { DOUBLE_TAP_MS, TAP_STREAK_MS, classifyTap, pinchFit, tapZone, type TapState } from './gestures'

const W = 1000
const tap = (x: number, at: number, y = 200) => ({ x, y, at, width: W })

describe('tapZone', () => {
  it('40 % de cada lado; el centro no adelanta', () => {
    expect(tapZone(100, W)).toBe('left')
    expect(tapZone(399, W)).toBe('left')
    expect(tapZone(500, W)).toBe('center')
    expect(tapZone(601, W)).toBe('right')
    expect(tapZone(10, 0)).toBe('center')
  })
})

describe('classifyTap', () => {
  it('un toque suelto es simple (muestra u oculta los controles)', () => {
    expect(classifyTap(undefined, tap(800, 0)).result).toEqual({ kind: 'single' })
  })

  it('doble toque a la derecha adelanta; a la izquierda atrasa', () => {
    const first = classifyTap(undefined, tap(800, 0))
    expect(classifyTap(first.state, tap(810, 200)).result).toEqual({ kind: 'seek', zone: 'right', count: 1 })
    const l = classifyTap(undefined, tap(100, 0))
    expect(classifyTap(l.state, tap(110, 250)).result).toEqual({ kind: 'seek', zone: 'left', count: 1 })
  })

  it('dos toques separados no son doble toque', () => {
    const first = classifyTap(undefined, tap(800, 0))
    expect(classifyTap(first.state, tap(800, DOUBLE_TAP_MS + 1)).result.kind).toBe('single')
  })

  it('dos toques lejos uno del otro tampoco', () => {
    const first = classifyTap(undefined, tap(650, 0))
    expect(classifyTap(first.state, tap(950, 100)).result.kind).toBe('single')
  })

  it('el doble toque en el centro no adelanta', () => {
    const first = classifyTap(undefined, tap(500, 0))
    expect(classifyTap(first.state, tap(505, 100)).result.kind).toBe('single')
  })

  it('más toques seguidos del mismo lado suman (+20 s, +30 s)', () => {
    let st: TapState | undefined
    let r = classifyTap(st, tap(800, 0))
    r = classifyTap(r.state, tap(800, 150))
    expect(r.result).toEqual({ kind: 'seek', zone: 'right', count: 1 })
    r = classifyTap(r.state, tap(800, 500))
    expect(r.result).toEqual({ kind: 'seek', zone: 'right', count: 2 })
    r = classifyTap(r.state, tap(800, 500 + TAP_STREAK_MS))
    expect(r.result).toEqual({ kind: 'seek', zone: 'right', count: 3 })
    // Pasado el tiempo de la racha, vuelve a ser un toque simple.
    st = r.state
    expect(classifyTap(st, tap(800, 500 + 2 * TAP_STREAK_MS + 1)).result.kind).toBe('single')
  })

  it('un toque del otro lado corta la racha', () => {
    let r = classifyTap(undefined, tap(800, 0))
    r = classifyTap(r.state, tap(800, 100))
    expect(classifyTap(r.state, tap(100, 300)).result.kind).toBe('single')
  })
})

describe('pinchFit', () => {
  it('abrir los dedos llena; cerrarlos ajusta; poco movimiento no cambia', () => {
    expect(pinchFit(100, 140, 'contain')).toBe('cover')
    expect(pinchFit(140, 100, 'cover')).toBe('contain')
    expect(pinchFit(100, 105, 'fill')).toBe('fill')
    expect(pinchFit(0, 100, 'contain')).toBe('contain')
  })
})

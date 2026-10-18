import { describe, expect, it } from 'vitest'
import { anchoredScrollLeft, backStep, ladderApplies, rowAnchorY } from './spatialNav'

describe('"Atrás" en escalera', () => {
  it('vale en Inicio, Películas, Series y Vos', () => {
    expect(ladderApplies('/')).toBe(true)
    expect(ladderApplies('/discover/movie')).toBe(true)
    expect(ladderApplies('/discover/series')).toBe(true)
    expect(ladderApplies('/me')).toBe(true)
    expect(ladderApplies('/detail/movie/tt1')).toBe(false)
    expect(ladderApplies('/settings')).toBe(false)
    expect(ladderApplies('/lists/x')).toBe(false)
  })

  it('desde una fila: primero arriba, después el riel y recién después lo de siempre', () => {
    // 1) En una fila, más abajo: sube al principio de la pantalla.
    expect(backStep({ inRail: false, atTop: false, railAvailable: true })).toBe('top')
    // 2) Ya arriba (en la portada): pasa al riel.
    expect(backStep({ inRail: false, atTop: true, railAvailable: true })).toBe('rail')
    // 3) En el riel: lo de siempre (volver; en Inicio, nada).
    expect(backStep({ inRail: true, atTop: true, railAvailable: true })).toBe('leave')
    expect(backStep({ inRail: true, atTop: false, railAvailable: true })).toBe('leave')
  })

  it('sin riel (celular): de arriba va directo a lo de siempre', () => {
    expect(backStep({ inRail: false, atTop: false, railAvailable: false })).toBe('top')
    expect(backStep({ inRail: false, atTop: true, railAvailable: false })).toBe('leave')
  })
})

describe('foco anclado en la TV', () => {
  it('la tarjeta enfocada queda pegada al margen izquierdo de la fila', () => {
    // Fila con 40 px de margen, ya corrida 300 px; la tarjeta está a 520 px del borde de la fila.
    expect(anchoredScrollLeft({ scrollLeft: 300, itemLeft: 620, scrollerLeft: 100, padding: 40, maxScroll: 5000 })).toBe(780)
    // Volviendo hacia la izquierda también se ancla (la fila se corre para atrás).
    expect(anchoredScrollLeft({ scrollLeft: 780, itemLeft: -60, scrollerLeft: 100, padding: 40, maxScroll: 5000 })).toBe(580)
  })

  it('no se pasa del principio ni del final de la fila', () => {
    expect(anchoredScrollLeft({ scrollLeft: 0, itemLeft: 140, scrollerLeft: 100, padding: 40, maxScroll: 900 })).toBe(0)
    expect(anchoredScrollLeft({ scrollLeft: 800, itemLeft: 900, scrollerLeft: 100, padding: 40, maxScroll: 900 })).toBe(900)
  })

  it('la fila enfocada queda debajo del fondo que sigue al foco, o a una altura fija', () => {
    expect(rowAnchorY(1080, 583.2)).toBe(583)
    expect(rowAnchorY(1000, undefined)).toBe(200)
    // Fondo oculto (alto 0, pantallas bajas): altura fija.
    expect(rowAnchorY(1000, 0)).toBe(200)
  })
})

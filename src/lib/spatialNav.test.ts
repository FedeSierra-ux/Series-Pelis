import { describe, expect, it } from 'vitest'
import { ROW_HEAD_GAP, anchoredScrollLeft, backStep, ladderApplies, navScore, rowAnchorY, rowRevealTop } from './spatialNav'

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

describe('navScore (a qué se mueve el foco)', () => {
  const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h })

  it('↓ desde una pestaña angosta va a la fila ancha de abajo, no a un botón alineado más lejos', () => {
    // Pestaña "Fuentes" (angosta, a la izquierda); debajo, la fuente recomendada a todo el ancho;
    // más abajo, "2 torrents sin debrid", angosto y alineado con la pestaña.
    const tab = box(40, 100, 120, 44)
    const wide = box(40, 170, 1900, 90)
    const narrow = box(40, 420, 220, 40)
    expect(navScore(tab, wide, 'down')!).toBeLessThan(navScore(tab, narrow, 'down')!)
  })

  it('lo del lado equivocado no cuenta', () => {
    expect(navScore(box(100, 100, 50, 50), box(100, 0, 50, 50), 'down')).toBeUndefined()
    expect(navScore(box(100, 100, 50, 50), box(0, 100, 50, 50), 'right')).toBeUndefined()
  })

  it('→ sin nada en la misma altura no salta a algo fuera de la pantalla', () => {
    const check = box(500, 600, 40, 40)
    const offscreen = box(900, -400, 80, 40) // "Más" de la portada, arriba de todo
    const view = { top: 0, bottom: 800 }
    expect(navScore(check, offscreen, 'right', view)).toBeUndefined()
    // A la vista sí, y en la misma altura aunque esté lejos también.
    expect(navScore(check, box(900, 300, 80, 40), 'right', view)).toBeDefined()
    expect(navScore(check, box(3000, 600, 80, 40), 'right', view)).toBeDefined()
  })

  it('en línea gana sobre desviado', () => {
    const from = box(0, 100, 100, 100)
    expect(navScore(from, box(150, 100, 100, 100), 'right')!).toBeLessThan(navScore(from, box(150, 260, 100, 100), 'right')!)
  })
})

describe('rowRevealTop (fila debajo de la portada fija en PC)', () => {
  const base = { scrollY: 1000, viewTop: 300, viewH: 900 }

  it('deja el título de la fila pegado debajo de la portada (no asoma la fila anterior)', () => {
    const top = rowRevealTop({ ...base, cardTop: 700, cardBottom: 1000, headTop: 650 })
    // El título queda a ROW_HEAD_GAP del borde de la portada (300).
    expect(1000 + 650 - top).toBe(300 + ROW_HEAD_GAP)
  })

  it('si la tarjeta no entra entera, gana la tarjeta', () => {
    const top = rowRevealTop({ ...base, viewH: 600, cardTop: 700, cardBottom: 1000, headTop: 650 })
    expect(1000 + 1000 - top).toBe(600)
  })

  it('nunca negativo', () => {
    expect(rowRevealTop({ scrollY: 0, viewTop: 300, viewH: 900, cardTop: 320, cardBottom: 600, headTop: 280 })).toBe(0)
  })
})

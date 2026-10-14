import { describe, expect, it } from 'vitest'
import { SCRUB_REPEAT_MS, SCRUB_TICK_MS, isHold, scrubDelta, scrubKey, scrubStep, startScrub } from './scrub'

describe('scrubStep: acelera mientras se mantiene', () => {
  it('10 s, después 30 s y después 1 min', () => {
    expect(scrubStep(0)).toBe(10)
    expect(scrubStep(1499)).toBe(10)
    expect(scrubStep(1500)).toBe(30)
    expect(scrubStep(3999)).toBe(30)
    expect(scrubStep(4000)).toBe(60)
    expect(scrubStep(60_000)).toBe(60)
  })
})

describe('isHold', () => {
  it('la repetición del teclado siempre es mantener', () => {
    expect(isHold(undefined, 'ArrowRight', 0, true)).toBe(true)
  })
  it('una flecha nueva después de soltar es un toque (en la PC)', () => {
    expect(isHold({ key: 'ArrowRight', at: 1000, up: true }, 'ArrowRight', 1100, false)).toBe(false)
  })
  it('sin keyup en el medio cuenta como mantener (TV que no marca la repetición)', () => {
    expect(isHold({ key: 'ArrowRight', at: 1000, up: false }, 'ArrowRight', 1100, false)).toBe(true)
  })
  it('en la TV, un toque enseguida del anterior también', () => {
    expect(isHold({ key: 'ArrowRight', at: 1000, up: true }, 'ArrowRight', 1000 + SCRUB_REPEAT_MS - 1, false, true)).toBe(true)
    expect(isHold({ key: 'ArrowRight', at: 1000, up: true }, 'ArrowRight', 1000 + SCRUB_REPEAT_MS + 1, false, true)).toBe(false)
  })
  it('la otra flecha no es la misma', () => {
    expect(isHold({ key: 'ArrowRight', at: 1000, up: false }, 'ArrowLeft', 1001, false)).toBe(false)
  })
})

describe('modo scrub', () => {
  const DUR = 3600

  it('mantener: un paso por tick, que acelera con el tiempo', () => {
    // Primer toque: de 100 a 110; después se mantiene.
    let s = startScrub(100, 110, 1, 0, true)
    s = scrubKey(s, 1, SCRUB_TICK_MS - 1, DUR, true)
    expect(s.target).toBe(110) // todavía no pasó un tick
    s = scrubKey(s, 1, SCRUB_TICK_MS, DUR, true)
    expect(s.target).toBe(120)
    s = scrubKey(s, 1, 2000, DUR, true)
    expect(s.target).toBe(150) // ya va de a 30
    s = scrubKey(s, 1, 5000, DUR, true)
    expect(s.target).toBe(210) // y de a 60
    expect(scrubDelta(s)).toBe(110)
  })

  it('soltar y tocar otra vez: +10 y vuelve a empezar despacio', () => {
    let s = startScrub(100, 110, 1, 0, false)
    s = scrubKey(s, 1, 5000, DUR, true)
    const before = s.target
    s = scrubKey(s, 1, 6000, DUR, false)
    expect(s.target).toBe(before + 10)
    s = scrubKey(s, 1, 6000 + SCRUB_TICK_MS, DUR, true)
    expect(s.target).toBe(before + 20)
  })

  it('TV que manda apretar/soltar rápido (cuenta como mantener): también acelera', () => {
    let s = startScrub(0, 10, 1, 0, true)
    // Un toque cada 120 ms durante 5 s: los pasos llegan cada tick y crecen.
    for (let t = 120; t <= 5000; t += 120) s = scrubKey(s, 1, t, DUR, true)
    expect(s.target).toBeGreaterThan(10 + 27 * 10)
  })

  it('cambiar de dirección arranca otra vez despacio', () => {
    let s = startScrub(500, 510, 1, 0, true)
    s = scrubKey(s, 1, 5000, DUR, true)
    const t = s.target
    s = scrubKey(s, -1, 5100, DUR, true)
    expect(s.target).toBe(t - 10)
    expect(s.dir).toBe(-1)
  })

  it('no se pasa del principio ni del final', () => {
    let s = startScrub(5, 0, -1, 0, true)
    s = scrubKey(s, -1, SCRUB_TICK_MS, DUR, true)
    expect(s.target).toBe(0)
    let e = startScrub(3590, 3600, 1, 0, true)
    e = scrubKey(e, 1, 5000, DUR, true)
    expect(e.target).toBe(DUR)
  })

  it('guarda el origen y si se estaba reproduciendo (para cancelar)', () => {
    const s = startScrub(42, 52, 1, 0, true)
    expect(s.origin).toBe(42)
    expect(s.wasPlaying).toBe(true)
  })
})

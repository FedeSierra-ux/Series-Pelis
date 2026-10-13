import { describe, expect, it } from 'vitest'
import { creditsPlan } from './credits'

describe('creditsPlan', () => {
  it('sin datos: 30 s antes del final', () => {
    expect(creditsPlan(null, 1200, true, 30)).toEqual({ afterCredits: false, credits: undefined, nextAt: 1170 })
  })

  it('créditos hasta el final: la tarjeta sale al empezar los créditos', () => {
    const plan = creditsPlan({ outro: { start: 1100, end: 1195 } }, 1200, true, 30)
    expect(plan.afterCredits).toBe(false)
    expect(plan.nextAt).toBe(1100)
  })

  it('escena después de los créditos: la tarjeta espera al final de los créditos', () => {
    const plan = creditsPlan({ outro: { start: 1000, end: 1100 } }, 1200, true, 30)
    expect(plan.afterCredits).toBe(true)
    expect(plan.nextAt).toBe(1100)
  })

  it('créditos sin final: llegan hasta el final del video', () => {
    const plan = creditsPlan({ outro: { start: 1100, end: Infinity } }, 1200, true, 30)
    expect(plan.credits).toEqual({ start: 1100, end: 1200 })
    expect(plan.afterCredits).toBe(false)
  })

  it('segmento post-créditos de IntroDB', () => {
    const plan = creditsPlan({ outro: { start: 1100, end: Infinity }, postCredits: { start: 1150, end: Infinity } }, 1200, true, 30)
    expect(plan.credits).toEqual({ start: 1100, end: 1150 })
    expect(plan.afterCredits).toBe(true)
    expect(plan.nextAt).toBe(1150)
  })

  it('sin siguiente episodio no hay tarjeta', () => {
    expect(creditsPlan({ outro: { start: 1000, end: 1100 } }, 1200, false, 30).nextAt).toBeUndefined()
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import { COMPACT_BAR_QUERY, liftsSubForCorner, PHONE_LANDSCAPE_QUERY, tip, TINY_BAR_QUERY } from './controlBar'

describe('barra del reproductor', () => {
  // Con `?raw` vitest devuelve vacío para los .css: se lee el archivo (con `node:fs`, como en focusMemory.test.ts).
  let css = ''
  beforeAll(async () => {
    const mod = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ mod)) as { readFileSync: (p: URL, enc: 'utf8') => string }
    css = readFileSync(new URL('./player-v14.css', import.meta.url), 'utf8')
  })

  it('las consultas de la barra compacta son las mismas que las del CSS', () => {
    expect(css).toContain(`@media ${COMPACT_BAR_QUERY} {`)
    expect(css).toContain(`@media ${TINY_BAR_QUERY} {`)
  })

  it('el temporizador pasa al ⚙ solo por debajo de 360 px (de 360 para arriba la barra no cambia)', () => {
    expect(Number(TINY_BAR_QUERY.match(/max-width:\s*(\d+)px/)?.[1])).toBe(359)
    expect(TINY_BAR_QUERY).toContain('(pointer: coarse)')
  })

  it('tip: la misma etiqueta para el lector de pantalla y para el globito', () => {
    expect(tip('Volver')).toEqual({ 'aria-label': 'Volver', 'data-tip': 'Volver' })
  })
})

describe('subtítulo arriba de la esquina', () => {
  // Con `?raw` vitest devuelve vacío para los .css: se lee el archivo (con `node:fs`, como en focusMemory.test.ts).
  let css = ''
  beforeAll(async () => {
    const mod = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ mod)) as { readFileSync: (p: URL, enc: 'utf8') => string }
    css = readFileSync(new URL('./player-v14.css', import.meta.url), 'utf8')
  })

  it('celular vertical: sí (como desde la v0.26.1), también en modo TV', () => {
    expect(liftsSubForCorner({ narrow: true, phoneLandscape: false, tv: false })).toBe(true)
    expect(liftsSubForCorner({ narrow: true, phoneLandscape: true, tv: false })).toBe(true)
    expect(liftsSubForCorner({ narrow: true, phoneLandscape: false, tv: true })).toBe(true)
  })

  it('celular apaisado: sí', () => {
    expect(liftsSubForCorner({ narrow: false, phoneLandscape: true, tv: false })).toBe(true)
  })

  it('PC y TV: no (quedan como estaban)', () => {
    expect(liftsSubForCorner({ narrow: false, phoneLandscape: false, tv: false })).toBe(false)
    expect(liftsSubForCorner({ narrow: false, phoneLandscape: false, tv: true })).toBe(false)
    // Una tele chica que dijera `pointer: coarse` con poco alto tampoco.
    expect(liftsSubForCorner({ narrow: false, phoneLandscape: true, tv: true })).toBe(false)
  })

  it('el corte de alto es el mismo que el del CSS del celular apaisado', () => {
    const px = PHONE_LANDSCAPE_QUERY.match(/max-height:\s*(\d+)px/)?.[1]
    expect(px).toBeDefined()
    expect(css).toContain(`@media (max-height: ${px}px) {`)
    expect(PHONE_LANDSCAPE_QUERY).toContain('(pointer: coarse)')
  })
})

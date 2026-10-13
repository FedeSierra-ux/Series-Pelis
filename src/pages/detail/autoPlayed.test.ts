import { describe, expect, it } from 'vitest'
import { createRecentSet } from './autoPlayed'

describe('createRecentSet', () => {
  it('recuerda lo agregado y olvida lo más viejo al pasar el tope', () => {
    const s = createRecentSet(3)
    s.add('a')
    s.add('b')
    s.add('c')
    expect(s.has('a')).toBe(true)
    s.add('d')
    expect(s.has('a')).toBe(false)
    expect(s.has('b')).toBe(true)
    expect(s.has('d')).toBe(true)
    expect(s.size).toBe(3)
  })

  it('volver a agregar una clave la vuelve reciente', () => {
    const s = createRecentSet(2)
    s.add('a')
    s.add('b')
    s.add('a')
    s.add('c')
    expect(s.has('b')).toBe(false)
    expect(s.has('a')).toBe(true)
  })
})

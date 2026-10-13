import { describe, expect, it } from 'vitest'
import { mergeCast } from './castPeople'

describe('mergeCast', () => {
  it('junta los papeles de un mismo actor en una sola tarjeta', () => {
    const out = mergeCast([
      { id: 1, name: 'Eddie Murphy', character: 'Sherman Klump', profile_path: '/e.jpg' },
      { id: 2, name: 'Jada Pinkett', character: 'Carla' },
      { id: 1, name: 'Eddie Murphy', character: 'Buddy Love' },
      { id: 1, name: 'Eddie Murphy', character: 'Buddy Love' },
    ])
    expect(out).toEqual([
      { id: 1, name: 'Eddie Murphy', character: 'Sherman Klump / Buddy Love', profile_path: '/e.jpg' },
      { id: 2, name: 'Jada Pinkett', character: 'Carla', profile_path: undefined },
    ])
  })

  it('en series usa todos los roles del reparto agregado', () => {
    const out = mergeCast([{ id: 7, name: 'Tatiana Maslany', roles: [{ character: 'Sarah' }, { character: 'Cosima' }, { character: '' }] }])
    expect(out[0].character).toBe('Sarah / Cosima')
  })

  it('respeta el tope después de juntar y no inventa personaje si no hay', () => {
    const out = mergeCast([{ id: 1, name: 'A', character: 'X' }, { id: 1, name: 'A', character: 'Y' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], 2)
    expect(out.map((p) => p.id)).toEqual([1, 2])
    expect(out[1].character).toBeUndefined()
  })
})

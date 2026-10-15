import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => undefined,
  update: async () => undefined,
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))

import type { AuthState } from './auth'
import { shouldForgetAddons } from './cloudSync'

const inside = (isAdmin: boolean): AuthState => ({ status: 'in', house: { id: 'h1', name: 'Casa', isAdmin }, device: { id: 'd1', label: 'TV', kind: 'tv' } })
const out: AuthState = { status: 'out', needsSetup: false }

describe('shouldForgetAddons (v0.17.1)', () => {
  it('un aparato que no es del admin pierde los addons al salir o si lo sacan', () => {
    expect(shouldForgetAddons(inside(false), out)).toBe(true)
  })

  it('el admin los conserva', () => {
    expect(shouldForgetAddons(inside(true), out)).toBe(false)
  })

  it('sin haber entrado antes (o mientras carga, o sin casas en el sitio) no se toca nada', () => {
    expect(shouldForgetAddons(undefined, out)).toBe(false)
    expect(shouldForgetAddons({ status: 'loading' }, out)).toBe(false)
    expect(shouldForgetAddons(inside(false), { status: 'loading' })).toBe(false)
    expect(shouldForgetAddons(inside(false), { status: 'disabled' })).toBe(false)
  })
})

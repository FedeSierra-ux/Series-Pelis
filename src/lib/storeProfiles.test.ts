import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cada perfil lee su historial, lista, etc. de su propia clave; lo de la casa y del aparato no cambia (v0.18).
const idbSeed = vi.hoisted(() => new Map<string, unknown>())
const profile = vi.hoisted(() => ({ id: 'ana123' }))
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => idbSeed.get(key),
  set: async () => undefined,
  update: async () => undefined,
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))
vi.mock('./profiles', () => ({
  activeProfileId: () => profile.id,
  setActiveProfileId: (id: string) => {
    profile.id = id
  },
}))

beforeEach(() => {
  idbSeed.clear()
  vi.resetModules()
  profile.id = 'ana123'
})

const entry = (name: string) => ({ id: 'tt1', type: 'movie', name, addedAt: 1 })

describe('stores por perfil', () => {
  it('un perfil lee sus claves `p:<id>:…` y comparte los ajustes', async () => {
    idbSeed.set('profiles', { ana123: { name: 'Ana', color: '#c4b0ff', at: 1 } })
    idbSeed.set('watchlist', { tt1: entry('del principal') })
    idbSeed.set('p:ana123:watchlist', { tt1: entry('de Ana') })
    idbSeed.set('settings', { autoplayNext: false })
    const store = await import('./store')
    await store.hydrateStores()
    expect(store.watchlistStore.get().tt1.name).toBe('de Ana')
    expect(store.settingsStore.get().autoplayNext).toBe(false)
  })

  it('si el perfil ya no existe, vuelve al principal', async () => {
    idbSeed.set('watchlist', { tt1: entry('del principal') })
    idbSeed.set('p:ana123:watchlist', { tt1: entry('de Ana') })
    const store = await import('./store')
    await store.hydrateStores()
    expect(profile.id).toBe('main')
    expect(store.watchlistStore.get().tt1.name).toBe('del principal')
  })
})

import { describe, expect, it, vi } from 'vitest'

// IndexedDB falso que puede quedarse "sin cuota". La caché de respuestas (clear) libera lugar.
const state = vi.hoisted(() => ({ full: false, freeOnClear: true, clears: 0 }))
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => undefined,
  update: async () => {
    if (state.full) throw new DOMException('Quota exceeded', 'QuotaExceededError')
  },
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => {
    state.clears++
    if (state.freeOnClear) state.full = false
  },
}))

const { progressStore, storageIssueStore } = await import('./store')

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('cuota llena (auditoría #5)', () => {
  it('borra la caché de catálogos y fichas y vuelve a guardar el progreso', async () => {
    state.full = true
    state.freeOnClear = true
    state.clears = 0
    progressStore.set({})
    progressStore.set({ tt1: { videoId: 'tt1', metaId: 'tt1', type: 'movie', name: 'x', position: 1, duration: 2, watched: false, updatedAt: 1, firstWatchedAt: 1 } })
    await settle()
    expect(state.clears).toBeGreaterThan(0)
    expect(storageIssueStore.get()).toBeUndefined()
  })

  it('si igual no entra, avisa en pantalla en vez de fallar callado', async () => {
    state.full = true
    state.freeOnClear = false
    progressStore.set({})
    await settle()
    expect(storageIssueStore.get()).toMatch(/sin espacio/)
    storageIssueStore.dismiss()
    expect(storageIssueStore.get()).toBeUndefined()
  })
})

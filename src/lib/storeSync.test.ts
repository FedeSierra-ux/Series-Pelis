import { describe, expect, it, vi } from 'vitest'
import { applyPatch, diffPatch, newestUpdate } from './storeSync'

// IndexedDB compartido por las "pestañas" (cada una es otra copia del módulo store.ts). `get` devuelve una
// copia, como IndexedDB; `update` lee y escribe en un solo paso, como la transacción de idb-keyval.
const db = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (k: string) => (db.has(k) ? structuredClone(db.get(k)) : undefined),
  set: async (k: string, v: unknown) => void db.set(k, structuredClone(v)),
  update: async (k: string, fn: (v: unknown) => unknown) => void db.set(k, structuredClone(fn(db.has(k) ? structuredClone(db.get(k)) : undefined))),
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))

type Store = typeof import('./store')

/** Una pestaña nueva: el módulo store.ts cargado de cero (con su propio BroadcastChannel). */
async function openTab(): Promise<Store> {
  vi.resetModules()
  const tab = await import('./store')
  await tab.hydrateStores()
  return tab
}

/** Deja correr los avisos entre pestañas y las relecturas. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5))
}

const movie = (id: string) => ({ videoId: id, metaId: id, type: 'movie', name: id, position: 600, duration: 6000 })

describe('diffPatch / applyPatch', () => {
  it('guarda solo lo que cambió y lo mezcla con lo que hay', () => {
    const prev = { a: { n: 1 }, b: { n: 2 }, c: { n: 3 } }
    const next = { ...prev, b: { n: 20 }, d: { n: 4 } } as Record<string, { n: number }>
    delete next.c
    const patch = diffPatch(prev, next, 1)
    // Otra pestaña agregó "e" y cambió "a" mientras tanto: se conservan.
    const stored = { a: { n: 100 }, b: { n: 2 }, c: { n: 3 }, e: { n: 5 } }
    expect(applyPatch(stored, patch, next)).toEqual({ a: { n: 100 }, b: { n: 20 }, d: { n: 4 }, e: { n: 5 } })
  })

  it('con depth 2 mezcla también un nivel adentro (las entradas del diario)', () => {
    const prev = { v: 1, entries: { x: 1 } }
    const next = { v: 1, entries: { x: 1, y: 2 } }
    const stored = { v: 1, entries: { x: 1, z: 3 } }
    expect(applyPatch(stored, diffPatch(prev, next, 2), next)).toEqual({ v: 1, entries: { x: 1, y: 2, z: 3 } })
  })

  it('las listas se reemplazan enteras y lo guardado roto se pisa con el valor de esta pestaña', () => {
    expect(applyPatch(['a'], diffPatch(['a'], ['a', 'b'], 1), ['a', 'b'])).toEqual(['a', 'b'])
    expect(applyPatch('roto', diffPatch({ a: 1 }, { a: 2 }, 1), { a: 2, b: 3 })).toEqual({ a: 2, b: 3 })
  })

  it('newestUpdate: en el progreso gana la entrada guardada más nueva', () => {
    const ours = { updatedAt: 10 }
    const theirs = { updatedAt: 20 }
    expect(newestUpdate('v', ours, theirs)).toBe(theirs)
    expect(newestUpdate('v', theirs, ours)).toBe(theirs)
    expect(newestUpdate('v', ours, { updatedAt: 10 })).toBe(ours)
  })
})

describe('dos pestañas abiertas (auditoría #2)', () => {
  it('lo que guarda una no borra lo de la otra, y las dos terminan viendo todo', async () => {
    db.clear()
    const a = await openTab()
    const b = await openTab()
    // A reproduce y guarda progreso; B (abierta antes, sin enterarse) marca otra peli como vista.
    a.saveProgress(movie('tt1'))
    b.setWatched({ videoId: 'tt2', metaId: 'tt2', type: 'movie', name: 'tt2' }, true)
    a.saveProgress({ ...movie('tt1'), position: 900 })
    await settle()
    const stored = db.get('progress') as Record<string, { position: number; watched: boolean }>
    expect(stored.tt1.position).toBe(900)
    expect(stored.tt2.watched).toBe(true)
    expect(Object.keys(a.progressStore.get()).sort()).toEqual(['tt1', 'tt2'])
    expect(Object.keys(b.progressStore.get()).sort()).toEqual(['tt1', 'tt2'])
    expect(b.progressStore.get().tt1.position).toBe(900)
    // El diario de B (tt2 marcado a mano) no lo pisa A.
    expect(Object.values(a.diaryStore.get().entries).map((d) => d.videoId)).toContain('tt2')
  })

  it('el mismo video tocado en las dos: queda el guardado más nuevo', async () => {
    db.clear()
    const a = await openTab()
    const b = await openTab()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000)
    a.saveProgress({ ...movie('tt9'), position: 3000 })
    vi.spyOn(Date, 'now').mockReturnValue(now)
    // B tiene una versión más vieja en memoria (se guardó antes) y la vuelve a escribir.
    b.progressStore.set((all) => ({ ...all, tt9: { ...movie('tt9'), position: 100, watched: false, updatedAt: now - 5000, firstWatchedAt: now - 5000 } }))
    vi.restoreAllMocks()
    await settle()
    expect((db.get('progress') as Record<string, { position: number }>).tt9.position).toBe(3000)
    expect(b.progressStore.get().tt9.position).toBe(3000)
  })

  it('los ajustes que cambia otra pestaña llegan solos', async () => {
    db.clear()
    const a = await openTab()
    const b = await openTab()
    a.settingsStore.set((s) => ({ ...s, autoplayNext: false }))
    b.settingsStore.set((s) => ({ ...s, spoilerFree: true }))
    await settle()
    expect(a.settingsStore.get()).toMatchObject({ autoplayNext: false, spoilerFree: true })
    expect(b.settingsStore.get()).toMatchObject({ autoplayNext: false, spoilerFree: true })
  })
})

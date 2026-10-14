import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sin IndexedDB en Node: el store guarda en memoria y las escrituras se cuentan.
const writes: string[] = []
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  // Los stores guardan con `update` (lee y mezcla con lo de otras pestañas en la misma transacción).
  update: async (key: string) => {
    writes.push(key)
  },
}))

const { diaryStore, progressStore, setWatched, setWatchedMany } = await import('./store')

const ep = (s: number, e: number) => ({
  videoId: `tt1:${s}:${e}`,
  metaId: 'tt1',
  type: 'series',
  name: 'Serie',
  poster: undefined,
  season: s,
  episode: e,
  episodeTitle: `Cap ${e}`,
})

describe('setWatchedMany', () => {
  beforeEach(() => {
    progressStore.set({})
    diaryStore.set({ v: 1, entries: {} })
    writes.length = 0
  })

  it('marca varios episodios con una sola escritura del progreso y una del diario', () => {
    setWatchedMany([ep(1, 1), ep(1, 2), ep(1, 3)], true)
    const all = progressStore.get()
    expect(Object.keys(all).sort()).toEqual(['tt1:1:1', 'tt1:1:2', 'tt1:1:3'])
    expect(Object.values(all).every((e) => e.watched && e.position === 0 && e.duration === 0)).toBe(true)
    expect(Object.values(diaryStore.get().entries).map((d) => d.videoId).sort()).toEqual(['tt1:1:1', 'tt1:1:2', 'tt1:1:3'])
    expect(Object.values(diaryStore.get().entries).every((d) => d.source === 'manual')).toBe(true)
    expect(writes.filter((k) => k === 'progress')).toHaveLength(1)
    expect(writes.filter((k) => k === 'diary')).toHaveLength(1)
  })

  it('conserva la posición, la duración y la fecha de la primera vez de los que ya tenían progreso', () => {
    progressStore.set({
      'tt1:1:2': { ...ep(1, 2), position: 600, duration: 2400, watched: false, updatedAt: 1000, firstWatchedAt: 500 },
    })
    setWatchedMany([ep(1, 1), ep(1, 2)], true)
    const e2 = progressStore.get()['tt1:1:2']
    expect(e2.watched).toBe(true)
    expect(e2.position).toBe(600)
    expect(e2.duration).toBe(2400)
    expect(e2.firstWatchedAt).toBe(500)
    expect(e2.updatedAt).toBeGreaterThan(1000)
    const diary = Object.values(diaryStore.get().entries).find((d) => d.videoId === 'tt1:1:2')
    expect(diary?.duration).toBe(2400)
  })

  it('no toca los que ya estaban vistos ni los anota otra vez en el diario', () => {
    setWatched(ep(1, 1), true)
    const before = progressStore.get()['tt1:1:1']
    writes.length = 0
    setWatchedMany([ep(1, 1), ep(1, 2)], true)
    expect(progressStore.get()['tt1:1:1']).toBe(before)
    expect(Object.values(diaryStore.get().entries).filter((d) => d.videoId === 'tt1:1:1')).toHaveLength(1)
    expect(Object.keys(progressStore.get())).toHaveLength(2)
  })

  it('al desmarcar borra el progreso y la última entrada del diario de cada uno', () => {
    setWatchedMany([ep(1, 1), ep(1, 2)], true)
    setWatchedMany([ep(1, 1), ep(1, 2), ep(1, 3)], false)
    expect(progressStore.get()).toEqual({})
    expect(diaryStore.get().entries).toEqual({})
  })

  it('sin cambios deja el progreso como estaba y no toca el diario', () => {
    const empty = progressStore.get()
    setWatchedMany([ep(1, 1)], false)
    expect(progressStore.get()).toBe(empty)
    setWatched(ep(1, 1), true)
    const after = progressStore.get()
    writes.length = 0
    setWatchedMany([ep(1, 1)], true)
    expect(progressStore.get()).toBe(after)
    expect(writes.filter((k) => k === 'diary')).toHaveLength(0)
  })
})

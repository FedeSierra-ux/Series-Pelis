import { describe, expect, it } from 'vitest'
import { MAX_ENTRIES, STORAGE_KEY, recallSnapshot, rememberSnapshot, selectorFor, type SnapshotStore } from './focusMemory'

function fakeStore(): SnapshotStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('rememberSnapshot / recallSnapshot', () => {
  it('guarda y recupera el foco y el scroll de una pantalla', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'abc', { focus: 'a[href="/detail/movie/tt1"]', scrollY: 320.6 })
    expect(recallSnapshot(store, 'abc')).toEqual({ focus: 'a[href="/detail/movie/tt1"]', scrollY: 321 })
  })

  it('sin foco guarda solo el scroll', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { scrollY: 10 })
    expect(recallSnapshot(store, 'k')).toEqual({ scrollY: 10 })
  })

  it('devuelve nada para una pantalla desconocida o un storage roto', () => {
    const store = fakeStore()
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
    store.data.set(STORAGE_KEY, '{no es json')
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
    store.data.set(STORAGE_KEY, '[1,2]')
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
  })

  it('volver a guardar la misma clave la reemplaza', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { focus: 'a', scrollY: 1 })
    rememberSnapshot(store, 'k', { scrollY: 2 })
    expect(recallSnapshot(store, 'k')).toEqual({ scrollY: 2 })
  })

  it('con más de 30 pantallas descarta las más antiguas', () => {
    const store = fakeStore()
    for (let i = 0; i < MAX_ENTRIES + 5; i++) rememberSnapshot(store, `k${i}`, { scrollY: i })
    const entries = JSON.parse(store.data.get(STORAGE_KEY)!)
    expect(Object.keys(entries)).toHaveLength(MAX_ENTRIES)
    expect(recallSnapshot(store, 'k0')).toBeUndefined()
    expect(recallSnapshot(store, 'k4')).toBeUndefined()
    expect(recallSnapshot(store, 'k5')).toEqual({ scrollY: 5 })
    expect(recallSnapshot(store, `k${MAX_ENTRIES + 4}`)).toEqual({ scrollY: MAX_ENTRIES + 4 })
  })

  it('tocar una clave vieja la vuelve reciente y no se descarta', () => {
    const store = fakeStore()
    for (let i = 0; i < MAX_ENTRIES; i++) rememberSnapshot(store, `k${i}`, { scrollY: i })
    rememberSnapshot(store, 'k0', { scrollY: 99 })
    rememberSnapshot(store, 'nueva', { scrollY: 0 })
    expect(recallSnapshot(store, 'k0')).toEqual({ scrollY: 99 })
    expect(recallSnapshot(store, 'k1')).toBeUndefined()
  })

  it('no explota si el storage falla al escribir', () => {
    const store: SnapshotStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
    }
    expect(() => rememberSnapshot(store, 'k', { scrollY: 0 })).not.toThrow()
  })
})

describe('selectorFor', () => {
  it('prefiere data-focus-id, después href, id y data-id', () => {
    expect(selectorFor({ focusId: 'tt1:1:2', href: '/x' })).toBe('[data-focus-id="tt1:1:2"]')
    expect(selectorFor({ href: '/detail/movie/tt0133093', id: 'x' })).toBe('a[href="/detail/movie/tt0133093"]')
    expect(selectorFor({ id: 'play' })).toBe('[id="play"]')
    expect(selectorFor({ dataId: 'ep-3' })).toBe('[data-id="ep-3"]')
    expect(selectorFor({})).toBeUndefined()
  })

  it('escapa comillas en el valor', () => {
    expect(selectorFor({ href: '/a"b' })).toBe('a[href="/a\\"b"]')
  })
})

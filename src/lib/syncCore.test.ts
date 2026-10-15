import { describe, expect, it } from 'vitest'
import { applyItems, capture, emptyState, enforceReadOnly, fieldsAdapter, markSent, outgoing, pendingCount, recordAdapter, type ServerItem, type SyncAdapter } from './syncCore'

function memStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (fn: (prev: T) => T) => {
      value = fn(value)
      listeners.forEach((l) => l())
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

interface Prog {
  pos: number
  updatedAt: number
}

const all = () => true

function setup() {
  const progress = memStore<Record<string, Prog>>({})
  const settings = memStore({ autoplay: true, langs: ['es'], style: { size: 1, color: 'w' }, local: 'x' })
  const addons = memStore<Record<string, { url: string }>>({})
  const adapters = [
    recordAdapter('profile', 'progress', progress, 'updatedAt'),
    fieldsAdapter('house', 'settings', settings, ['autoplay', 'langs', 'style'] as const),
    recordAdapter('global', 'addons', addons, 'at'),
  ] as SyncAdapter[]
  return { progress, settings, addons, adapters, state: emptyState('h1') }
}

const item = (t: string, k: string, v: unknown, u: number, s: ServerItem['s'] = 'profile'): ServerItem => ({ s, t, k, v: v === null ? null : JSON.stringify(v), u, ...(v === null ? { d: 1 as const } : {}) })

describe('capture', () => {
  it('antes de la primera sincronización usa la hora propia de cada fila (o 0)', () => {
    const { progress, settings, adapters, state } = setup()
    progress.set(() => ({ tt1: { pos: 10, updatedAt: 500 } }))
    expect(capture(state, adapters, 9999, all)).toBe(4) // tt1 + 3 campos de ajustes
    expect(state.pending.progress.tt1.u).toBe(500)
    expect(state.pending.settings.autoplay.u).toBe(0)
    // El campo que no se sincroniza no se anota.
    settings.set((s) => ({ ...s, local: 'y' }))
    expect(capture(state, adapters, 9999, all)).toBe(0)
  })

  it('después de sincronizar usa la hora del cambio y anota los borrados', () => {
    const { progress, adapters, state } = setup()
    state.synced = true
    progress.set(() => ({ tt1: { pos: 10, updatedAt: 500 } }))
    capture(state, adapters, 1000, all)
    expect(state.pending.progress.tt1.u).toBe(1000)
    progress.set(() => ({}))
    expect(capture(state, adapters, 2000, all)).toBe(1)
    expect(state.pending.progress.tt1).toEqual({ v: null, u: 2000 })
  })

  it('no anota lo que este aparato no puede cambiar', () => {
    const { addons, adapters, state } = setup()
    addons.set(() => ({ a: { url: 'x' } }))
    capture(state, adapters, 1, (s) => s !== 'global')
    expect(state.pending.addons).toBeUndefined()
  })
})

describe('applyItems', () => {
  it('aplica lo del servidor y no lo vuelve a subir', () => {
    const { progress, adapters, state } = setup()
    expect(applyItems(state, adapters, [item('progress', 'tt1', { pos: 5, updatedAt: 1 }, 100)])).toBe(1)
    expect(progress.get().tt1.pos).toBe(5)
    state.synced = true
    expect(capture(state, adapters, 200, all)).toBe(3) // solo los ajustes que nunca se contaron
    expect(state.pending.progress).toEqual({})
  })

  it('lo pendiente más nuevo gana; en un empate gana el servidor', () => {
    const { progress, adapters, state } = setup()
    state.synced = true
    progress.set(() => ({ a: { pos: 1, updatedAt: 0 }, b: { pos: 1, updatedAt: 0 } }))
    capture(state, adapters, 1000, all)
    applyItems(state, adapters, [item('progress', 'a', { pos: 9, updatedAt: 0 }, 999), item('progress', 'b', { pos: 9, updatedAt: 0 }, 1000)])
    expect(progress.get().a.pos).toBe(1)
    expect(state.pending.progress.a).toBeDefined()
    expect(progress.get().b.pos).toBe(9)
    expect(state.pending.progress.b).toBeUndefined()
  })

  it('borra con d: 1 e ignora alcances o tiendas desconocidas', () => {
    const { progress, adapters, state } = setup()
    applyItems(state, adapters, [item('progress', 'a', { pos: 1, updatedAt: 1 }, 1)])
    applyItems(state, adapters, [item('progress', 'a', null, 2), item('progress', 'z', { pos: 1, updatedAt: 1 }, 2, 'house'), item('otra', 'k', 1, 2)])
    expect(progress.get()).toEqual({})
    expect(state.shadow.progress).toEqual({})
  })

  it('ignora valores con otro tipo y completa los objetos de ajustes', () => {
    const { settings, adapters, state } = setup()
    applyItems(state, adapters, [item('settings', 'autoplay', 'sí', 1, 'house'), item('settings', 'style', { size: 2 }, 1, 'house')])
    expect(settings.get().autoplay).toBe(true)
    expect(settings.get().style).toEqual({ size: 2, color: 'w' })
    // La sombra queda con lo normalizado: no se sube de vuelta.
    expect(state.shadow.settings.style).toBe(JSON.stringify({ size: 2, color: 'w' }))
  })
})

describe('enforceReadOnly', () => {
  it('vuelve a lo del servidor lo que este aparato no puede cambiar', () => {
    const { addons, adapters, state } = setup()
    const ro = (s: string) => s !== 'global'
    applyItems(state, adapters, [item('addons', 'a', { url: 'srv' }, 1, 'global')])
    addons.set((a) => ({ ...a, a: { url: 'local' } }))
    expect(enforceReadOnly(state, adapters, ro)).toBe(1)
    expect(addons.get().a.url).toBe('srv')
    // Para quien puede cambiarlo no toca nada.
    addons.set((a) => ({ ...a, a: { url: 'local' } }))
    expect(enforceReadOnly(state, adapters, all)).toBe(0)
  })
})

describe('outgoing / markSent', () => {
  it('arma tandas por cantidad y solo saca lo que no volvió a cambiar', () => {
    const { progress, adapters, state } = setup()
    state.synced = true
    progress.set(() => Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`t${i}`, { pos: i, updatedAt: 0 }])))
    capture(state, adapters, 1, all)
    const batches = outgoing(state, adapters, 3)
    expect(batches.map((b) => b.length)).toEqual([3, 3, 2]) // 5 de progreso + 3 de ajustes
    expect(batches[0][0]).toMatchObject({ s: 'profile', t: 'progress', k: 't0', u: 1 })
    // t0 cambia mientras se sube: queda pendiente.
    progress.set((p) => ({ ...p, t0: { pos: 99, updatedAt: 0 } }))
    capture(state, adapters, 2, all)
    batches.forEach((b) => markSent(state, b))
    expect(pendingCount(state)).toBe(1)
    expect(state.pending.progress.t0.u).toBe(2)
  })

  it('los borrados van con d: 1', () => {
    const { progress, adapters, state } = setup()
    state.synced = true
    progress.set(() => ({ a: { pos: 1, updatedAt: 0 } }))
    capture(state, adapters, 1, all)
    progress.set(() => ({}))
    capture(state, adapters, 2, all)
    const sent = outgoing(state, adapters).flat().find((o) => o.k === 'a')
    expect(sent).toMatchObject({ v: null, d: 1, u: 2 })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// IndexedDB falso en memoria (lo que guarda la caché de respuestas).
const db = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  update: async (k: string, fn: (v: unknown) => unknown) => void db.set(k, fn(db.get(k))),
  del: async (k: string) => void db.delete(k),
  delMany: async (ks: string[]) => ks.forEach((k) => db.delete(k)),
  keys: async () => [...db.keys()],
  clear: async () => db.clear(),
}))

import {
  IDB_MAX_AGE_MS,
  IDB_MAX_CHARS,
  IDB_MAX_ENTRIES,
  MEMORY_MAX_ENTRIES,
  cached,
  clearCache,
  evictionPlan,
  fetchJson,
  load,
  memoryStats,
  peekMemory,
} from './cache'

beforeEach(async () => {
  await clearCache()
  db.clear()
})
afterEach(() => vi.unstubAllGlobals())

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('caché en memoria con tope (auditoría #5)', () => {
  it('no pasa de MEMORY_MAX_ENTRIES y desaloja la que hace más que no se usa', async () => {
    for (let i = 0; i < MEMORY_MAX_ENTRIES; i++) await load(`k${i}`, async () => i, false)
    // Usar k0 lo pone al final de la cola: el próximo desalojado es k1.
    expect(peekMemory('k0')?.data).toBe(0)
    await load('nuevo', async () => 'x', false)
    expect(memoryStats().entries).toBe(MEMORY_MAX_ENTRIES)
    expect(peekMemory('k0')).toBeDefined()
    expect(peekMemory('k1')).toBeUndefined()
    expect(peekMemory('nuevo')?.data).toBe('x')
  })

  it('cuenta el peso aproximado y lo descuenta al reemplazar', async () => {
    await load('a', async () => 'x'.repeat(1000), false)
    const once = memoryStats().chars
    await load('a', async () => 'x'.repeat(1000), false)
    expect(memoryStats().chars).toBe(once)
  })
})

describe('evictionPlan: qué se borra de IndexedDB', () => {
  const now = 1_000_000_000_000
  it('las vencidas (más de 30 días) siempre; las demás solo si se pasa del tope, empezando por las más viejas', () => {
    const idx = new Map([
      ['vieja', { at: now - IDB_MAX_AGE_MS - 1, size: 10 }],
      ['b', { at: now - 1000, size: 10 }],
      ['c', { at: now, size: 10 }],
    ])
    expect(evictionPlan(idx, now)).toEqual(['vieja'])
  })

  it('por cantidad y por peso', () => {
    const many = new Map(Array.from({ length: IDB_MAX_ENTRIES + 3 }, (_, i) => [`k${i}`, { at: 1_000 + i, size: 1 }] as const))
    expect(evictionPlan(many, 2_000)).toEqual(['k0', 'k1', 'k2'])
    const heavy = new Map([
      ['grande', { at: 1, size: IDB_MAX_CHARS }],
      ['chica', { at: 2, size: 10 }],
    ])
    expect(evictionPlan(heavy, 3)).toEqual(['grande'])
  })

  it('con factor 0,5 (cuota llena) deja lugar de sobra', () => {
    const idx = new Map(Array.from({ length: 10 }, (_, i) => [`k${i}`, { at: i, size: IDB_MAX_CHARS / 10 }] as const))
    expect(evictionPlan(idx, 10, 0.5)).toHaveLength(5)
  })
})

describe('IndexedDB con índice', () => {
  it('guarda la fecha y el peso de cada respuesta para poder desalojar', async () => {
    await load('meta:series:tt1', async () => ({ id: 'tt1', videos: [] }))
    await tick()
    expect((db.get('meta:series:tt1') as { size: number }).size).toBeGreaterThan(0)
    vi.useFakeTimers()
    await load('meta:series:tt2', async () => ({ id: 'tt2' }))
    for (let i = 0; i < 5; i++) await Promise.resolve()
    vi.advanceTimersByTime(5000)
    vi.useRealTimers()
    await tick()
    const index = db.get('__index__') as Record<string, { at: number; size: number }>
    expect(Object.keys(index)).toEqual(expect.arrayContaining(['meta:series:tt1', 'meta:series:tt2']))
  })
})

describe('cancelar pedidos (auditoría #15)', () => {
  it('se corta el fetch cuando el único interesado se va', async () => {
    let seen: AbortSignal | undefined
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      seen = init.signal!
      return new Promise((_, reject) => seen!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    })
    const ctrl = new AbortController()
    const p = cached('stream:x', (signal) => fetchJson('https://addon.example/stream/x.json', 20000, signal), 1000, false, ctrl.signal)
    await tick()
    expect(seen?.aborted).toBe(false)
    ctrl.abort()
    await expect(p).rejects.toThrow()
    expect(seen?.aborted).toBe(true)
  })

  it('si otro lo sigue esperando, no se corta', async () => {
    let seen: AbortSignal | undefined
    let finish: (v: Response) => void = () => {}
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      seen = init.signal!
      return new Promise<Response>((resolve) => (finish = resolve))
    })
    const a = new AbortController()
    const b = new AbortController()
    const pa = load('stream:y', (signal) => fetchJson('https://addon.example/stream/y.json', 20000, signal), false, a.signal)
    const pb = load('stream:y', (signal) => fetchJson('https://addon.example/stream/y.json', 20000, signal), false, b.signal)
    a.abort()
    await expect(pa).rejects.toThrow()
    expect(seen?.aborted).toBe(false)
    finish(new Response('{"streams":[]}', { status: 200 }))
    await expect(pb).resolves.toEqual({ streams: [] })
  })

  it('un pedido sin señal (precarga) nunca se corta aunque otro se vaya', async () => {
    let seen: AbortSignal | undefined
    let finish: (v: Response) => void = () => {}
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      seen = init.signal!
      return new Promise<Response>((resolve) => (finish = resolve))
    })
    const pre = load('stream:z', (signal) => fetchJson('https://addon.example/z.json', 20000, signal), false)
    const ctrl = new AbortController()
    const p = load('stream:z', (signal) => fetchJson('https://addon.example/z.json', 20000, signal), false, ctrl.signal)
    ctrl.abort()
    await expect(p).rejects.toThrow()
    expect(seen?.aborted).toBe(false)
    finish(new Response('1', { status: 200 }))
    await expect(pre).resolves.toBe(1)
  })
})

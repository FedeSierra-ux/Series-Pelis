import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddonFormatError, META_NOT_FOUND, PREFETCH_DELAY_MS, addonName, cleanManifest, getCatalog, getMeta, getStreams, listField, prefetchMeta } from './addons'
import { errorText } from './errors'
import type { AddonStreams, InstalledAddon } from './types'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const addon = (base: string, resources: InstalledAddon['manifest']['resources'] = ['stream']): InstalledAddon => ({
  transportUrl: `${base}/manifest.json`,
  manifest: { id: base, version: '1', name: base, resources, types: ['movie', 'series'], catalogs: [{ type: 'movie', id: 'top' }] },
})

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('validación de respuestas de addons (auditoría #14)', () => {
  it('listField: si falta, vacía; si no es una lista, error del addon; descarta lo que no son objetos', () => {
    expect(listField({}, 'streams', (x) => x)).toEqual([])
    expect(() => listField({ streams: { error: 'rate limited' } }, 'streams', (x) => x)).toThrow(AddonFormatError)
    expect(() => listField('hola', 'streams', (x) => x)).toThrow(AddonFormatError)
    expect(listField({ streams: [1, null, 'x', { url: 'a' }] }, 'streams', (x) => x)).toEqual([{ url: 'a' }])
  })

  it('un manifest sin nombre usa el id; sin id o sin resources no sirve', () => {
    const m = cleanManifest({ id: 'org.x', resources: ['stream', 5, { name: 'meta' }], types: 'movie', catalogs: [{ id: 'a' }, { id: 'b', type: 'movie', name: 3 }] })
    expect(m.name).toBe('org.x')
    expect(m.version).toBe('0')
    expect(m.resources).toEqual(['stream', { name: 'meta' }])
    expect(m.types).toEqual([])
    expect(m.catalogs).toEqual([{ id: 'b', type: 'movie' }])
    expect(() => cleanManifest({ name: 'x', resources: [] })).toThrow(/manifest/)
    expect(() => cleanManifest({ id: 'x' })).toThrow(/manifest/)
    expect(addonName(undefined)).toBe('Addon')
    expect(addonName({ id: 'org.y', name: '  ' })).toBe('org.y')
  })

  it('streams malformados son un error de ese addon, no tumban a los demás', async () => {
    const good = addon('https://bueno.example')
    const bad = addon('https://roto.example')
    vi.stubGlobal('fetch', async (url: string) =>
      url.startsWith('https://roto.example')
        ? json({ streams: { error: 'rate limited' } })
        : json({ streams: [{ url: 'https://v/1.mp4', name: 7, title: 'Peli 1080p' }, { name: 'sin nada para reproducir' }, 'basura'] }),
    )
    const groups = await new Promise<AddonStreams[]>((resolve) => {
      getStreams([good, bad], 'movie', 'tt1', (g) => g.every((x) => !x.loading) && resolve(g))
    })
    expect(groups[0].streams).toEqual([{ url: 'https://v/1.mp4', title: 'Peli 1080p' }])
    expect(groups[1].streams).toEqual([])
    expect(groups[1].error).toBe(errorText(new AddonFormatError('streams')))
  })

  it('catálogo y ficha: se limpian los elementos rotos', async () => {
    const cat = addon('https://cat.example', ['catalog', 'meta'])
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/catalog/')
        ? json({ metas: [{ id: 'tt1', type: 'movie', name: 'A', genres: 'drama' }, { name: 'sin id' }] })
        : json({ meta: { id: 'tt2', type: 'series', name: 'B', videos: { roto: true }, cast: ['x', 1] } }),
    )
    expect(await getCatalog(cat, cat.manifest.catalogs[0], { skip: '999' })).toEqual([{ id: 'tt1', type: 'movie', name: 'A', genres: undefined }])
    const meta = await getMeta([cat], 'series', 'tt2-validacion')
    expect(meta.videos).toEqual([])
    expect(meta.cast).toEqual(['x'])
  })
})

describe('cancelar los pedidos de streams (auditoría #15)', () => {
  it('cancel() corta los fetch en vuelo', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      signals.push(init.signal!)
      return new Promise(() => {})
    })
    const cancel = getStreams([addon('https://a.example'), addon('https://b.example')], 'movie', 'tt-cancel', () => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(signals).toHaveLength(2)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    cancel()
    expect(signals.every((s) => s.aborted)).toBe(true)
  })
})

describe('prefetchMeta con respiro (auditoría #5)', () => {
  it('al recorrer una fila solo se pide la ficha donde el foco se queda quieto', async () => {
    vi.useFakeTimers()
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return json({ meta: { id: 'x', type: 'movie', name: 'x' } })
    })
    const a = addon('https://meta.example', ['meta'])
    for (let i = 0; i < 10; i++) prefetchMeta([a], 'movie', `tt-pre-${i}`)
    vi.advanceTimersByTime(PREFETCH_DELAY_MS)
    await vi.runAllTimersAsync()
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('tt-pre-9')
  })
})

describe('ficha de un título que no existe (uso-05)', () => {
  const metaAddon = addon('https://meta.example', ['meta'])

  it('un addon que responde sin ficha da "No encontramos este título", sea cual sea el tipo', async () => {
    // Así responde Cinemeta a una serie inventada (`{}`) y a un id con 404.
    vi.stubGlobal('fetch', async () => json({}))
    await expect(getMeta([metaAddon], 'series', 'tt0000000-a')).rejects.toThrow(META_NOT_FOUND)
    vi.stubGlobal('fetch', async () => new Response('Cannot GET', { status: 404 }))
    await expect(getMeta([metaAddon], 'movie', 'tt0000000-b')).rejects.toThrow(META_NOT_FOUND)
  })

  it('si hay addons de fichas pero ninguno entiende ese tipo, también es "no encontramos"', async () => {
    await expect(getMeta([metaAddon], 'foo', 'bar')).rejects.toThrow(META_NOT_FOUND)
  })

  it('"Ningún addon" solo si no hay ninguno que dé fichas', async () => {
    await expect(getMeta([addon('https://solo-streams.example')], 'movie', 'tt0000000-c')).rejects.toThrow(/Ningún addon/)
  })

  it('un error de red sigue siendo un error de red', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }))
    await expect(getMeta([metaAddon], 'movie', 'tt0000000-d')).rejects.not.toThrow(META_NOT_FOUND)
  })
})

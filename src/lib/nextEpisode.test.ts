import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// IndexedDB no existe en Node: los stores guardan en memoria.
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

// Addons simulados: la ficha y los streams salen de acá.
const fake = vi.hoisted(() => ({
  meta: undefined as unknown,
  streams: {} as Record<string, unknown[]>,
  requested: [] as string[],
}))
vi.mock('./addons', async (orig) => ({
  ...(await orig<typeof import('./addons')>()),
  getMeta: async () => fake.meta,
  prefetchMeta: () => {},
  getStreams: (_addons: unknown[], _type: string, id: string, onUpdate: (g: unknown[]) => void) => {
    fake.requested.push(id)
    const t = setTimeout(() => onUpdate(fake.streams[id] ?? []), 0)
    return () => clearTimeout(t)
  },
}))

import { acceptsPick, episodeToResume, findResumeStream, locateNextEpisode } from './nextEpisode'
import { lastSourceStore, progressStore, settingsStore, type WatchEntry } from './store'
import type { InstalledAddon, Video } from './types'

const videos: Video[] = [
  // Desordenados a propósito y con `number` en vez de `episode` (como algunos addons).
  { id: 'tt1:2:1', season: 2, number: 1, title: 'Segunda, uno' },
  { id: 'tt1:1:10', season: 1, number: 10, title: 'Décimo' },
  { id: 'tt1:1:9', season: 1, number: 9, title: 'Noveno' },
  { id: 'tt1:1:2', season: 1, episode: 2 },
  { id: 'tt1:2:2', season: 2, number: 2 },
]

describe('locateNextEpisode', () => {
  it('usa `number` cuando el addon no manda `episode`', () => {
    const next = locateNextEpisode(videos, 'tt1:1:9')
    expect(next?.video).toEqual({ id: 'tt1:1:9', season: 1, episode: 9, title: 'Noveno', name: undefined })
    expect(next?.afterNextId).toBe('tt1:1:10')
  })

  it('ordena por temporada y número aunque la lista venga desordenada', () => {
    expect(locateNextEpisode(videos, 'tt1:1:2')?.afterNextId).toBe('tt1:1:9')
  })

  it('al terminar la temporada el siguiente es de la que viene, con su temporada', () => {
    const next = locateNextEpisode(videos, 'tt1:2:1')
    expect(next?.video.season).toBe(2)
    expect(next?.video.episode).toBe(1)
    expect(next?.afterNextId).toBe('tt1:2:2')
    // Último de la serie: no hay nada después.
    expect(locateNextEpisode(videos, 'tt1:2:2')?.afterNextId).toBeUndefined()
  })

  it('sin el video en la lista no devuelve nada', () => {
    expect(locateNextEpisode(videos, 'tt1:9:9')).toBeUndefined()
    expect(locateNextEpisode(undefined, 'tt1:1:1')).toBeUndefined()
  })

  it('el que sigue tiene que haber salido: no ofrece un episodio que se estrena la semana que viene', () => {
    const now = new Date(2026, 9, 14, 12).getTime()
    const airing: Video[] = [
      { id: 's:5:8', season: 5, episode: 8, released: '2026-10-07T00:00:00.000Z' },
      { id: 's:5:9', season: 5, episode: 9, released: '2026-10-14T00:00:00.000Z' },
      { id: 's:5:10', season: 5, episode: 10, released: '2026-10-21T00:00:00.000Z' },
    ]
    expect(locateNextEpisode(airing, 's:5:9', now)?.afterNextId).toBeUndefined()
    expect(locateNextEpisode(airing, 's:5:8', now)?.afterNextId).toBe('s:5:9')
    // Sin fecha se da por estrenado (no se esconde nada por un dato que falta).
    expect(locateNextEpisode([...airing, { id: 's:6:1', season: 6, episode: 1 }], 's:5:10', now)?.afterNextId).toBe('s:6:1')
  })
})

const entry = (videoId: string, over: Partial<WatchEntry> = {}): WatchEntry => ({
  videoId,
  metaId: 'tt1',
  type: 'series',
  name: 'Serie',
  position: 600,
  duration: 1200,
  watched: false,
  updatedAt: 1,
  firstWatchedAt: 1,
  ...over,
})

describe('episodeToResume', () => {
  const list: Video[] = [
    { id: 'tt1:0:1', season: 0, episode: 1, title: 'Especial' },
    { id: 'tt1:1:1', season: 1, episode: 1 },
    { id: 'tt1:1:2', season: 1, episode: 2 },
    { id: 'tt1:1:3', season: 1, episode: 3, released: '2999-01-01' },
  ]

  it('sin progreso arranca por T1 E1, no por los especiales', () => {
    expect(episodeToResume(list, {})?.id).toBe('tt1:1:1')
  })

  it('a medias sigue en el mismo; terminado, en el siguiente ya estrenado', () => {
    expect(episodeToResume(list, { 'tt1:1:1': entry('tt1:1:1') })?.id).toBe('tt1:1:1')
    expect(episodeToResume(list, { 'tt1:1:1': entry('tt1:1:1', { watched: true }) })?.id).toBe('tt1:1:2')
    // El siguiente no salió: nada para continuar.
    expect(episodeToResume(list, { 'tt1:1:2': entry('tt1:1:2', { watched: true, updatedAt: 5 }) })).toBeUndefined()
  })
})

describe('acceptsPick', () => {
  const pick = (match: 'binge' | 'name' | 'addon' | 'none') => ({ match }) as never
  it('en manual solo la misma fuente de antes; en automático, cualquiera', () => {
    expect(acceptsPick(undefined, { mode: 'auto' })).toBe(false)
    expect(acceptsPick(pick('none'), { mode: 'manual' })).toBe(false)
    expect(acceptsPick(pick('addon'), { mode: 'manual' })).toBe(true)
    expect(acceptsPick(pick('binge'), { mode: 'manual' })).toBe(true)
    expect(acceptsPick(pick('none'), { mode: 'auto' })).toBe(true)
  })
})

describe('findResumeStream', () => {
  const addon: InstalledAddon = {
    transportUrl: 'https://addon.example/manifest.json',
    manifest: { id: 'x', version: '1', name: 'Addon X', resources: ['stream'], types: ['movie', 'series'], catalogs: [] },
  }
  const group = (streams: unknown[]) => [{ addon, streams, loading: false }]
  const rules = settingsStore.get().sourceRules

  beforeEach(() => {
    fake.requested = []
    fake.streams = {}
    progressStore.set({})
    lastSourceStore.set({})
  })
  afterEach(() => {
    settingsStore.set((s) => ({ ...s, sourceRules: rules }))
  })

  it('serie: reproduce el episodio pedido con la fuente de antes y prepara el siguiente', async () => {
    fake.meta = { id: 'tt1', type: 'series', name: 'Serie', videos: [{ id: 'tt1:1:1', season: 1, episode: 1 }, { id: 'tt1:1:2', season: 1, episode: 2 }] }
    fake.streams['tt1:1:1'] = group([
      { name: 'Otro 1080p', url: 'https://cdn.example/otro.mp4', behaviorHints: { bingeGroup: 'otro' } },
      { name: 'Addon X 720p', url: 'https://cdn.example/a.mp4', behaviorHints: { bingeGroup: 'grupo-a' } },
    ])
    lastSourceStore.set({ tt1: { addonUrl: addon.transportUrl, bingeGroup: 'grupo-a', at: 1 } })
    const state = await findResumeStream({ type: 'series', metaId: 'tt1', videoId: 'tt1:1:1' })
    expect(fake.requested).toEqual(['tt1:1:1'])
    expect(state?.playUrl).toBe('https://cdn.example/a.mp4')
    expect(state?.video).toMatchObject({ id: 'tt1:1:1', season: 1, episode: 1 })
    expect(state?.nextVideoId).toBe('tt1:1:2')
    expect(state?.addonUrl).toBe(addon.transportUrl)
  })

  it('serie sin episodio pedido: sigue por el que corresponde según el progreso', async () => {
    fake.meta = { id: 'tt1', type: 'series', name: 'Serie', videos: [{ id: 'tt1:1:1', season: 1, episode: 1 }, { id: 'tt1:1:2', season: 1, episode: 2 }] }
    progressStore.set({ 'tt1:1:1': entry('tt1:1:1', { watched: true }) })
    fake.streams['tt1:1:2'] = group([{ name: 'Addon X', url: 'https://cdn.example/e2.mp4' }])
    lastSourceStore.set({ tt1: { addonUrl: addon.transportUrl, streamName: 'Addon X', at: 1 } })
    const state = await findResumeStream({ type: 'series', metaId: 'tt1' })
    expect(state?.video?.id).toBe('tt1:1:2')
  })

  it('modo manual sin fuente recordada: no reproduce (la tarjeta abre la ficha)', async () => {
    fake.meta = { id: 'tt9', type: 'movie', name: 'Peli' }
    fake.streams.tt9 = group([{ name: 'Addon X', url: 'https://cdn.example/p.mp4' }])
    settingsStore.set((s) => ({ ...s, sourceRules: { ...s.sourceRules, mode: 'manual' } }))
    expect(await findResumeStream({ type: 'movie', metaId: 'tt9' })).toBeUndefined()
  })

  it('modo automático: la mejor fuente, aunque no haya una recordada', async () => {
    fake.meta = { id: 'tt9', type: 'movie', name: 'Peli' }
    fake.streams.tt9 = group([{ name: 'Addon X', url: 'https://cdn.example/p.mp4' }])
    settingsStore.set((s) => ({ ...s, sourceRules: { ...s.sourceRules, mode: 'auto' } }))
    const state = await findResumeStream({ type: 'movie', metaId: 'tt9' })
    expect(state).toMatchObject({ playUrl: 'https://cdn.example/p.mp4', meta: { id: 'tt9', type: 'movie' } })
    expect(state?.video).toBeUndefined()
  })

  it('nada reproducible: undefined', async () => {
    fake.meta = { id: 'tt9', type: 'movie', name: 'Peli' }
    fake.streams.tt9 = group([{ name: 'Torrent', infoHash: 'abc' }])
    settingsStore.set((s) => ({ ...s, sourceRules: { ...s.sourceRules, mode: 'auto' } }))
    expect(await findResumeStream({ type: 'movie', metaId: 'tt9' })).toBeUndefined()
  })

  it('cancelada: undefined y no reproduce', async () => {
    fake.meta = { id: 'tt9', type: 'movie', name: 'Peli' }
    fake.streams.tt9 = group([{ name: 'Addon X', url: 'https://cdn.example/p.mp4' }])
    settingsStore.set((s) => ({ ...s, sourceRules: { ...s.sourceRules, mode: 'auto' } }))
    const ctrl = new AbortController()
    const pending = findResumeStream({ type: 'movie', metaId: 'tt9' }, ctrl.signal)
    ctrl.abort()
    expect(await pending).toBeUndefined()
  })
})

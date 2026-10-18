import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => {},
  update: async () => {},
  del: async () => {},
  delMany: async () => {},
  keys: async () => [],
  clear: async () => {},
}))

import { metaKey } from './addons'
import { clearCache, load } from './cache'
import { displayYear } from './yearLabel'

beforeEach(async () => {
  await clearCache()
})

describe('displayYear (pósters, Buscar, portada)', () => {
  it('sin la ficha en caché adivina por el año de inicio', () => {
    expect(displayYear({ id: 'tt1', type: 'series', releaseInfo: '2026–' }, 2026)).toBe('2026')
    expect(displayYear({ id: 'tt1', type: 'series', releaseInfo: '2025–' }, 2026)).toBe('2025–')
  })

  it('con la ficha en caché usa las temporadas reales', async () => {
    await load(metaKey('series', 'tt2'), async () => ({ id: 'tt2', type: 'series', name: 'Una', videos: [{ id: 'tt2:1:1', season: 1, episode: 1 }] }), false)
    expect(displayYear({ id: 'tt2', type: 'series', releaseInfo: '2025–' }, 2026)).toBe('2025')
    await load(metaKey('series', 'tt3'), async () => ({ id: 'tt3', type: 'series', name: 'Dos', videos: [{ id: 'tt3:1:1', season: 1 }, { id: 'tt3:2:1', season: 2 }] }), false)
    expect(displayYear({ id: 'tt3', type: 'series', releaseInfo: '2026–' }, 2026)).toBe('2026–')
  })

  it('también con el campo year (Mi lista, protector) y sin tipo', async () => {
    await load(metaKey('series', 'tt4'), async () => ({ id: 'tt4', type: 'series', name: 'Otra', videos: [{ id: 'tt4:1:1', season: 1 }] }), false)
    expect(displayYear({ id: 'tt4', year: '2024–' }, 2026)).toBe('2024')
  })

  it('las pelis quedan igual', () => {
    expect(displayYear({ id: 'tt5', type: 'movie', releaseInfo: '1999' }, 2026)).toBe('1999')
    expect(displayYear({ id: 'tt5', type: 'movie' })).toBeUndefined()
  })
})

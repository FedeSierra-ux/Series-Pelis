import { describe, expect, it, vi } from 'vitest'
import { browsableCatalogs, enabledAddons, getStreams, getSubtitles, isAddonEnabled, searchableCatalogs } from './addons'
import type { InstalledAddon } from './types'

const addon = (id: string, disabled?: boolean): InstalledAddon => ({
  transportUrl: `https://${id}.example/manifest.json`,
  manifest: {
    id,
    version: '1',
    name: id,
    resources: ['catalog', 'stream', 'subtitles'],
    types: ['movie'],
    catalogs: [{ type: 'movie', id: 'top', extra: [{ name: 'search' }] }],
  },
  ...(disabled === undefined ? {} : { disabled }),
})

describe('addons desactivados', () => {
  it('los datos viejos sin el campo cuentan como activos', () => {
    expect(isAddonEnabled(addon('a'))).toBe(true)
    expect(isAddonEnabled(addon('a', false))).toBe(true)
    expect(isAddonEnabled(addon('a', true))).toBe(false)
  })

  it('no aparecen en catálogos ni en la búsqueda', () => {
    const list = [addon('a'), addon('b', true), addon('c', false)]
    expect(enabledAddons(list).map((a) => a.manifest.id)).toEqual(['a', 'c'])
    expect(browsableCatalogs(list).map((c) => c.addon.manifest.id)).toEqual(['a', 'c'])
    expect(searchableCatalogs(list).map((c) => c.addon.manifest.id)).toEqual(['a', 'c'])
  })

  it('no se les piden streams ni subtítulos', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(new URL(url).hostname)
      return new Response(JSON.stringify({ streams: [], subtitles: [] }), { status: 200 })
    })
    try {
      const list = [addon('on1'), addon('off1', true)]
      let first: string[] = []
      getStreams(list, 'movie', 'tt1', (groups) => {
        if (!first.length) first = groups.map((g) => g.addon.manifest.id)
      })
      expect(first).toEqual(['on1'])
      await getSubtitles(list, 'movie', 'tt2')
      expect(asked.every((h) => h.startsWith('on1'))).toBe(true)
      expect(asked.length).toBeGreaterThan(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

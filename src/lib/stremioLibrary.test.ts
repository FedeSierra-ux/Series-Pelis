import { describe, expect, it } from 'vitest'
import type { ListItem, WatchEntry } from './store'
import {
  isImportableAddon,
  libraryItemToListItem,
  libraryItemToProgress,
  mergeProgress,
  mergeWatchlist,
  parseStremioJson,
  planImport,
  type StremioAddonDescriptor,
  type StremioLibraryItem,
} from './stremioLibrary'
import type { InstalledAddon } from './types'

const item = (over: Partial<StremioLibraryItem> & { state?: StremioLibraryItem['state'] } = {}): StremioLibraryItem => ({
  _id: 'tt0111161',
  name: 'Sueños de libertad',
  type: 'movie',
  poster: 'https://img/p.jpg',
  removed: false,
  temp: false,
  _ctime: '2024-01-01T00:00:00.000Z',
  _mtime: '2024-03-01T00:00:00.000Z',
  ...over,
  state: {
    lastWatched: '2024-03-01T10:00:00.000Z',
    timeOffset: 0,
    duration: 0,
    timesWatched: 0,
    flaggedWatched: 0,
    video_id: null,
    ...over.state,
  },
})

const desc = (url: string, id = url): StremioAddonDescriptor => ({
  transportUrl: url,
  manifest: { id, version: '1', name: id, resources: ['stream'], types: ['movie'], catalogs: [] },
})

describe('libraryItemToProgress', () => {
  it('peli a medias: ms → segundos, sin marcar como vista', () => {
    const e = libraryItemToProgress(item({ state: { timeOffset: 3_600_000, duration: 8_520_000, video_id: 'tt0111161' } }))
    expect(e).toMatchObject({ videoId: 'tt0111161', metaId: 'tt0111161', type: 'movie', position: 3600, duration: 8520, watched: false })
    expect(e?.updatedAt).toBe(Date.parse('2024-03-01T10:00:00.000Z'))
    expect(e?.firstWatchedAt).toBe(Date.parse('2024-01-01T00:00:00.000Z'))
  })

  it('peli terminada (offset en 0 y timesWatched) queda como vista; sin video_id usa el id', () => {
    const e = libraryItemToProgress(item({ state: { timesWatched: 1, duration: 8_520_000 } }))
    expect(e).toMatchObject({ videoId: 'tt0111161', watched: true, position: 0 })
  })

  it('marcada como vista a mano', () => {
    expect(libraryItemToProgress(item({ state: { flaggedWatched: 1 } }))?.watched).toBe(true)
  })

  it('casi al final cuenta como vista', () => {
    expect(libraryItemToProgress(item({ state: { timeOffset: 95_000, duration: 100_000 } }))?.watched).toBe(true)
  })

  it('episodio de serie: saca temporada y episodio del video_id', () => {
    const e = libraryItemToProgress(
      item({ _id: 'tt0944947', type: 'series', name: 'GoT', state: { video_id: 'tt0944947:2:5', timeOffset: 600_000, duration: 3_000_000 } }),
    )
    expect(e).toMatchObject({ videoId: 'tt0944947:2:5', metaId: 'tt0944947', season: 2, episode: 5, position: 600, watched: false })
  })

  it('serie sin episodio, nunca vista o de otro tipo: nada', () => {
    expect(libraryItemToProgress(item({ type: 'series', state: { timeOffset: 1000 } }))).toBeUndefined()
    expect(libraryItemToProgress(item())).toBeUndefined()
    expect(libraryItemToProgress(item({ type: 'channel', state: { timeOffset: 1000 } }))).toBeUndefined()
  })

  it('las temporales (solo "Seguir viendo") también traen progreso', () => {
    expect(libraryItemToProgress(item({ temp: true, state: { timeOffset: 60_000, duration: 100_000_00 } }))).toBeDefined()
  })
})

describe('libraryItemToListItem', () => {
  it('solo lo que está en la biblioteca', () => {
    expect(libraryItemToListItem(item())).toMatchObject({ id: 'tt0111161', type: 'movie', name: 'Sueños de libertad', addedAt: Date.parse('2024-01-01T00:00:00.000Z') })
    expect(libraryItemToListItem(item({ removed: true }))).toBeUndefined()
    expect(libraryItemToListItem(item({ temp: true }))).toBeUndefined()
  })
})

describe('mergeProgress / mergeWatchlist', () => {
  const base: WatchEntry = {
    videoId: 'tt1',
    metaId: 'tt1',
    type: 'movie',
    name: 'X',
    position: 100,
    duration: 1000,
    watched: false,
    updatedAt: 2000,
    firstWatchedAt: 1000,
  }

  it('no pisa lo de acá si es más nuevo', () => {
    const { result, changed } = mergeProgress({ tt1: base }, [{ ...base, position: 900, updatedAt: 1500 }])
    expect(changed).toBe(0)
    expect(result.tt1.position).toBe(100)
  })

  it('reemplaza si lo de Stremio es más reciente, sin perder "visto" ni la primera vez', () => {
    const { result, changed } = mergeProgress({ tt1: { ...base, watched: true, hidden: true } }, [{ ...base, position: 300, updatedAt: 3000, firstWatchedAt: 2500 }])
    expect(changed).toBe(1)
    expect(result.tt1).toMatchObject({ position: 300, watched: true, firstWatchedAt: 1000, updatedAt: 3000 })
    expect(result.tt1.hidden).toBeUndefined()
  })

  it('agrega lo que no estaba', () => {
    expect(mergeProgress({}, [base]).changed).toBe(1)
  })

  it('Mi lista: solo suma los nuevos', () => {
    const cur: Record<string, ListItem> = { tt1: { id: 'tt1', type: 'movie', name: 'A', addedAt: 1 } }
    const { result, added } = mergeWatchlist(cur, [
      { id: 'tt1', type: 'movie', name: 'Otro nombre', addedAt: 9 },
      { id: 'tt2', type: 'movie', name: 'B', addedAt: 9 },
    ])
    expect(added).toBe(1)
    expect(result.tt1.name).toBe('A')
  })
})

describe('addons', () => {
  it('solo manifests http(s), sin transportes viejos ni locales', () => {
    expect(isImportableAddon(desc('https://x.example/manifest.json'))).toBe(true)
    expect(isImportableAddon(desc('https://opensubtitles.strem.io/stremio/v1'))).toBe(false)
    expect(isImportableAddon(desc('http://127.0.0.1:11470/local-addon/manifest.json'))).toBe(false)
    expect(isImportableAddon(desc('not a url'))).toBe(false)
  })
})

describe('planImport', () => {
  it('cuenta lo que hay y lo que es nuevo', () => {
    const installed: InstalledAddon[] = [{ transportUrl: 'https://cinemeta/manifest.json', manifest: desc('x', 'com.linvo.cinemeta').manifest }]
    const plan = planImport(
      {
        addons: [
          desc('https://other/manifest.json', 'com.linvo.cinemeta'),
          desc('https://torrent/manifest.json', 'org.example'),
          desc('https://legacy/stremio/v1', 'old'),
        ],
        library: [
          item(),
          item({ _id: 'tt2', state: { timeOffset: 1000, duration: 10_000 } }),
          item({ _id: 'tt3', temp: true, state: { timeOffset: 1000, duration: 10_000 } }),
          item({ _id: 'tt4', removed: true }),
        ],
      },
      { addons: installed, progress: {}, watchlist: { tt0111161: { id: 'tt0111161', type: 'movie', name: 'A', addedAt: 1 } } },
    )
    expect(plan.addons).toMatchObject({ total: 3, skipped: 1 })
    // Mismo `manifest.id` que uno instalado pero otra URL: es otro addon (auditoría #4) y se importa.
    expect(plan.addons.fresh.map((a) => a.manifest.id)).toEqual(['com.linvo.cinemeta', 'org.example'])
    expect(plan.watchlist).toMatchObject({ total: 2, fresh: 1 })
    expect(plan.progress).toMatchObject({ total: 2, fresh: 2 })
  })
})

describe('planImport: addons por URL (auditoría #4)', () => {
  const TORBOX = 'https://torrentio.strem.fun/torbox=casa/manifest.json'
  const MINE = 'https://torrentio.strem.fun/realdebrid=propio/manifest.json'
  const installed: InstalledAddon[] = [{ transportUrl: TORBOX, manifest: desc(TORBOX, 'com.stremio.torrentio').manifest }]

  it('Torrentio con otro debrid se importa aunque ya haya un Torrentio', () => {
    const plan = planImport({ addons: [desc(MINE, 'com.stremio.torrentio')] }, { addons: installed, progress: {}, watchlist: {} })
    expect(plan.addons.fresh.map((a) => a.transportUrl)).toEqual([MINE])
  })

  it('la misma URL (con otro dominio en mayúsculas o barra final) no se repite, ni dos veces en la cuenta', () => {
    const plan = planImport(
      { addons: [desc('https://TORRENTIO.strem.fun/torbox=casa/manifest.json', 'com.stremio.torrentio'), desc(MINE, 'x'), desc(MINE, 'x')] },
      { addons: installed, progress: {}, watchlist: {} },
    )
    expect(plan.addons.fresh.map((a) => a.transportUrl)).toEqual([MINE])
  })

  it('un manifest sin nombre se importa con el id como nombre', () => {
    const d = desc('https://x.example/manifest.json', 'org.sin.nombre')
    const plan = planImport({ addons: [{ ...d, manifest: { ...d.manifest, name: undefined as unknown as string } }] }, { addons: [], progress: {}, watchlist: {} })
    expect(plan.addons.fresh[0].manifest.name).toBe('org.sin.nombre')
  })
})

describe('parseStremioJson', () => {
  it('entiende la respuesta de datastoreGet y de addonCollectionGet', () => {
    expect(parseStremioJson({ result: [item()] }).library).toHaveLength(1)
    expect(parseStremioJson({ result: { addons: [desc('https://a/manifest.json')] } }).addons).toHaveLength(1)
    const both = parseStremioJson({ addons: [desc('https://a/manifest.json')], library: [item()] })
    expect(both.addons).toHaveLength(1)
    expect(both.library).toHaveLength(1)
    expect(parseStremioJson([item(), item({ _id: 'tt2' })]).library).toHaveLength(2)
  })

  it('avisa si no hay nada reconocible', () => {
    expect(() => parseStremioJson({ foo: 1 })).toThrow()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// IndexedDB no existe en Node: los stores guardan en memoria y listo. `idbSeed` simula lo guardado de antes.
const idbSeed = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => idbSeed.get(key),
  set: async () => undefined,
  update: async () => undefined,
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))

import { CINEMETA_ADDON } from './addons'
import {
  addInstalledAddons,
  addonKey,
  addonsStore,
  catalogPrefsStore,
  clearHistory,
  continueWatching,
  DEFAULT_SETTINGS,
  diaryStore,
  exportData,
  forgetAddonData,
  hydrateStores,
  applyHouseDefaults,
  importData,
  installAddon,
  lastSourceStore,
  MANIFEST_TTL_MS,
  progressStore,
  refreshManifests,
  removeAddon,
  removeHistory,
  resetSettings,
  restoreAddon,
  restoreWatchSnapshot,
  restartedWatched,
  restoreHistory,
  saveProgress,
  settingsStore,
  setWatchedMany,
  snapshotWatch,
  watchlistStore,
  type WatchEntry,
} from './store'
import type { InstalledAddon, Manifest } from './types'

const manifest = (id: string, name = id): Manifest => ({ id, version: '1', name, resources: ['stream'], types: ['movie'], catalogs: [] })

const addon = (url: string, id: string): InstalledAddon => ({ transportUrl: url, manifest: manifest(id) })

/** `fetch` falso que responde el manifest según la URL. */
function fakeManifests(byUrl: Record<string, Manifest>, asked: string[] = []) {
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    const m = byUrl[url]
    if (!m) return new Response('no', { status: 404 })
    return new Response(JSON.stringify(m), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  return asked
}

function fakeLocalStorage() {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
  return data
}

beforeEach(() => {
  addonsStore.set([CINEMETA_ADDON])
  progressStore.set({})
  diaryStore.set({ v: 1, entries: {} })
  watchlistStore.set({})
  settingsStore.set((s) => ({ ...s, tmdbKey: '' }))
})

afterEach(() => vi.unstubAllGlobals())

const TORBOX = 'https://torrentio.strem.fun/torbox=abc/manifest.json'
const RD = 'https://torrentio.strem.fun/realdebrid=xyz/manifest.json'

describe('addons: identidad por URL (B24)', () => {
  it('addonKey ignora mayúsculas del dominio, la barra final y el #', () => {
    expect(addonKey('HTTPS://Torrentio.Strem.Fun/torbox=abc/manifest.json/#x')).toBe(addonKey(TORBOX))
    expect(addonKey(TORBOX)).not.toBe(addonKey(RD))
    expect(addonKey('no es url')).toBe('no es url')
  })

  it('el mismo addon con otra configuración se instala aparte', async () => {
    fakeManifests({ [TORBOX]: manifest('com.stremio.torrentio', 'Torrentio TorBox'), [RD]: manifest('com.stremio.torrentio', 'Torrentio RD') })
    expect((await installAddon(TORBOX)).status).toBe('new')
    expect((await installAddon(RD)).status).toBe('new')
    expect(addonsStore.get().map((a) => a.transportUrl)).toEqual([CINEMETA_ADDON.transportUrl, TORBOX, RD])
  })

  it('volver a pegar la misma URL (aunque cambie el dominio en mayúsculas) actualiza y no duplica', async () => {
    fakeManifests({ [TORBOX]: manifest('com.stremio.torrentio', 'Torrentio TorBox') })
    await installAddon(TORBOX)
    const again = 'https://TORRENTIO.strem.fun/torbox=abc/manifest.json'
    fakeManifests({ [again]: manifest('com.stremio.torrentio', 'Torrentio TorBox v2') })
    expect((await installAddon(again)).status).toBe('updated')
    expect(addonsStore.get()).toHaveLength(2)
    expect(addonsStore.get()[1].manifest.name).toBe('Torrentio TorBox v2')
  })

  it('addInstalledAddons deduplica por URL, no por id del manifest', () => {
    addInstalledAddons([addon(TORBOX, 'com.stremio.torrentio'), addon(RD, 'com.stremio.torrentio'), addon(TORBOX + '#dup', 'com.stremio.torrentio')])
    expect(addonsStore.get().map((a) => a.transportUrl)).toEqual([CINEMETA_ADDON.transportUrl, TORBOX, RD])
  })
})

describe('refreshManifests (B34)', () => {
  it('no toca la lista si ningún manifest cambió, y sí cuando cambia uno', async () => {
    fakeLocalStorage()
    addonsStore.set([addon(TORBOX, 'a'), addon(RD, 'b')])
    const before = addonsStore.get()
    fakeManifests({ [TORBOX]: manifest('a'), [RD]: manifest('b') })
    await refreshManifests()
    expect(addonsStore.get()).toBe(before)

    fakeManifests({ [TORBOX]: manifest('a'), [RD]: { ...manifest('b'), name: 'b nuevo' } })
    await refreshManifests(Date.now() + MANIFEST_TTL_MS + 1)
    const after = addonsStore.get()
    expect(after).not.toBe(before)
    expect(after[0]).toBe(before[0])
    expect(after[1].manifest.name).toBe('b nuevo')
  })

  it('no vuelve a bajar los manifests hasta pasadas 24 h', async () => {
    fakeLocalStorage()
    addonsStore.set([addon(TORBOX, 'a')])
    const asked = fakeManifests({ [TORBOX]: manifest('a') })
    const t0 = Date.now()
    await refreshManifests(t0)
    await refreshManifests(t0 + 60_000)
    expect(asked).toHaveLength(1)
    await refreshManifests(t0 + MANIFEST_TTL_MS)
    expect(asked).toHaveLength(2)
  })

  it('si un addon no responde, se vuelve a probar en el próximo arranque', async () => {
    fakeLocalStorage()
    addonsStore.set([addon(TORBOX, 'a')])
    const asked = fakeManifests({})
    await refreshManifests()
    await refreshManifests(Date.now() + 1000)
    expect(asked).toHaveLength(2)
    expect(addonsStore.get()[0].manifest.id).toBe('a')
  })
})

const base = { videoId: 'tt1', metaId: 'tt1', type: 'movie', name: 'Peli' }
const entry = (position: number, duration = 6000, extra: Partial<WatchEntry> = {}): WatchEntry => ({
  ...base,
  position,
  duration,
  watched: false,
  updatedAt: 1,
  firstWatchedAt: 1,
  ...extra,
})

describe('volver a ver algo ya visto (B12)', () => {
  it('restartedWatched: solo si estaba visto y arrancó de nuevo o retrocedió más de un minuto', () => {
    expect(restartedWatched(undefined, { position: 10, duration: 6000 })).toBe(false)
    expect(restartedWatched(entry(5900, 6000), { position: 10, duration: 6000 })).toBe(false)
    const seen = entry(5900, 6000, { watched: true })
    expect(restartedWatched(seen, { position: 10, duration: 6000 })).toBe(true)
    expect(restartedWatched(seen, { position: 5950, duration: 6000 })).toBe(false)
    // Visto a la mitad (marcado antes de llegar al final): retroceder un poco no es empezar de nuevo.
    const mid = entry(3000, 6000, { watched: true })
    expect(restartedWatched(mid, { position: 2970, duration: 6000 })).toBe(false)
    expect(restartedWatched(mid, { position: 2000, duration: 6000 })).toBe(true)
    // Marcado visto a mano, sin haberlo reproducido.
    expect(restartedWatched(entry(0, 0, { watched: true }), { position: 100, duration: 6000 })).toBe(true)
  })

  it('al reproducir de nuevo vuelve a "Seguir viendo" y al terminar queda visto otra vez', () => {
    saveProgress({ ...base, position: 5900, duration: 6000 })
    expect(progressStore.get().tt1.watched).toBe(true)
    expect(continueWatching(progressStore.get())).toHaveLength(0)

    saveProgress({ ...base, position: 120, duration: 6000 })
    expect(progressStore.get().tt1.watched).toBe(false)
    expect(continueWatching(progressStore.get()).map((e) => e.videoId)).toEqual(['tt1'])

    saveProgress({ ...base, position: 3000, duration: 6000 })
    expect(progressStore.get().tt1.watched).toBe(false)
    saveProgress({ ...base, position: 5800, duration: 6000 })
    expect(progressStore.get().tt1.watched).toBe(true)
    expect(continueWatching(progressStore.get())).toHaveLength(0)
  })

  it('seguir viendo cerca del final no lo saca de visto', () => {
    saveProgress({ ...base, position: 5500, duration: 6000 })
    saveProgress({ ...base, position: 5520, duration: 6000 })
    expect(progressStore.get().tt1.watched).toBe(true)
  })
})

describe('copia de seguridad (B25, B26)', () => {
  it('no exporta la key de TMDB y no la importa si viene', async () => {
    settingsStore.set((s) => ({ ...s, tmdbKey: 'mi-key', autoplayNext: false }))
    const out = exportData()
    expect(JSON.stringify(out)).not.toContain('mi-key')
    expect((out.settings as Record<string, unknown>).tmdbKey).toBeUndefined()
    expect(out.settings.autoplayNext).toBe(false)

    await importData({ app: 'series-pelis', settings: { tmdbKey: 'otra', autoplayNext: true } })
    expect(settingsStore.get().tmdbKey).toBe('mi-key')
    expect(settingsStore.get().autoplayNext).toBe(true)
  })

  it('ajustes mal formados en la copia no rompen nada (uso-01)', async () => {
    await importData({ app: 'series-pelis', settings: { sourceRules: null, subtitleStyle: 5, audioLangs: 'es', autoplayNext: false } })
    const s = settingsStore.get()
    expect(s.sourceRules.mode).toBe('manual')
    expect(s.subtitleStyle.position).toBe(0)
    expect(s.audioLangs).toEqual(['spa', 'eng'])
    expect(s.autoplayNext).toBe(false)
    settingsStore.set(DEFAULT_SETTINGS)
  })

  it('lo mal formado que ya estaba guardado se limpia al arrancar (uso-01)', async () => {
    idbSeed.set('settings', { sourceRules: null, subtitleStyle: { size: 'xl', position: 'x' }, uiScale: 115 })
    await hydrateStores()
    const s = settingsStore.get()
    expect(s.sourceRules.mode).toBe('manual')
    expect(s.subtitleStyle).toEqual({ ...DEFAULT_SETTINGS.subtitleStyle, size: 'xl' })
    expect(s.uiScale).toBe(115)
    idbSeed.delete('settings')
    settingsStore.set(DEFAULT_SETTINGS)
  })

  it('rechaza lo que no es una copia', async () => {
    await expect(importData('hola')).rejects.toThrow(/no es una copia/)
    await expect(importData({ app: 'otra' })).rejects.toThrow(/no es una copia/)
  })

  it('ignora los bloques con forma inválida y mezcla los válidos', async () => {
    progressStore.set({ tt9: entry(10, 100, { videoId: 'tt9', metaId: 'tt9' }) })
    await importData({
      app: 'series-pelis',
      progress: 'basura',
      watchlist: [{ id: 'tt2' }],
      settings: 'no',
      ratings: { tt3: { stars: 4, at: 1, type: 'movie', name: 'x' }, tt4: 'texto', tt5: null, tt6: [1] },
      recentSearches: ['matrix', 5, null],
      goals: { byYear: 'no', seen: 'no' },
      addons: [123, null],
      disabledAddons: 'no',
      catalogPrefs: 'no',
    })
    expect(Object.keys(progressStore.get())).toEqual(['tt9'])
    expect(watchlistStore.get()).toEqual({})
    expect(settingsStore.get().autoplayNext).toBe(true)
    const { ratingsStore, recentSearchesStore, goalsStore } = await import('./store')
    expect(Object.keys(ratingsStore.get())).toEqual(['tt3'])
    expect(recentSearchesStore.get()).toEqual(['matrix'])
    expect(goalsStore.get()).toEqual({ byYear: {}, seen: [] })
    expect(addonsStore.get()).toHaveLength(1)
  })

  it('importa progreso válido y arma el diario con lo visto', async () => {
    await importData({ app: 'series-pelis', progress: { tt1: entry(5900, 6000, { watched: true }), malo: 'x' } })
    expect(Object.keys(progressStore.get())).toEqual(['tt1'])
    expect(Object.values(diaryStore.get().entries).map((d) => d.videoId)).toEqual(['tt1'])
  })
})

describe('importar una copia mezcla en vez de pisar (auditoría #3, #8, #10)', () => {
  it('el progreso más nuevo de acá no vuelve atrás ni pierde el "visto"', async () => {
    progressStore.set({
      tt1: entry(5000, 6000, { updatedAt: 2000, watched: true, firstWatchedAt: 500 }),
      tt2: entry(100, 6000, { videoId: 'tt2', metaId: 'tt2', updatedAt: 1000 }),
    })
    await importData({
      app: 'series-pelis',
      progress: {
        tt1: entry(10, 6000, { updatedAt: 1500 }),
        tt2: entry(3000, 6000, { videoId: 'tt2', metaId: 'tt2', updatedAt: 1800, firstWatchedAt: 300 }),
        tt3: entry(5900, 6000, { videoId: 'tt3', metaId: 'tt3', updatedAt: 1700, watched: true }),
      },
    })
    const all = progressStore.get()
    expect(all.tt1).toMatchObject({ position: 5000, watched: true, updatedAt: 2000 })
    expect(all.tt2).toMatchObject({ position: 3000, updatedAt: 1800, firstWatchedAt: 1 })
    expect(all.tt3.watched).toBe(true)
    // Lo terminado que llegó va al diario.
    expect(Object.values(diaryStore.get().entries).map((d) => d.videoId)).toEqual(['tt3'])
  })

  it('puntajes e idiomas por título: queda el más nuevo', async () => {
    const { ratingsStore, trackPrefsStore } = await import('./store')
    ratingsStore.set({ tt1: { stars: 5, at: 200, type: 'movie', name: 'A' }, tt2: { stars: 1, at: 100, type: 'movie', name: 'B' } })
    trackPrefsStore.set({ tt1: { subLang: 'spa', at: 50 } })
    await importData({
      app: 'series-pelis',
      ratings: { tt1: { stars: 2, at: 150, type: 'movie', name: 'A' }, tt2: { stars: 4, at: 300, type: 'movie', name: 'B' } },
      trackPrefs: { tt1: { subLang: 'eng', at: 10 } },
    })
    expect(ratingsStore.get().tt1.stars).toBe(5)
    expect(ratingsStore.get().tt2.stars).toBe(4)
    expect(trackPrefsStore.get().tt1.subLang).toBe('spa')
  })

  it('un addon que no responde se agrega con el manifest de la copia; sin manifest, se avisa', async () => {
    const DOWN = 'https://caido.example/manifest.json'
    const OLD = 'https://viejo.example/manifest.json'
    fakeManifests({})
    const report = await importData({
      app: 'series-pelis',
      addons: [CINEMETA_ADDON.transportUrl, DOWN, OLD],
      addonManifests: { [DOWN]: manifest('org.caido', 'Caído') },
      disabledAddons: [DOWN],
    })
    expect(report).toEqual({ offlineAddons: [DOWN], failedAddons: [OLD] })
    const added = addonsStore.get().find((a) => a.transportUrl === DOWN)
    expect(added?.manifest.name).toBe('Caído')
    expect(added?.disabled).toBe(true)
  })

  it('la copia exporta los manifests para eso', () => {
    addonsStore.set([CINEMETA_ADDON])
    expect(exportData().addonManifests).toEqual({ [CINEMETA_ADDON.transportUrl]: CINEMETA_ADDON.manifest })
  })

  it('importProgress (Importar desde Stremio) anota en el diario lo terminado que llega', async () => {
    const { importProgress } = await import('./store')
    const changed = importProgress([
      entry(0, 6000, { videoId: 'tt7', metaId: 'tt7', watched: true, updatedAt: 1_700_000_000_000 }),
      entry(600, 6000, { videoId: 'tt8', metaId: 'tt8', updatedAt: 1_700_000_000_000 }),
    ])
    expect(changed).toBe(2)
    const diary = Object.values(diaryStore.get().entries)
    expect(diary.map((d) => d.videoId)).toEqual(['tt7'])
    expect(diary[0].watchedAt).toBe(1_700_000_000_000)
    // Importar lo mismo otra vez no duplica nada.
    expect(importProgress([entry(0, 6000, { videoId: 'tt7', metaId: 'tt7', watched: true, updatedAt: 1_700_000_000_000 })])).toBe(0)
    expect(Object.values(diaryStore.get().entries)).toHaveLength(1)
  })
})

describe('manifests guardados sin nombre (auditoría #14)', () => {
  it('al arrancar se completan con el id, así Ajustes no se rompe', async () => {
    idbSeed.set('addons', [CINEMETA_ADDON, { transportUrl: 'https://x.example/manifest.json', manifest: { id: 'org.x', resources: ['stream'] } }])
    try {
      await hydrateStores()
      const x = addonsStore.get().find((a) => a.transportUrl === 'https://x.example/manifest.json')
      expect(x?.manifest).toMatchObject({ name: 'org.x', catalogs: [], types: [] })
    } finally {
      idbSeed.delete('addons')
    }
  })
})

describe('subtítulos automáticos de fábrica (v0.12.2)', () => {
  afterEach(() => {
    idbSeed.clear()
    vi.useRealTimers()
  })

  it('a quien ya tenía la app con los subtítulos apagados se le prenden una sola vez', async () => {
    vi.useFakeTimers()
    idbSeed.set('settings', { ...settingsStore.get(), autoSubtitles: false, autoSubsMigrated: undefined })
    await hydrateStores()
    expect(settingsStore.get()).toMatchObject({ autoSubtitles: true, autoSubsMigrated: true })

    // Si después los apaga, la próxima vez que abre la app quedan apagados.
    idbSeed.set('settings', { ...settingsStore.get(), autoSubtitles: false })
    await hydrateStores()
    expect(settingsStore.get().autoSubtitles).toBe(false)
  })
})

describe('modo sin spoilers de fábrica (v0.22.3)', () => {
  it('se prende una sola vez por casa y después se respeta si lo apagan', () => {
    settingsStore.set((s) => ({ ...s, spoilerFree: false, spoilerDefaulted: false }))
    applyHouseDefaults()
    expect(settingsStore.get()).toMatchObject({ spoilerFree: true, spoilerDefaulted: true })
    settingsStore.set((s) => ({ ...s, spoilerFree: false }))
    applyHouseDefaults()
    expect(settingsStore.get().spoilerFree).toBe(false)
  })
})

describe('listas de IMDb sacadas (v0.13.0)', () => {
  afterEach(() => {
    idbSeed.clear()
    vi.useRealTimers()
  })

  it('si estaban como filas de Inicio se borran; las demás quedan', async () => {
    vi.useFakeTimers()
    idbSeed.set('settings', { ...settingsStore.get(), curatedRows: ['top-imdb-movie', 'oscars', 'top-imdb-series', 'kw-heist'] })
    await hydrateStores()
    expect(settingsStore.get().curatedRows).toEqual(['oscars', 'kw-heist'])
  })
})

describe('forgetAddonData (v0.17.1)', () => {
  it('saca los addons y todo lo que guarda sus URLs; el resto queda', async () => {
    const ls = fakeLocalStorage()
    ls.set('sp-manifest-checked', JSON.stringify({ [TORBOX]: 1 }))
    ls.set('sp-otra', 'x')
    addonsStore.set([CINEMETA_ADDON, addon(TORBOX, 'torrentio')])
    lastSourceStore.set({ tt1: { addonUrl: TORBOX, at: 1 } as never })
    catalogPrefsStore.set((p) => ({ ...p, order: [`${TORBOX}|movie|top`] }))
    progressStore.set({ tt1: { videoId: 'tt1' } as never })
    const progress = progressStore.get()

    await forgetAddonData()

    expect(addonsStore.get()).toEqual([CINEMETA_ADDON])
    expect(lastSourceStore.get()).toEqual({})
    expect(catalogPrefsStore.get().order).toEqual([])
    expect(ls.has('sp-manifest-checked')).toBe(false)
    expect(ls.get('sp-otra')).toBe('x')
    expect(progressStore.get()).toBe(progress)
  })
})

describe('quitar del historial con "Deshacer" (auditoría v0.25.1)', () => {
  it('removeHistory devuelve lo borrado y restoreHistory lo vuelve a poner, con el diario', () => {
    saveProgress({ ...base, position: 5900, duration: 6000 })
    const before = progressStore.get().tt1
    const diaryBefore = diaryStore.get().entries
    expect(Object.keys(diaryBefore)).toHaveLength(1)

    const removed = removeHistory(['tt1'])
    expect(progressStore.get().tt1).toBeUndefined()
    expect(diaryStore.get().entries).toEqual({})
    expect(removed.progress).toEqual([before])

    restoreHistory(removed)
    expect(progressStore.get().tt1).toEqual(before)
    expect(diaryStore.get().entries).toEqual(diaryBefore)
  })

  it('si mientras tanto se volvió a ver, deshacer no pisa lo nuevo', () => {
    saveProgress({ ...base, position: 5900, duration: 6000 })
    const removed = removeHistory(['tt1'])
    saveProgress({ ...base, position: 120, duration: 6000 })
    const fresh = progressStore.get().tt1
    restoreHistory(removed)
    expect(progressStore.get().tt1).toBe(fresh)
  })
})

describe('instalar addons a mano: manifest completo (uso-08)', () => {
  it('rechaza un manifest sin nombre o sin recursos', async () => {
    const noName = { id: 'x', version: '1', resources: ['stream'], types: ['movie'], catalogs: [] } as unknown as Manifest
    const noResources = { id: 'y', name: 'Y', version: '1', resources: [], types: ['movie'], catalogs: [] } as Manifest
    fakeManifests({ 'https://a.example/manifest.json': noName, 'https://b.example/manifest.json': noResources })
    await expect(installAddon('https://a.example/manifest.json')).rejects.toThrow(/no tiene nombre/)
    await expect(installAddon('https://b.example/manifest.json')).rejects.toThrow(/ningún recurso/)
    expect(addonsStore.get()).toHaveLength(1)
  })
})

describe('quitar un addon y deshacerlo (uso-07)', () => {
  it('lo devuelve en el mismo lugar y no duplica si ya volvió a estar', () => {
    const a = addon(TORBOX, 'a')
    const b = addon(RD, 'b')
    addonsStore.set([CINEMETA_ADDON, a, b])
    const removed = removeAddon(TORBOX)!
    expect(addonsStore.get().map((x) => x.manifest.id)).toEqual([CINEMETA_ADDON.manifest.id, 'b'])
    restoreAddon(removed)
    expect(addonsStore.get().map((x) => x.manifest.id)).toEqual([CINEMETA_ADDON.manifest.id, 'a', 'b'])
    restoreAddon(removed)
    expect(addonsStore.get()).toHaveLength(3)
    expect(removeAddon('https://no.esta/manifest.json')).toBeUndefined()
  })
})

describe('borrar el historial y restablecer ajustes (uso-04)', () => {
  it('clearHistory vacía historial y diario, deja Mi lista y se puede deshacer', async () => {
    const { restoreHistory } = await import('./store')
    progressStore.set({ a: entry(100, 6000, { videoId: 'a', metaId: 'a' }), b: entry(200, 6000, { videoId: 'b', metaId: 'b', watched: true }) })
    setWatchedMany([{ ...base, videoId: 'c', metaId: 'c' }], true)
    watchlistStore.set({ z: { id: 'z', type: 'movie', name: 'Z', addedAt: 1 } as never })
    const removed = clearHistory()
    expect(progressStore.get()).toEqual({})
    expect(diaryStore.get().entries).toEqual({})
    expect(Object.keys(watchlistStore.get())).toEqual(['z'])
    expect(removed.progress).toHaveLength(3)
    restoreHistory(removed)
    expect(Object.keys(progressStore.get()).sort()).toEqual(['a', 'b', 'c'])
    expect(Object.values(diaryStore.get().entries)).toHaveLength(1)
  })

  it('clearHistory sin nada no cambia las referencias (no sube filas vacías)', () => {
    const before = progressStore.get()
    clearHistory()
    expect(progressStore.get()).toBe(before)
  })

  it('resetSettings vuelve a fábrica pero conserva la key de TMDB y las marcas de la casa; no toca addons', () => {
    addonsStore.set([CINEMETA_ADDON, addon(TORBOX, 'a')])
    settingsStore.set((s) => ({ ...s, tmdbKey: 'mi-key', autoplayNext: false, uiScale: 130, onboardingDone: true, langsChosen: true, spoilerDefaulted: true, autoSubsMigrated: true, hintsSeen: true, tvMode: 'on', subtitleLangs: ['fra'] }))
    const before = resetSettings()
    const now = settingsStore.get()
    expect(now).toEqual({ ...DEFAULT_SETTINGS, tmdbKey: 'mi-key', onboardingDone: true, langsChosen: true, spoilerDefaulted: true, autoSubsMigrated: true, hintsSeen: true })
    expect(before.autoplayNext).toBe(false)
    expect(addonsStore.get()).toHaveLength(2)
    settingsStore.set(before)
    expect(settingsStore.get().uiScale).toBe(130)
    settingsStore.set(DEFAULT_SETTINGS)
  })
})

describe('marcar una temporada y deshacerlo (uso-10)', () => {
  it('el snapshot devuelve progreso y diario como estaban', () => {
    const ep = (n: number) => ({ ...base, videoId: `s:${n}`, metaId: 's', type: 'series', season: 1, episode: n })
    progressStore.set({ 's:1': entry(50, 3000, { videoId: 's:1', metaId: 's', type: 'series', season: 1, episode: 1 }) })
    const ids = ['s:1', 's:2', 's:3']
    const snap = snapshotWatch(ids)
    setWatchedMany(ids.map((_id, i) => ep(i + 1)), true)
    expect(Object.values(progressStore.get()).every((e) => e.watched)).toBe(true)
    expect(Object.keys(diaryStore.get().entries).length).toBeGreaterThan(0)
    restoreWatchSnapshot(snap)
    expect(Object.keys(progressStore.get())).toEqual(['s:1'])
    expect(progressStore.get()['s:1'].watched).toBe(false)
    expect(diaryStore.get().entries).toEqual({})
  })
})

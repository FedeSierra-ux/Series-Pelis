import { afterEach, describe, expect, it, vi } from 'vitest'

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

import { cleanStream, MAX_ENGINE_TRACKERS, normalizeInfoHash, streamingServerUrl, streamTrackers } from './addons'
import { resetNativeInfo } from './native'
import { settingsStore } from './store'
import {
  engineBaseOf,
  needsNativePlayer,
  pickTorrentServer,
  resetTorrentEngine,
  TORRENT_NEEDS_PC,
  TORRENT_NEEDS_PLAYER,
  TORRENT_NEEDS_UPDATE,
  torrentServer,
  torrentServerReady,
} from './torrentServer'

const ENGINE = 'http://127.0.0.1:8090/tok3n'

/** La app de Android: el plugin SpNative con lo que cuenta `getInfo`. */
function stubApp(info: Record<string, unknown>) {
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, Plugins: { SpNative: { getInfo: async () => info } } } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetNativeInfo()
  resetTorrentEngine()
  settingsStore.set((s) => ({ ...s, streamingServerUrl: '', nativePlayer: true }))
})

describe('pickTorrentServer', () => {
  const base = { explicit: '', native: true, nativePlayer: true, engine: ENGINE }

  it('el servidor puesto en Ajustes le gana a todo', () => {
    expect(pickTorrentServer({ ...base, explicit: 'http://192.168.0.5:11470' })).toEqual({ url: 'http://192.168.0.5:11470' })
  })

  it('en la app con el reproductor de Android, el motor', () => {
    expect(pickTorrentServer(base)).toEqual({ url: ENGINE, engine: true })
  })

  it('sin servidor: el motivo depende de dónde corre', () => {
    expect(pickTorrentServer({ ...base, nativePlayer: false })).toEqual({ url: '', missing: TORRENT_NEEDS_PLAYER })
    expect(pickTorrentServer({ ...base, native: false, engine: undefined })).toEqual({ url: '', missing: TORRENT_NEEDS_PC })
    // APK viejo, sin motor.
    expect(pickTorrentServer({ ...base, engine: undefined })).toEqual({ url: '', missing: TORRENT_NEEDS_UPDATE })
    expect(TORRENT_NEEDS_PLAYER).toBe('Torrent: activá el reproductor de Android (Ajustes → Reproductor) o usá un addon con debrid')
    expect(TORRENT_NEEDS_PC).toBe('Torrent: abrí Stremio en la PC (servidor local) o usá un addon con debrid')
  })
})

describe('engineBaseOf', () => {
  it('solo con reproductor nativo y una URL a la propia máquina', () => {
    expect(engineBaseOf({ player: true, torrent: `${ENGINE}/` })).toBe(ENGINE)
    expect(engineBaseOf({ player: true, torrent: 'http://localhost:9000/x' })).toBe('http://localhost:9000/x')
    expect(engineBaseOf({ player: false, torrent: ENGINE })).toBeUndefined()
    expect(engineBaseOf({ player: true })).toBeUndefined()
    expect(engineBaseOf({ player: true, torrent: 'https://evil.example/tok' })).toBeUndefined()
    expect(engineBaseOf({ player: true, torrent: 'http://127.0.0.1.evil.example/tok' })).toBeUndefined()
  })
})

describe('torrentServer (estado)', () => {
  it('en el navegador no hay motor', async () => {
    expect(await torrentServerReady()).toEqual({ url: '', missing: TORRENT_NEEDS_PC })
    settingsStore.set((s) => ({ ...s, streamingServerUrl: 'http://127.0.0.1:11470' }))
    expect(torrentServer()).toEqual({ url: 'http://127.0.0.1:11470' })
    expect(needsNativePlayer('http://127.0.0.1:11470/abc/0')).toBe(false)
  })

  it('en la app: el motor cuando responde el APK, y respeta el ajuste del reproductor', async () => {
    stubApp({ player: true, torrent: ENGINE })
    expect(await torrentServerReady()).toEqual({ url: ENGINE, engine: true })
    expect(torrentServer()).toEqual({ url: ENGINE, engine: true })
    settingsStore.set((s) => ({ ...s, nativePlayer: false }))
    expect(torrentServer()).toEqual({ url: '', missing: TORRENT_NEEDS_PLAYER })
    expect(needsNativePlayer(`${ENGINE}/abc/0?f=x.mkv`)).toBe(true)
    expect(needsNativePlayer('https://debrid.example/x.mkv')).toBe(false)
  })

  it('APK viejo (sin motor): el mensaje de siempre', async () => {
    stubApp({ player: true })
    // Antes de que responda, un http a la propia máquina se da por del motor; después, no.
    expect(needsNativePlayer('http://127.0.0.1:11470/abc/0')).toBe(true)
    expect(await torrentServerReady()).toEqual({ url: '', missing: TORRENT_NEEDS_UPDATE })
    expect(needsNativePlayer('http://127.0.0.1:11470/abc/0')).toBe(false)
  })
})

describe('URL del motor', () => {
  it('trackers: solo udp/http/https/wss, sin repetir y con tope', () => {
    const sources = [
      'tracker:udp://a.example:1337/announce',
      'tracker:udp://a.example:1337/announce',
      'tracker:https://b.example/announce',
      'tracker:wss://c.example',
      'tracker:magnet:?xt=urn:btih:abc',
      'tracker:javascript:alert(1)',
      'dht:abc',
      'udp://sin-prefijo.example:80',
    ]
    expect(streamTrackers({ sources })).toEqual(['udp://a.example:1337/announce', 'https://b.example/announce', 'wss://c.example'])
    const many = Array.from({ length: 40 }, (_, i) => `tracker:udp://t${i}.example:80/announce`)
    expect(streamTrackers({ sources: many })).toHaveLength(MAX_ENGINE_TRACKERS)
    expect(streamTrackers({})).toEqual([])
  })

  it('el servidor de Stremio queda como antes; el motor suma tr y f', () => {
    const stream = { infoHash: 'abc', sources: ['tracker:udp://a.example:1337/announce', 'tracker:http://b.example/ann?x=1&y=2'], behaviorHints: { filename: 'Peli (2020) 1080p.mkv' } }
    expect(streamingServerUrl('http://127.0.0.1:11470/', stream)).toBe('http://127.0.0.1:11470/abc/-1')
    const url = new URL(streamingServerUrl(`${ENGINE}/`, stream, true)!)
    expect(url.pathname).toBe('/tok3n/abc/-1')
    expect(url.searchParams.getAll('tr')).toEqual(['udp://a.example:1337/announce', 'http://b.example/ann?x=1&y=2'])
    expect(url.searchParams.get('f')).toBe('Peli (2020) 1080p.mkv')
    expect(url.search).not.toContain('+')
    // Sin trackers ni nombre: sin "?".
    expect(streamingServerUrl(ENGINE, { infoHash: 'abc', fileIdx: 3 }, true)).toBe(`${ENGINE}/abc/3`)
  })

  it('cleanStream deja solo los textos de `sources`', () => {
    expect(cleanStream({ infoHash: 'abc', sources: ['tracker:udp://a:1', 5, null] })?.sources).toEqual(['tracker:udp://a:1'])
    expect(cleanStream({ infoHash: 'abc', sources: 'tracker:udp://a:1' })?.sources).toBeUndefined()
  })
})

describe('normalizeInfoHash', () => {
  it('pasa el hex a minúsculas y el base32 a hex', () => {
    expect(normalizeInfoHash('DD8255ECDC7CA55FB0BBF81323D87062DB1F6D1C')).toBe('dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c')
    expect(normalizeInfoHash('3WBFL3G4PSSV7MF37AJSHWDQMLNR63I4')).toBe('dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c')
  })
  it('otro formato queda como vino', () => {
    expect(normalizeInfoHash('abc')).toBe('abc')
  })
})

import { describe, expect, it } from 'vitest'
import { addonSeeders, formatBytes, parseTorrentStats, STATS_HINT_AFTER_MS, statsView } from './torrentStats'

const MB = 1024 * 1024

describe('parseTorrentStats', () => {
  it('motor de la app de Windows: todos los campos', () => {
    expect(
      parseTorrentStats({
        peers: 3,
        found: 25,
        seeds: 2,
        swarmSeeds: 120,
        swarmLeechers: 40,
        downloadSpeed: 1.5 * MB,
        downloaded: 14 * MB,
        dhtNodes: 180,
        trackers: 12,
        trackersOk: 5,
        engineError: null,
      }),
    ).toEqual({ peers: 3, found: 25, seeds: 2, swarmSeeds: 120, swarmLeechers: 40, speed: 1.5 * MB, downloaded: 14 * MB, dhtNodes: 180, trackers: 12, trackersOk: 5 })
  })
  it('Stremio Service: peers, swarmSize como encontrados, velocidad y bajado', () => {
    expect(parseTorrentStats({ peers: 4, swarmSize: 30, downloadSpeed: 2048, downloaded: 4096, unchoked: 2 })).toEqual({ peers: 4, found: 30, speed: 2048, downloaded: 4096 })
  })
  it('basura o vacío: 0 peers y 0 B/s, sin inventar nada', () => {
    expect(parseTorrentStats(null)).toEqual({ peers: 0, speed: 0 })
    expect(parseTorrentStats({ peers: 'x', downloadSpeed: -3, dhtNodes: NaN })).toEqual({ peers: 0, speed: 0 })
  })
  it('los encontrados nunca son menos que los conectados', () => {
    expect(parseTorrentStats({ peers: 5, found: 2 }).found).toBe(5)
  })
  it('el error del motor llega recortado', () => {
    expect(parseTorrentStats({ peers: 0, engineError: ' listen EACCES ' }).engineError).toBe('listen EACCES')
  })
})

describe('addonSeeders', () => {
  it('lee el 👤 de Torrentio', () => {
    expect(addonSeeders({ title: 'Movie.2024.1080p\n👤 1.234 💾 2.1 GB ⚙️ ThePirateBay' })).toBe(1234)
    expect(addonSeeders({ description: '👤 87 💾 900 MB' })).toBe(87)
  })
  it('sin dato: nada', () => {
    expect(addonSeeders({ title: 'Movie.2024.1080p' })).toBeUndefined()
    expect(addonSeeders(undefined)).toBeUndefined()
  })
})

describe('formatBytes', () => {
  it('KB, MB y GB', () => {
    expect(formatBytes(850 * 1024)).toBe('850 KB')
    expect(formatBytes(14 * MB)).toBe('14 MB')
    expect(formatBytes(1.25 * 1024 * MB)).toMatch(/^1,[23] GB$/)
  })
})

describe('statsView', () => {
  const later = STATS_HINT_AFTER_MS + 1

  it('cargando bien: peers, seeds, velocidad, bajado y red', () => {
    const v = statsView(parseTorrentStats({ peers: 3, found: 25, seeds: 2, swarmSeeds: 120, downloadSpeed: 1.5 * MB, downloaded: 14 * MB, dhtNodes: 180, trackers: 12, trackersOk: 5 }), { elapsedMs: later })
    expect(v.rows).toEqual([
      { label: 'Peers', value: '3 conectados · 25 encontrados' },
      { label: 'Seeds', value: '2 conectados · 120 en total' },
      { label: 'Velocidad', value: '1,5 MB/s' },
      { label: 'Bajado', value: '14 MB' },
      { label: 'Red', value: '180 nodos DHT · 5 de 12 trackers' },
    ])
    expect(v.hint).toBeUndefined()
  })

  it('sin los seeds de los trackers vale el dato del addon', () => {
    const v = statsView(parseTorrentStats({ peers: 0, downloadSpeed: 0 }), { addonSeeds: 87, elapsedMs: 0 })
    expect(v.rows).toContainEqual({ label: 'Seeds', value: '87 según el addon' })
  })

  it('antes de la primera respuesta del motor: solo lo del addon', () => {
    expect(statsView(undefined, { addonSeeds: 87, elapsedMs: 0 })).toEqual({ rows: [{ label: 'Seeds', value: '87 según el addon' }] })
    expect(statsView(undefined, { elapsedMs: 0 })).toEqual({ rows: [] })
  })

  it('singulares', () => {
    const v = statsView(parseTorrentStats({ peers: 1, found: 1, dhtNodes: 1, trackers: 1, trackersOk: 1, downloadSpeed: 0 }), { elapsedMs: 0 })
    expect(v.rows[0]).toEqual({ label: 'Peers', value: '1 conectado' })
    expect(v.rows.at(-1)).toEqual({ label: 'Red', value: '1 nodo DHT · 1 de 1 tracker' })
  })

  describe('por qué no conecta', () => {
    it('los primeros segundos no se explica nada (buscar es normal)', () => {
      expect(statsView(parseTorrentStats({ peers: 0, dhtNodes: 0, trackers: 10, trackersOk: 0 }), { elapsedMs: 3000 }).hint).toBeUndefined()
    })
    it('ni la DHT ni los trackers contestan: la red está bloqueada', () => {
      expect(statsView(parseTorrentStats({ peers: 0, dhtNodes: 0, trackers: 10, trackersOk: 0 }), { elapsedMs: later }).hint).toMatch(/firewall/)
    })
    it('hay encontrados pero nadie conectado', () => {
      expect(statsView(parseTorrentStats({ peers: 0, found: 12, dhtNodes: 90, trackers: 10, trackersOk: 4 }), { elapsedMs: later }).hint).toMatch(/nadie acepta/)
    })
    it('la red anda y no hay nadie: otra fuente', () => {
      expect(statsView(parseTorrentStats({ peers: 0, found: 0, dhtNodes: 90, trackers: 10, trackersOk: 4 }), { elapsedMs: later }).hint).toMatch(/otra fuente/)
    })
    it('con Stremio Service (sin datos de red) no se adivina', () => {
      expect(statsView(parseTorrentStats({ peers: 0, downloadSpeed: 0 }), { elapsedMs: later }).hint).toBeUndefined()
    })
    it('el motor se cayó: se dice aunque recién empiece', () => {
      expect(statsView(parseTorrentStats({ peers: 0, engineError: 'listen EACCES' }), { elapsedMs: 0 }).hint).toMatch(/EACCES/)
    })
  })
})

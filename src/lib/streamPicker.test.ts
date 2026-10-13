import { describe, expect, it } from 'vitest'
import type { LastSource, SourceRules } from './store'
import { hasKeyword, nameKey, parseQuality, pickBest, playable, rankStreams } from './streamPicker'
import type { AddonStreams, InstalledAddon, Stream } from './types'

const addon = (name: string): InstalledAddon => ({
  transportUrl: `https://${name.toLowerCase()}.example/manifest.json`,
  manifest: { id: name, version: '1.0.0', name, resources: ['stream'], types: ['movie', 'series'], catalogs: [] },
})

const A = addon('Uno')
const B = addon('Dos')

const group = (a: InstalledAddon, streams: Stream[]): AddonStreams => ({ addon: a, streams, loading: false })

const rules = (over: Partial<SourceRules> = {}): SourceRules => ({
  mode: 'auto',
  rememberLast: true,
  preferredQuality: '1080p',
  preferKeywords: [],
  excludeKeywords: ['cam', 'hdts'],
  ...over,
})

const s = (name: string, extra: Partial<Stream> = {}): Stream => ({ name, url: `https://cdn.example/${encodeURIComponent(name)}`, ...extra })

describe('parseQuality', () => {
  it('lee la calidad del nombre, título o archivo', () => {
    expect(parseQuality({ name: 'Torrentio\n4K HDR' })).toBe(2160)
    expect(parseQuality({ name: 'X', title: 'Peli.2020.1080p.WEB' })).toBe(1080)
    expect(parseQuality({ name: 'X', behaviorHints: { filename: 'peli.720p.mkv' } })).toBe(720)
    expect(parseQuality({ name: 'X', description: 'SD 480p' })).toBe(480)
    expect(parseQuality({ name: 'X' })).toBeUndefined()
  })
})

describe('hasKeyword', () => {
  it('busca palabras sueltas sin distinguir mayúsculas', () => {
    expect(hasKeyword('Peli 2020 CAM x264', 'cam')).toBe(true)
    expect(hasKeyword('Camp Nowhere 1080p', 'cam')).toBe(false)
    expect(hasKeyword('Audio Latino / Inglés', 'latino')).toBe(true)
    expect(hasKeyword('algo', '')).toBe(false)
  })
})

describe('nameKey', () => {
  it('ignora la calidad y las líneas siguientes', () => {
    expect(nameKey('Torrentio\n4k')).toBe('torrentio')
    expect(nameKey('[RD+] Torrentio 1080p')).toBe('[rd+] torrentio')
  })
})

describe('playable', () => {
  it('usa el servidor local solo para torrents si está configurado', () => {
    expect(playable({ infoHash: 'abc' }, '').url).toBeUndefined()
    expect(playable({ infoHash: 'abc', fileIdx: 2 }, 'http://127.0.0.1:11470/').url).toBe('http://127.0.0.1:11470/abc/2')
    expect(playable({ ytId: 'xyz' }, '').external).toContain('xyz')
  })
})

describe('rankStreams / pickBest', () => {
  it('prefiere la calidad exacta, después la más cercana por debajo y por último la más alta', () => {
    const groups = [group(A, [s('4k'), s('720p'), s('1080p'), s('480p')])]
    expect(rankStreams(groups, rules(), undefined, '').map((r) => r.stream.name)).toEqual(['1080p', '720p', '480p', '4k'])
  })

  it('descarta las palabras excluidas y lo que no se puede reproducir', () => {
    const groups = [group(A, [s('CAM 1080p'), { name: 'torrent 1080p', infoHash: 'abc' }, s('720p')])]
    const best = pickBest(groups, rules(), undefined, '')
    expect(best?.stream.name).toBe('720p')
    expect(rankStreams(groups, rules(), undefined, '')).toHaveLength(1)
  })

  it('suma puntos por las palabras preferidas', () => {
    const groups = [group(A, [s('1080p'), s('1080p Latino')])]
    expect(pickBest(groups, rules({ preferKeywords: ['latino'] }), undefined, '')?.stream.name).toBe('1080p Latino')
  })

  it('en un empate gana el addon que está primero', () => {
    const groups = [group(A, [s('1080p')]), group(B, [s('1080p')])]
    expect(pickBest(groups, rules(), undefined, '')?.addon).toBe(A)
  })

  it('la última fuente le gana a la calidad', () => {
    const last: LastSource = { addonUrl: B.transportUrl, bingeGroup: 'dos|720p', streamName: 'Dos\n720p', at: 0 }
    const groups = [
      group(A, [s('1080p')]),
      group(B, [s('Otro\n1080p'), s('Dos\n720p', { behaviorHints: { bingeGroup: 'dos|720p' } })]),
    ]
    const best = pickBest(groups, rules(), last, '')
    expect(best?.stream.name).toBe('Dos\n720p')
    expect(best?.match).toBe('binge')
  })

  it('sin bingeGroup reconoce la fuente por el nombre', () => {
    const last: LastSource = { addonUrl: B.transportUrl, streamName: 'Dos\n720p', at: 0 }
    const groups = [group(A, [s('1080p')]), group(B, [s('Otro 1080p'), s('Dos\n1080p')])]
    const best = pickBest(groups, rules(), last, '')
    expect(best?.stream.name).toBe('Dos\n1080p')
    expect(best?.match).toBe('name')
  })

  it('no devuelve nada si no hay streams reproducibles', () => {
    expect(pickBest([group(A, [{ name: 'x', infoHash: 'abc' }])], rules(), undefined, '')).toBeUndefined()
    expect(pickBest([], rules(), undefined, '')).toBeUndefined()
  })
})

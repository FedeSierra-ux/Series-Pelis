import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LastSource, SourceRules } from './store'
import {
  analyzeStreams,
  audioLangs,
  lastSourceOf,
  releaseGroup,
  sameLanguage,
  filterReason,
  hasKeyword,
  isHdr,
  looksLikeFilename,
  nameKey,
  needsProxyHeaders,
  parseCodec,
  parseQuality,
  parseSize,
  pickBest,
  playable,
  rankStreams,
  streamKey,
} from './streamPicker'
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
  maxSizeGB: 0,
  excludeCodecs: [],
  hdr: 'allow',
  dedupe: true,
  ...over,
})

afterEach(() => vi.unstubAllGlobals())

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

  it('los streams que piden cabeceras especiales no se reproducen en la app', () => {
    const p = playable({ url: 'https://cdn.example/v.mp4', behaviorHints: { proxyHeaders: { request: { Referer: 'https://x' } } } }, '')
    expect(p.url).toBeUndefined()
    expect(p.external).toBeUndefined()
    expect(p.reason).toContain('reproductor externo')
    // Un mapa vacío no cuenta.
    expect(playable({ url: 'https://cdn.example/v.mp4', behaviorHints: { proxyHeaders: { request: {} } } }, '').url).toBe('https://cdn.example/v.mp4')
    expect(needsProxyHeaders({ url: 'x', behaviorHints: { proxyHeaders: { response: { 'content-type': 'video/mp4' } } } })).toBe(true)
  })

  it('con cabeceras especiales el stream va al grupo de no reproducibles', () => {
    const groups = [group(A, [s('1080p', { behaviorHints: { proxyHeaders: { request: { Origin: 'https://x' } } } }), s('720p')])]
    expect(rankStreams(groups, rules(), undefined, '').map((r) => r.stream.name)).toEqual(['720p'])
  })
})

describe('looksLikeFilename', () => {
  it('distingue nombres de archivo de etiquetas genéricas', () => {
    expect(looksLikeFilename('Peli.2020.1080p.WEB-DL.x264.mkv')).toBe(true)
    expect(looksLikeFilename('Peli.2020.1080p.WEB')).toBe(true)
    expect(looksLikeFilename('Una peli con nombre largo - 1080p WEB-DL')).toBe(true)
    expect(looksLikeFilename('Latino 1080p')).toBe(false)
    expect(looksLikeFilename('Español Latino')).toBe(false)
    expect(looksLikeFilename('1080p · Dual')).toBe(false)
    expect(looksLikeFilename('')).toBe(false)
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

describe('parseSize / parseCodec / isHdr', () => {
  it('lee el tamaño del texto o del addon', () => {
    expect(parseSize({ name: 'X', title: 'Peli.2020.1080p\n👤 12 💾 1.4 GB ⚙️ TPB' })).toBeCloseTo(1.4e9)
    expect(parseSize({ name: 'X', title: '1400 MB' })).toBe(1.4e9)
    expect(parseSize({ name: 'X', title: '2,5 GB' })).toBe(2.5e9)
    expect(parseSize({ name: 'X', behaviorHints: { videoSize: 123 } })).toBe(123)
    expect(parseSize({ name: 'X', title: 'sin datos' })).toBeUndefined()
  })

  it('reconoce HEVC, AV1 y HDR', () => {
    expect(parseCodec({ name: 'Peli.2160p.x265' })).toBe('hevc')
    expect(parseCodec({ name: 'Peli 1080p H.265' })).toBe('hevc')
    expect(parseCodec({ name: 'Peli 1080p HEVC' })).toBe('hevc')
    expect(parseCodec({ name: 'Peli.1080p.AV1.Opus' })).toBe('av1')
    expect(parseCodec({ name: 'Peli 1080p x264' })).toBeUndefined()
    expect(isHdr({ name: '4K HDR10+' })).toBe(true)
    expect(isHdr({ name: 'Peli.2160p.DV.HEVC' })).toBe(true)
    expect(isHdr({ name: 'Dolby Vision' })).toBe(true)
    expect(isHdr({ name: 'Peli DVDRip' })).toBe(false)
    expect(isHdr({ name: 'Peli 1080p SDR' })).toBe(false)
  })
})

describe('filtros avanzados', () => {
  it('con los valores por defecto no se oculta nada nuevo', () => {
    const streams = [s('4K HDR x265 💾 40 GB'), s('1080p AV1 💾 2 GB'), s('720p')]
    expect(rankStreams([group(A, streams)], rules(), undefined, '')).toHaveLength(3)
  })

  it('tamaño máximo: oculta los más pesados y deja los de tamaño desconocido', () => {
    const groups = [group(A, [s('1080p 💾 12 GB'), s('1080p 💾 3.5 GB'), s('1080p sin tamaño')])]
    const r = rules({ maxSizeGB: 5 })
    const { ranked, hidden } = analyzeStreams(groups, r, undefined, '')
    expect(ranked.map((x) => x.stream.name)).toEqual(['1080p 💾 3.5 GB', '1080p sin tamaño'])
    expect(hidden.get(streamKey(0, 0))).toBe('Pesa más de 5 GB')
    expect(pickBest(groups, r, undefined, '')?.stream.name).toBe('1080p 💾 3.5 GB')
  })

  it('códecs excluidos', () => {
    const groups = [group(A, [s('1080p x265'), s('1080p AV1'), s('720p x264')])]
    expect(pickBest(groups, rules({ excludeCodecs: ['hevc', 'av1'] }), undefined, '')?.stream.name).toBe('720p x264')
    expect(filterReason(s('1080p HEVC'), rules({ excludeCodecs: ['hevc'] }))).toBe('HEVC/x265')
    expect(filterReason(s('1080p HEVC'), rules({ excludeCodecs: ['av1'] }))).toBeUndefined()
  })

  it('HDR: permitir, preferir o excluir', () => {
    const groups = [group(A, [s('1080p'), s('1080p HDR')])]
    expect(pickBest(groups, rules(), undefined, '')?.stream.name).toBe('1080p')
    expect(pickBest(groups, rules({ hdr: 'prefer' }), undefined, '')?.stream.name).toBe('1080p HDR')
    const { ranked, hidden } = analyzeStreams(groups, rules({ hdr: 'exclude' }), undefined, '')
    expect(ranked.map((x) => x.stream.name)).toEqual(['1080p'])
    expect(hidden.get(streamKey(0, 1))).toBe('HDR / Dolby Vision')
  })

  it('las palabras excluidas también quedan como ocultas', () => {
    const { hidden } = analyzeStreams([group(A, [s('CAM 1080p'), s('720p')])], rules(), undefined, '')
    expect(hidden.get(streamKey(0, 0))).toBe('Palabra descartada: cam')
  })

  it('saca los repetidos: mismo torrent, mismo enlace o mismo archivo y tamaño', () => {
    const groups = [
      group(A, [
        { name: 'Uno 1080p', title: 'Peli.2020.1080p.WEB\n💾 2 GB', url: 'https://a.example/1' },
        { name: 'Uno 720p', infoHash: 'ABC', fileIdx: 1 },
      ]),
      group(B, [
        { name: 'Dos 1080p', title: 'Peli.2020.1080p.WEB\n💾 2.0 GB', url: 'https://b.example/2' },
        { name: 'Dos 720p', infoHash: 'abc', fileIdx: 1 },
        { name: 'Dos 1080p', url: 'https://a.example/1' },
        { name: 'Dos 480p', title: 'Otra.cosa.480p\n💾 2 GB', url: 'https://b.example/3' },
      ]),
    ]
    const { ranked, hidden } = analyzeStreams(groups, rules(), undefined, '')
    expect(ranked.map((x) => x.stream.url)).toEqual(['https://a.example/1', 'https://b.example/3'])
    expect([...hidden.keys()].sort()).toEqual([streamKey(1, 0), streamKey(1, 1), streamKey(1, 2)])
    expect(hidden.get(streamKey(1, 0))).toBe('Repetido')
    // Sin la opción, quedan todos.
    expect(analyzeStreams(groups, rules({ dedupe: false }), undefined, '').hidden.size).toBe(0)
  })

  it('dos archivos distintos con etiqueta genérica y el mismo tamaño no son repetidos', () => {
    const groups = [
      group(A, [{ name: 'Uno 1080p', title: 'Latino 1080p\n💾 2 GB', url: 'https://a.example/1' }]),
      group(B, [
        { name: 'Dos 1080p', title: 'Latino 1080p\n💾 2 GB', url: 'https://b.example/2' },
        // Con nombre de archivo del addon sí se reconoce el repetido.
        { name: 'Dos 1080p', title: 'Latino 1080p\n💾 2 GB', url: 'https://b.example/3', behaviorHints: { filename: 'Peli.2020.1080p.mkv' } },
        { name: 'Dos 1080p', title: 'Latino 1080p\n💾 2 GB', url: 'https://b.example/4', behaviorHints: { filename: 'Peli.2020.1080p.mkv' } },
      ]),
    ]
    const { ranked, hidden } = analyzeStreams(groups, rules(), undefined, '')
    expect(ranked.map((x) => x.stream.url)).toEqual(['https://a.example/1', 'https://b.example/2', 'https://b.example/3'])
    expect([...hidden.keys()]).toEqual([streamKey(1, 2)])
  })

  it('entre dos repetidos queda el que se reproduce mejor', () => {
    const groups = [group(A, [{ name: 'torrent 1080p', infoHash: 'abc' }]), group(B, [{ name: 'debrid 1080p', infoHash: 'abc', url: 'https://b.example/x' }])]
    const { ranked, hidden } = analyzeStreams(groups, rules(), undefined, '')
    expect(ranked[0]?.addon).toBe(B)
    expect(hidden.get(streamKey(0, 0))).toBe('Repetido')
  })
})

describe('calidad sin tope por conexión', () => {
  it('con una conexión lenta se sigue eligiendo la calidad preferida', () => {
    vi.stubGlobal('navigator', { userAgent: 'test', connection: { effectiveType: '3g', saveData: true, downlink: 0.5 } })
    const groups = [group(A, [s('720p'), s('1080p'), s('480p')])]
    expect(pickBest(groups, rules(), undefined, '')?.stream.name).toBe('1080p')
  })
})

describe('siguiente episodio en el mismo idioma (auditoría #7)', () => {
  const TORRENTIO = addon('Torrentio')
  const torrentio = (quality: string, title: string, url = `https://v/${quality}-${title.length}`): Stream => ({
    name: `[TB+] Torrentio\n${quality}`,
    title,
    url,
  })
  const latino = torrentio('720p', 'Serie.S01E02.720p.WEB-DL.x264-GRP.mkv\n👤 30 💾 1.1 GB\n🇲🇽 Latino')
  const ingles = torrentio('1080p', 'Serie.S01E02.1080p.WEB-DL.x264-OTRO.mkv\n👤 300 💾 2.1 GB')
  const castellano = torrentio('1080p', 'Serie.S01E02.1080p.Castellano.mkv\n🇪🇸')

  it('audioLangs reconoce banderas y palabras, sin confundir títulos comunes', () => {
    expect([...audioLangs('🇲🇽 Latino')]).toEqual(['lat'])
    expect([...audioLangs('Dual Audio Español Latino / Inglés')].sort()).toEqual(['eng', 'lat', 'multi'])
    expect([...audioLangs('Castellano 🇪🇸')]).toEqual(['cas'])
    expect([...audioLangs('Español')]).toEqual(['spa'])
    expect([...audioLangs('Amor.Por.Siempre.2020.1080p')]).toEqual([])
    expect([...audioLangs('Serie.S01E02.1080p.WEB-DL.x264')]).toEqual([])
  })

  it('sameLanguage: "Español" sin variante sirve para latino; sin datos de antes, no opina', () => {
    expect(sameLanguage(new Set(['lat']), new Set(['lat', 'eng', 'multi']))).toBe(true)
    expect(sameLanguage(new Set(['lat']), new Set(['spa']))).toBe(true)
    expect(sameLanguage(new Set(['lat']), new Set())).toBe(false)
    expect(sameLanguage(new Set(['lat']), new Set(['cas']))).toBe(false)
    expect(sameLanguage(new Set(), new Set(['eng']))).toBeUndefined()
  })

  it('venías en latino 720p: el siguiente sigue en latino aunque haya inglés o castellano en 1080p', () => {
    const last = lastSourceOf(TORRENTIO.transportUrl, latino)
    expect(last.streamTitle).toContain('Latino')
    const nextLatino = torrentio('720p', 'Serie.S01E03.720p.WEB-DL.x264-GRP.mkv\n🇲🇽 Latino')
    const groups = [group(TORRENTIO, [ingles, castellano, nextLatino])]
    const best = pickBest(groups, rules(), last, '')
    expect(best?.stream).toBe(nextLatino)
  })

  it('si no hay latino, el de otro idioma no cuenta como "la misma fuente" (en manual no arranca solo)', () => {
    const last = lastSourceOf(TORRENTIO.transportUrl, latino)
    const ranked = rankStreams([group(TORRENTIO, [ingles])], rules({ mode: 'manual' }), last, '')
    expect(ranked[0].match).toBe('none')
  })

  it('latino de otro addon le gana a otro idioma del mismo addon', () => {
    const last = lastSourceOf(TORRENTIO.transportUrl, latino)
    const otro = { name: 'Otro addon', title: 'Serie S01E03 Latino 720p', url: 'https://v/otro' }
    const best = pickBest([group(TORRENTIO, [ingles]), group(B, [otro])], rules(), last, '')
    expect(best?.stream).toBe(otro)
  })

  it('a igual idioma, prefiere el mismo grupo del release', () => {
    expect(releaseGroup('Serie.S01E02.720p.WEB-DL.x264-GRP.mkv')).toBe('grp')
    expect(releaseGroup('Serie 1080p WEB-DL')).toBeUndefined()
    const last = lastSourceOf(TORRENTIO.transportUrl, latino)
    const mismo = torrentio('720p', 'Serie.S01E03.720p.WEB-DL.x264-GRP.mkv\n🇲🇽 Latino', 'https://v/mismo')
    const otro = torrentio('720p', 'Serie.S01E03.720p.WEB-DL.x264-XYZ.mkv\n🇲🇽 Latino', 'https://v/otro')
    expect(pickBest([group(TORRENTIO, [otro, mismo])], rules(), last, '')?.stream).toBe(mismo)
  })

  it('una fuente guardada sin título (versiones viejas) se comporta como antes', () => {
    const last: LastSource = { addonUrl: TORRENTIO.transportUrl, streamName: '[TB+] Torrentio\n720p', at: 0 }
    const best = pickBest([group(TORRENTIO, [latino, ingles])], rules(), last, '')
    expect(best?.match).toBe('name')
    expect(best?.stream).toBe(ingles)
  })

  it('un grupo con streams que no son una lista no rompe el análisis', () => {
    const broken = { addon: B, streams: { error: 'x' } as unknown as Stream[], loading: false }
    expect(rankStreams([broken, group(A, [s('1080p')])], rules(), undefined, '')).toHaveLength(1)
  })
})

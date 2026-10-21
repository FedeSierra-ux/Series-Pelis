import { describe, expect, it } from 'vitest'
import {
  canPlayDirect,
  createBody,
  formatSpeed,
  hlsUrl,
  isPcBrowser,
  looksLikeStremio,
  mediaCapsFrom,
  peerSources,
  serverPlan,
  splitServerUrl,
  torrentProgress,
  type MediaCaps,
} from './stremioServer'

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
const BASE = 'http://127.0.0.1:11470'

/** Lo que dice `canPlayType` en un Chrome de escritorio (sin HEVC ni AC3). */
const CHROME_MIMES = ['video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="vp9"', 'audio/mp4; codecs="mp4a.40.2"', 'audio/mp4; codecs="mp3"', 'audio/mp4; codecs="opus"']
const chrome = mediaCapsFrom({ canPlay: (m) => CHROME_MIMES.includes(m), chrome: true, firefox: false })
const firefox = mediaCapsFrom({ canPlay: (m) => CHROME_MIMES.includes(m), chrome: false, firefox: true })

describe('isPcBrowser', () => {
  it('solo compus fuera de la app y sin modo TV', () => {
    expect(isPcBrowser({ os: 'windows', tv: false, tvMode: false, native: false })).toBe(true)
    expect(isPcBrowser({ os: 'mac', tv: false, tvMode: false, native: false })).toBe(true)
    expect(isPcBrowser({ os: 'linux', tv: false, tvMode: false, native: false })).toBe(true)
    expect(isPcBrowser({ os: 'android', tv: false, tvMode: false, native: false })).toBe(false)
    expect(isPcBrowser({ os: 'ios', tv: false, tvMode: false, native: false })).toBe(false)
    expect(isPcBrowser({ os: 'linux', tv: true, tvMode: true, native: false })).toBe(false)
    expect(isPcBrowser({ os: 'windows', tv: false, tvMode: true, native: false })).toBe(false)
    expect(isPcBrowser({ os: 'windows', tv: false, tvMode: false, native: true })).toBe(false)
  })
})

describe('splitServerUrl', () => {
  it('separa servidor, hash y archivo', () => {
    expect(splitServerUrl(`${BASE}/${HASH}/3`)).toEqual({ base: BASE, hash: HASH, fileIdx: 3 })
    expect(splitServerUrl(`http://192.168.0.5:11470/${HASH.toUpperCase()}/0?tr=x`)).toEqual({ base: 'http://192.168.0.5:11470', hash: HASH, fileIdx: 0 })
  })
  it('-1 = archivo sin saber', () => {
    expect(splitServerUrl(`${BASE}/${HASH}/-1`)).toEqual({ base: BASE, hash: HASH, fileIdx: undefined })
  })
  it('otra URL no', () => {
    expect(splitServerUrl('https://torbox.app/file.mkv')).toBeUndefined()
    expect(splitServerUrl(`${BASE}/hlsv2/abc/master.m3u8`)).toBeUndefined()
  })
})

describe('createBody', () => {
  it('con el archivo sabido no adivina; DHT primero y trackers sin repetir', () => {
    const body = createBody(HASH, 2, ['tracker:udp://a:1/announce', 'udp://a:1/announce', 'dht:' + HASH, 'tracker:udp://b:2'])
    expect(body).toEqual({
      torrent: { infoHash: HASH },
      peerSearch: { sources: [`dht:${HASH}`, 'tracker:udp://a:1/announce', 'tracker:udp://b:2'], min: 40, max: 200 },
      guessFileIdx: false,
    })
  })
  it('sin el archivo lo adivina con temporada y episodio', () => {
    expect(createBody(HASH, undefined, [], { season: 2, episode: 5 }).guessFileIdx).toEqual({ season: 2, episode: 5 })
    expect(createBody(HASH, undefined).guessFileIdx).toEqual({})
  })
  it('peerSources ignora basura', () => {
    expect(peerSources(HASH, [3, '', null, ' tracker:http://t/ann '])).toEqual([`dht:${HASH}`, 'tracker:http://t/ann'])
  })
})

describe('mediaCapsFrom', () => {
  it('Chrome: MKV, H.264 siempre, estéreo', () => {
    expect(chrome).toEqual({ formats: ['mp4', 'matroska,webm'], videoCodecs: ['h264', 'vp9'], audioCodecs: ['aac', 'mp3', 'opus'], maxAudioChannels: 2 })
  })
  it('Firefox: solo MP4 y hasta 6 canales', () => {
    expect(firefox.formats).toEqual(['mp4'])
    expect(firefox.maxAudioChannels).toBe(6)
  })
  it('HEVC suma los dos nombres', () => {
    const caps = mediaCapsFrom({ canPlay: () => true, chrome: false, firefox: false })
    expect(caps.videoCodecs).toEqual(['h264', 'h265', 'hevc', 'vp8', 'vp9'])
  })
})

describe('canPlayDirect', () => {
  const v = (codec: string) => ({ track: 'video', codec })
  const a = (codec: string, channels = 2) => ({ track: 'audio', codec, channels })
  it('MKV H.264 + AAC estéreo en Chrome: directo', () => {
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('aac')] }, chrome)).toBe(true)
  })
  it('los subtítulos dentro del archivo no obligan a convertir', () => {
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('aac'), { track: 'subtitle', codec: 'subrip' }] }, chrome)).toBe(true)
  })
  it('x265, AC3, 5.1 o dos audios: convertir', () => {
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('hevc'), a('aac')] }, chrome)).toBe(false)
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('ac3')] }, chrome)).toBe(false)
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('aac', 6)] }, chrome)).toBe(false)
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('aac'), a('aac')] }, chrome)).toBe(false)
  })
  it('MKV en Firefox: convertir; MP4 sí', () => {
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [v('h264'), a('aac')] }, firefox)).toBe(false)
    expect(canPlayDirect({ format: { name: 'mov,mp4,m4a,3gp,3g2,mj2' }, streams: [v('h264'), a('aac', 6)] }, firefox)).toBe(true)
  })
  it('respuesta rara: convertir', () => {
    expect(canPlayDirect({}, chrome)).toBe(false)
    expect(canPlayDirect({ format: { name: 'matroska,webm' }, streams: [] }, chrome)).toBe(false)
  })
})

describe('hlsUrl', () => {
  it('arma el master con los códecs del navegador', () => {
    const url = new URL(hlsUrl(`${BASE}/`, `${BASE}/${HASH}/0`, chrome, 'ab12'))
    expect(url.origin + url.pathname).toBe(`${BASE}/hlsv2/ab12/master.m3u8`)
    expect(url.searchParams.get('mediaURL')).toBe(`${BASE}/${HASH}/0`)
    expect(url.searchParams.getAll('videoCodecs')).toEqual(['h264', 'vp9'])
    expect(url.searchParams.getAll('audioCodecs')).toEqual(['aac', 'mp3', 'opus'])
    expect(url.searchParams.get('maxAudioChannels')).toBe('2')
  })
  it('sin audio conocido pide AAC', () => {
    const caps: MediaCaps = { formats: ['mp4'], videoCodecs: ['h264'], audioCodecs: [], maxAudioChannels: 2 }
    expect(new URL(hlsUrl(BASE, 'http://x/y', caps, 'id')).searchParams.getAll('audioCodecs')).toEqual(['aac'])
  })
})

describe('serverPlan', () => {
  it('torrent del servidor de Stremio', () => {
    expect(serverPlan({ infoHash: HASH, sources: ['tracker:udp://a'] }, `${BASE}/${HASH}/1`)).toEqual({
      kind: 'torrent',
      base: BASE,
      hash: HASH,
      fileIdx: 1,
      sources: ['tracker:udp://a'],
    })
  })
  it('link MKV con Stremio Service en la compu: ver el formato', () => {
    const s = { url: 'https://torbox/file.mkv', behaviorHints: { notWebReady: true } }
    expect(serverPlan(s, s.url, BASE)).toEqual({ kind: 'direct', base: BASE, mediaUrl: s.url })
    expect(serverPlan(s, s.url)).toBeUndefined()
    expect(serverPlan({ url: 'https://x/a.mp4' }, 'https://x/a.mp4', BASE)).toBeUndefined()
  })
  it('torrent sin URL de servidor (no hay con qué abrirlo): nada', () => {
    expect(serverPlan({ infoHash: HASH }, '')).toBeUndefined()
  })
})

describe('torrentProgress / formatSpeed / looksLikeStremio', () => {
  it('stats.json', () => {
    expect(torrentProgress({ peers: 12, downloadSpeed: 1048576 })).toEqual({ peers: 12, speed: 1048576 })
    expect(torrentProgress(null)).toEqual({ peers: 0, speed: 0 })
    expect(torrentProgress({ peers: 'x', downloadSpeed: -3 })).toEqual({ peers: 0, speed: 0 })
  })
  it('velocidad', () => {
    expect(formatSpeed(850 * 1024)).toBe('850 KB/s')
    expect(formatSpeed(1.25 * 1024 * 1024)).toMatch(/^1,[23] MB\/s$/)
  })
  it('respuesta de /settings', () => {
    expect(looksLikeStremio({ values: { serverVersion: '4.20.8' } })).toBe(true)
    expect(looksLikeStremio({ options: [] })).toBe(true)
    expect(looksLikeStremio({ hello: 1 })).toBe(false)
    expect(looksLikeStremio(null)).toBe(false)
  })
})

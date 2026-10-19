import { describe, expect, it } from 'vitest'
import {
  debridFailureText,
  debridLinkOf,
  failureFromLocation,
  isDebridDownload,
  isTorrentio,
  looksLikeStatusVideo,
  parseDebridLink,
  plainTorrentioUrl,
  torrentStreamFor,
  torrentTwin,
} from './debrid'
import type { Stream } from './types'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const resolve = (idx: string, service = 'torbox') =>
  `https://torrentio.strem.fun/resolve/${service}/KEY123/${HASH.toUpperCase()}/The.Movie.2024.1080p.mkv/${idx}/The.Movie.2024.1080p.mkv`

describe('parseDebridLink', () => {
  it('saca servicio, hash (en minúsculas) e índice del link de Torrentio', () => {
    expect(parseDebridLink(resolve('3'))).toEqual({ service: 'torbox', infoHash: HASH, fileIdx: 3 })
  })

  it('sin índice ("undefined") deja el índice sin saber', () => {
    expect(parseDebridLink(resolve('undefined'))).toEqual({ service: 'torbox', infoHash: HASH, fileIdx: undefined })
  })

  it('anda sin el nombre del archivo al final', () => {
    expect(parseDebridLink(`https://torrentio.strem.fun/resolve/realdebrid/K/${HASH}/x/0`)).toEqual({ service: 'realdebrid', infoHash: HASH, fileIdx: 0 })
  })

  it('rechaza lo que no es un link de debrid de Torrentio', () => {
    expect(parseDebridLink(undefined)).toBeUndefined()
    expect(parseDebridLink('no es una url')).toBeUndefined()
    expect(parseDebridLink('https://cdn.example/video.mkv')).toBeUndefined()
    expect(parseDebridLink(`https://x/resolve/torbox/K/${HASH.slice(1)}/x/0/f.mkv`)).toBeUndefined()
    expect(parseDebridLink(`magnet:?xt=urn:btih:${HASH}`)).toBeUndefined()
  })
})

describe('isDebridDownload', () => {
  it('reconoce "[TB download]" con link de Torrentio', () => {
    expect(isDebridDownload({ name: '[TB download] Torrentio\n1080p', url: resolve('0') })).toBe(true)
    expect(isDebridDownload({ name: '[TB+] Torrentio\n1080p', url: resolve('0') })).toBe(false)
    expect(isDebridDownload({ name: '[TB download] Torrentio', url: 'https://cdn.example/a.mkv' })).toBe(false)
  })
})

describe('isTorrentio', () => {
  it('por el id del manifest, con sus variantes', () => {
    expect(isTorrentio({ manifest: { id: 'com.stremio.torrentio.addon' } as never })).toBe(true)
    expect(isTorrentio({ manifest: { id: 'com.stremio.torrentio.lite.addon' } as never })).toBe(true)
    expect(isTorrentio({ manifest: { id: 'comet.elfhosted.com' } as never })).toBe(false)
  })
})

describe('plainTorrentioUrl', () => {
  it('saca la key y las opciones de debrid, y deja el resto de la configuración', () => {
    expect(plainTorrentioUrl('https://torrentio.strem.fun/providers=yts,eztv|language=latino|torbox=KEY|debridoptions=nocatalog/manifest.json')).toBe(
      'https://torrentio.strem.fun/providers=yts,eztv|language=latino/manifest.json',
    )
  })

  it('si solo tenía el debrid, queda el Torrentio de fábrica', () => {
    expect(plainTorrentioUrl('https://torrentio.strem.fun/torbox=KEY/manifest.json')).toBe('https://torrentio.strem.fun/manifest.json')
  })

  it('acepta el separador codificado (%7C)', () => {
    expect(plainTorrentioUrl('https://torrentio.strem.fun/sort=quality%7Ctorbox=KEY/manifest.json')).toBe('https://torrentio.strem.fun/sort=quality/manifest.json')
  })

  it('sin debrid o sin configuración no hay nada que sacar', () => {
    expect(plainTorrentioUrl('https://torrentio.strem.fun/providers=yts/manifest.json')).toBeUndefined()
    expect(plainTorrentioUrl('https://torrentio.strem.fun/manifest.json')).toBeUndefined()
    expect(plainTorrentioUrl('basura')).toBeUndefined()
  })
})

describe('torrentTwin / torrentStreamFor', () => {
  const plain: Stream[] = [
    { infoHash: 'f'.repeat(40), fileIdx: 3, name: 'otro' },
    { infoHash: HASH.toUpperCase(), fileIdx: 1, name: 'mismo hash, otro archivo' },
    { infoHash: HASH, fileIdx: 3, name: 'Torrentio\n1080p', sources: ['tracker:udp://t.example:1337/announce'], behaviorHints: { filename: 'e3.mkv' } },
  ]

  it('cruza solo por hash exacto y por archivo', () => {
    expect(torrentTwin({ service: 'torbox', infoHash: HASH, fileIdx: 3 }, plain)?.name).toBe('Torrentio\n1080p')
    expect(torrentTwin({ service: 'torbox', infoHash: HASH }, plain)?.name).toBe('mismo hash, otro archivo')
    expect(torrentTwin({ service: 'torbox', infoHash: 'e'.repeat(40) }, plain)).toBeUndefined()
  })

  it('arma el torrent con los trackers del gemelo y sin la marca del debrid', () => {
    const debrid: Stream = { name: '[TB download] Torrentio\n1080p', title: 'The.Movie', url: resolve('3'), behaviorHints: { bingeGroup: 'torrentio|1080p' } }
    const link = parseDebridLink(debrid.url)!
    expect(torrentStreamFor(debrid, link, plain[2])).toEqual({
      infoHash: HASH,
      fileIdx: 3,
      sources: ['tracker:udp://t.example:1337/announce'],
      name: 'Torrentio\n1080p',
      title: 'The.Movie',
      behaviorHints: { bingeGroup: 'torrentio|1080p', filename: 'e3.mkv', videoSize: undefined },
    })
  })

  it('sin gemelo usa lo que dice el link', () => {
    const debrid: Stream = { name: '[TB+] Torrentio\n4k', url: resolve('undefined') }
    expect(torrentStreamFor(debrid, parseDebridLink(debrid.url)!)).toMatchObject({ infoHash: HASH, fileIdx: undefined, sources: undefined, name: 'Torrentio\n4k' })
  })
})

describe('video de aviso', () => {
  it('35 s o menos es un aviso; una peli no', () => {
    expect(looksLikeStatusVideo(30)).toBe(true)
    expect(looksLikeStatusVideo(35)).toBe(true)
    expect(looksLikeStatusVideo(36)).toBe(false)
    expect(looksLikeStatusVideo(5400)).toBe(false)
    expect(looksLikeStatusVideo(0)).toBe(false)
    expect(looksLikeStatusVideo(NaN)).toBe(false)
    expect(looksLikeStatusVideo(Infinity)).toBe(false)
  })

  it('el motivo sale del nombre del video', () => {
    expect(failureFromLocation('https://torrentio.strem.fun/videos/downloading_v3.mp4')).toBe('downloading')
    expect(failureFromLocation('/videos/limits_exceeded_v2.mp4')).toBe('limits')
    expect(failureFromLocation('/videos/failed_access_v3.mp4')).toBe('access')
    expect(failureFromLocation('/videos/blocked_access_v2.mp4')).toBe('access')
    expect(failureFromLocation('/videos/download_failed_v3.mp4')).toBe('failed')
    expect(failureFromLocation('https://api.torbox.app/v1/api/torrents/requestdl')).toBe('unknown')
    expect(failureFromLocation(undefined)).toBe('unknown')
    expect(debridFailureText('limits')).toMatch(/límite/)
  })
})

describe('debridLinkOf', () => {
  it('solo cuando se reproduce el link del propio stream (no el torrent armado a partir de él)', () => {
    const url = resolve('2')
    expect(debridLinkOf({ stream: { url }, playUrl: url })?.fileIdx).toBe(2)
    expect(debridLinkOf({ stream: { infoHash: HASH, fileIdx: 2 }, playUrl: `http://127.0.0.1:11470/${HASH}/2` })).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { formatSize, sourceCounts, streamFacts } from './streamFacts'
import type { Stream } from './types'

describe('streamFacts', () => {
  it('Torrentio con Real-Debrid en caché: 4K, Dolby Vision, Atmos, varios idiomas', () => {
    const s: Stream = {
      name: '[RD+] Torrentio\n4k DV | HDR',
      title: 'The.Matrix.1999.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.TrueHD.Atmos.7.1-FGT\n👤 182 💾 61.2 GB ⚙️ RARBG\nMulti Audio / 🇬🇧 / 🇪🇸 / 🇲🇽',
      url: 'https://cdn.example/1.mkv',
    }
    expect(streamFacts(s, 'Torrentio')).toEqual({
      quality: '4K',
      hdr: 'Dolby Vision',
      audio: 'Atmos',
      lang: 'Varios idiomas',
      latino: false,
      size: '61,2 GB',
      service: 'Real-Debrid',
      state: 'listo para ver',
      file: 'The.Matrix.1999.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.TrueHD.Atmos.7.1-FGT',
    })
  })

  it('latino, 5.1 y "tiene que descargarse"', () => {
    const latino = streamFacts({ name: '[RD+] Torrentio\n1080p', title: 'X.1080p.WEB-DL.DDP5.1.H.264.LATINO-NTb\n💾 3.1 GB\n🇲🇽 Latino', url: 'u' })
    expect(latino).toMatchObject({ quality: '1080p', audio: '5.1', lang: 'Latino', latino: true, size: '3,1 GB' })
    expect(latino.hdr).toBeUndefined()
    const dl = streamFacts({ name: '[RD download] Torrentio\n720p', title: 'X.720p.BRRip.x264.AAC-YTS\n💾 1.1 GB', url: 'u' })
    expect(dl).toMatchObject({ quality: '720p', service: 'Real-Debrid', state: 'tiene que descargarse' })
    expect(dl.audio).toBeUndefined()
    expect(dl.lang).toBeUndefined()
  })

  it('castellano (bandera de España) no es latino', () => {
    expect(streamFacts({ name: 'Torrentio', title: 'X.1080p.DTS-HD.MA.5.1\n🇬🇧 / 🇪🇸', url: 'u' })).toMatchObject({ lang: 'Castellano', latino: false, audio: '5.1' })
  })

  it('TorBox de Comet: servicio del nombre, sin el emoji del archivo', () => {
    const f = streamFacts({ name: 'Comet | TorBox\n⚡ 2160p', description: '🎞️ tt0133093 2160p HDR10+\n💾 18.9 GB · 🔊 Atmos · 🌐 Multi', url: 'u' })
    expect(f).toMatchObject({ quality: '4K', hdr: 'HDR', audio: 'Atmos', lang: 'Varios idiomas', service: 'TorBox', state: 'listo para ver', file: 'tt0133093 2160p HDR10+' })
  })

  it('torrent sin debrid y fuente sin datos', () => {
    expect(streamFacts({ name: 'Torrentio\n1080p', title: 'X.1080p.HDTV', infoHash: 'a'.repeat(40) }, 'Torrentio')).toMatchObject({
      service: 'Torrent',
      state: 'sin debrid',
    })
    const bare = streamFacts({ name: 'Tráiler', ytId: 'abc' }, 'YouTube')
    expect(bare).toMatchObject({ service: 'YouTube', latino: false })
    expect(bare.quality ?? bare.file ?? bare.state).toBeUndefined()
  })

  it('no confunde un número de episodio con canales de audio', () => {
    expect(streamFacts({ name: 'A', title: 'Show.S01E05.1080p.WEB', url: 'u' }).audio).toBeUndefined()
  })
})

describe('formatSize', () => {
  it('GB con coma y MB enteros', () => {
    expect(formatSize(12.4e9)).toBe('12,4 GB')
    expect(formatSize(2e9)).toBe('2 GB')
    expect(formatSize(900e6)).toBe('900 MB')
  })
})

describe('sourceCounts', () => {
  it('cuenta las que sirven y aparte torrents y ocultas', () => {
    expect(sourceCounts({ ready: 6, torrents: 2, hidden: 1 })).toEqual({
      lead: '6 listas para ver',
      rest: ['2 torrents sin debrid', '1 oculta por tus filtros'],
    })
    expect(sourceCounts({ ready: 1, torrents: 1, hidden: 3 })).toEqual({ lead: '1 lista para ver', rest: ['1 torrent sin debrid', '3 ocultas por tus filtros'] })
    expect(sourceCounts({ ready: 0, torrents: 0, hidden: 0 })).toEqual({ lead: 'Ninguna lista para ver', rest: [] })
  })
})

import { describe, expect, it } from 'vitest'
import { channelInitials, parseLiveChannels, stepChannel } from './liveTv'

const M3U = `#EXTM3U
#EXTINF:-1 tvg-id="Telefe.ar@SD" tvg-logo="https://example.com/telefe.png" group-title="General",Telefe (1080p)
https://example.com/telefe/playlist.m3u8
#EXTINF:-1 tvg-id="Canal26.ar@SD" group-title="News",Canal 26 (Argentina) (1080p)
https://example.com/c26.m3u8
#EXTINF:-1 tvg-id="ESPN.ar@SD" group-title="Sports",ESPN Latin America Argentina
https://example.com/espn.m3u8
#EXTINF:-1 tvg-id="Showsport.ar@SD" group-title="Sports",Canal Showsport (720p)
https://example.com/showsport.m3u8
#EXTINF:-1 tvg-id="La100.ar@SD" group-title="Music",La 100 (1080p)
https://example.com/la100.m3u8
#EXTINF:-1 tvg-id="Pakapaka.ar@SD" group-title="Kids",Pakapaka (1080p)
https://example.com/paka.m3u8
#EXTINF:-1 tvg-id="TN.ar@SD" http-referrer="https://tn.com.ar/" group-title="News",TN (1080p)
https://example.com/tn.m3u8
#EXTINF:-1 tvg-id="ElTrece.ar@SD" group-title="General",El Trece (1080p)
http://15.0.0.1:8080/eltrece/index.m3u8
#EXTINF:-1 tvg-id="Canal8SanJuan.ar@SD" group-title="Undefined",Canal 8 San Juan (720p) [Not 24/7]
https://example.com/c8.m3u8
#EXTINF:-1 tvg-id="TelefeRosario.ar@SD" group-title="Undefined",Telefe Rosario (720p) [Geo-blocked]
#EXTVLCOPT:http-user-agent=Mozilla
https://example.com/rosario.m3u8
`

describe('parseLiveChannels', () => {
  const secure = parseLiveChannels(M3U, { secure: true })

  it('deja aire, noticias, deportes y música, sin cable pago ni otras categorías', () => {
    expect(secure.map((c) => c.name)).toEqual([
      'Telefe',
      'Canal 26 (Argentina)',
      'Canal Showsport',
      'La 100',
      'Canal 8 San Juan',
      'Telefe Rosario',
    ])
    expect(secure.map((c) => c.category)).toEqual(['aire', 'noticias', 'deportes', 'musica', 'aire', 'aire'])
  })

  it('descarta los que piden Referer y, en https, los http://', () => {
    expect(secure.some((c) => c.name === 'TN')).toBe(false)
    expect(secure.some((c) => c.name === 'El Trece')).toBe(false)
    expect(parseLiveChannels(M3U, { secure: false }).some((c) => c.name === 'El Trece')).toBe(true)
  })

  it('separa calidad y avisos del nombre y numera en orden', () => {
    expect(secure[0]).toMatchObject({ id: 'Telefe.ar@SD', no: 1, quality: '1080p', logo: 'https://example.com/telefe.png' })
    expect(secure[4]).toMatchObject({ no: 5, notAlways: true, geoBlocked: false })
    expect(secure[5]).toMatchObject({ geoBlocked: true, url: 'https://example.com/rosario.m3u8' })
  })
})

describe('stepChannel', () => {
  const list = parseLiveChannels(M3U, { secure: true })

  it('avanza, retrocede y da la vuelta', () => {
    expect(stepChannel(list, 'Telefe.ar@SD', 1)?.name).toBe('Canal 26 (Argentina)')
    expect(stepChannel(list, 'Telefe.ar@SD', -1)?.name).toBe('Telefe Rosario')
    expect(stepChannel(list, 'nada', 1)?.name).toBe('Telefe')
    expect(stepChannel([], 'Telefe.ar@SD', 1)).toBeUndefined()
  })
})

it('channelInitials', () => {
  expect(channelInitials('Canal 26 (Argentina)')).toBe('C2')
  expect(channelInitials('La 100')).toBe('L1')
  expect(channelInitials('Señal U')).toBe('SU')
})

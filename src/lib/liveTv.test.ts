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

  it('un título con coma no se corta, y sin atributos también anda', () => {
    const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="x" group-title="Noticias",Canal 9, Buenos Aires
https://example.com/c9.m3u8
#EXTINF:-1 tvg-id="y" tvg-name="A, B" group-title="News",Noticias Ya (720p)
https://example.com/ny.m3u8
#EXTINF:-1,Canal sin atributos, con coma
https://example.com/sin.m3u8
`
    // "Noticias" no es un grupo de iptv-org (es "News"): el primero no entra, pero parsea bien el título.
    const list = parseLiveChannels(m3u.replace('group-title="Noticias"', 'group-title="News"'), { secure: true })
    expect(list.map((c) => c.name)).toEqual(['Canal 9, Buenos Aires', 'Noticias Ya'])
    expect(list[1]).toMatchObject({ id: 'y', quality: '720p' })
    const plain = parseLiveChannels(m3u.replace('#EXTINF:-1,Canal', '#EXTINF:-1 group-title="General",Canal'), { secure: true })
    expect(plain.some((c) => c.name === 'Canal sin atributos, con coma')).toBe(true)
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

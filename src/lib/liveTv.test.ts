import { describe, expect, it } from 'vitest'
import { LIVE_CATEGORIES, LIVE_CHANNELS, channelInitials, stepChannel, youtubeLiveUrl } from './liveTv'

describe('LIVE_CHANNELS (v0.22.6)', () => {
  it('son los canales que eligió el usuario, en su orden y numerados', () => {
    expect(LIVE_CHANNELS.map((c) => c.name)).toEqual([
      'TN Todo Noticias',
      'C5N',
      'Crónica TV',
      'Canal 26',
      'LN+',
      'A24',
      'Televisión Pública',
      'Encuentro',
      'Cine.AR',
      'Telefe',
      'El Trece',
      'El Nueve',
      'América TV',
      'Music Top',
    ])
    expect(LIVE_CHANNELS.map((c) => c.no)).toEqual(LIVE_CHANNELS.map((_, i) => i + 1))
    expect(new Set(LIVE_CHANNELS.map((c) => c.id)).size).toBe(LIVE_CHANNELS.length)
  })

  it('solo señales oficiales: https o un canal de YouTube, nunca IPs sueltas por http', () => {
    for (const c of LIVE_CHANNELS) {
      expect(c.url.startsWith('https://')).toBe(true)
      expect(c.url).not.toMatch(/^https:\/\/\d+\.\d+\.\d+\.\d+/)
      if (c.youtube) {
        expect(c.youtube).toMatch(/^UC[\w-]{22}$/)
        expect(c.url).toBe(`https://www.youtube.com/channel/${c.youtube}/live`)
      } else expect(c.url).toMatch(/\.m3u8$/)
    }
  })

  it('cada canal está en una categoría que existe', () => {
    const ids = new Set(LIVE_CATEGORIES.map((c) => c.id))
    expect(LIVE_CHANNELS.every((c) => ids.has(c.category))).toBe(true)
  })
})

it('youtubeLiveUrl', () => {
  const url = new URL(youtubeLiveUrl('UCj6PcyLvpnIRT_2W_mwa9Aw', { muted: true, origin: 'https://sp.example' }))
  expect(url.origin + url.pathname).toBe('https://www.youtube-nocookie.com/embed/live_stream')
  expect(url.searchParams.get('channel')).toBe('UCj6PcyLvpnIRT_2W_mwa9Aw')
  expect(url.searchParams.get('mute')).toBe('1')
  expect(url.searchParams.get('enablejsapi')).toBe('1')
  expect(url.searchParams.get('origin')).toBe('https://sp.example')
  expect(new URL(youtubeLiveUrl('UCx', { muted: false })).searchParams.get('mute')).toBe('0')
})

describe('stepChannel', () => {
  const list = LIVE_CHANNELS

  it('avanza, retrocede y da la vuelta', () => {
    expect(stepChannel(list, 'TN.ar', 1)?.name).toBe('C5N')
    expect(stepChannel(list, 'TN.ar', -1)?.name).toBe('Music Top')
    expect(stepChannel(list, 'nada', 1)?.name).toBe('TN Todo Noticias')
    expect(stepChannel([], 'TN.ar', 1)).toBeUndefined()
  })
})

it('channelInitials', () => {
  expect(channelInitials('Canal 26 (Argentina)')).toBe('C2')
  expect(channelInitials('La 100')).toBe('L1')
  expect(channelInitials('Señal U')).toBe('SU')
})

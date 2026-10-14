import { describe, expect, it } from 'vitest'
import { probeChannel, probeChannels, stepChannel, watchable, type ChannelHealth, type LiveChannel } from './liveTv'

// Servidores falsos: `cors` dice si el host manda Access-Control-Allow-Origin (si no, fetch tira TypeError).
type Host = { cors: boolean; status?: number; body?: string }
function fakeNet(hosts: Record<string, Host>) {
  const asked: string[] = []
  const impl = async (url: string, init?: RequestInit) => {
    asked.push(url)
    const h = hosts[new URL(url).host]
    if (!h || !h.cors) throw new TypeError('Failed to fetch')
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return new Response(h.body ?? '', { status: h.status ?? 200 })
  }
  return { impl, asked }
}

const MASTER = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia/720.m3u8\n'
const MEDIA = '#EXTM3U\n#EXTINF:6,\nhttps://seg.example/s1.ts\n'

describe('probeChannel (auditoría de uso #10)', () => {
  it('anda si la lista, la sublista y el primer segmento se pueden pedir con CORS', async () => {
    const net = fakeNet({ 'ok.example': { cors: true, body: MASTER }, 'seg.example': { cors: true } })
    // La sublista vive en el mismo host que la lista (ruta relativa).
    const impl = async (url: string, init?: RequestInit) => (url.includes('/media/') ? new Response(MEDIA) : net.impl(url, init))
    expect(await probeChannel('https://ok.example/live.m3u8', impl)).toBe('ok')
  })

  it('sin CORS en la lista o solo en los segmentos: no se puede ver en el navegador', async () => {
    expect(await probeChannel('https://nocors.example/live.m3u8', fakeNet({}).impl)).toBe('blocked')
    const segNoCors = fakeNet({ 'tv.example': { cors: true, body: MEDIA } })
    expect(await probeChannel('https://tv.example/live.m3u8', segNoCors.impl)).toBe('blocked')
    expect(segNoCors.asked).toContain('https://seg.example/s1.ts')
  })

  it('error HTTP: sin señal; tiempo agotado: no se sabe (no se marca)', async () => {
    expect(await probeChannel('https://down.example/live.m3u8', fakeNet({ 'down.example': { cors: true, status: 404 } }).impl)).toBe('down')
    const slow = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    expect(await probeChannel('https://lento.example/live.m3u8', slow, 20)).toBeUndefined()
  })

  it('lo que no es HLS va directo al <video> (no pide CORS)', async () => {
    expect(await probeChannel('https://radio.example/stream.mp3', fakeNet({}).impl)).toBe('ok')
  })
})

describe('probeChannels', () => {
  it('si fallan todos, el problema es la conexión: no se marca ninguno', async () => {
    const seen: Record<string, ChannelHealth>[] = []
    const out = await probeChannels(
      [
        { id: 'a', url: 'https://a.example/x.m3u8' },
        { id: 'b', url: 'https://b.example/x.m3u8' },
      ],
      (r) => seen.push(r),
      { fetchImpl: fakeNet({}).impl },
    )
    expect(out).toEqual({})
    expect(seen).toEqual([])
  })

  it('con al menos uno que anda, marca los que no', async () => {
    const net = fakeNet({ 'ok.example': { cors: true, body: '#EXTM3U\n' } })
    const out = await probeChannels(
      [
        { id: 'malo', url: 'https://nocors.example/x.m3u8' },
        { id: 'bueno', url: 'https://ok.example/x.m3u8' },
      ],
      () => {},
      { fetchImpl: net.impl, concurrency: 1 },
    )
    expect(out).toEqual({ malo: 'blocked', bueno: 'ok' })
  })
})

describe('zapping saltea los que no andan', () => {
  const ch = (id: string, no: number): LiveChannel => ({ id, no, name: id, category: 'aire', notAlways: false, geoBlocked: false, url: `https://${id}.example/x.m3u8` })
  const list = [ch('a', 1), ch('b', 2), ch('c', 3), ch('d', 4)]
  const health: Record<string, ChannelHealth> = { b: 'blocked', c: 'down' }
  const bad = (c: LiveChannel) => !!health[c.id] && health[c.id] !== 'ok'

  it('stepChannel pasa por encima de los marcados, en los dos sentidos', () => {
    expect(stepChannel(list, 'a', 1, bad)?.id).toBe('d')
    expect(stepChannel(list, 'd', -1, bad)?.id).toBe('a')
    expect(stepChannel(list, 'a', 1)?.id).toBe('b')
  })

  it('watchable: el primer canal es uno que anda; si no anda ninguno, la lista entera', () => {
    expect(watchable(list, health).map((c) => c.id)).toEqual(['a', 'd'])
    expect(watchable([ch('b', 2)], health).map((c) => c.id)).toEqual(['b'])
  })
})

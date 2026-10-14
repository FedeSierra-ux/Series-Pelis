import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUB_CACHE_MAX, SUB_MAX_BYTES, SUB_TIMEOUT_MS, clearSubtitleCache, loadSubtitle, loadSubtitleFile, subtitleCacheSize } from './subtitles'

// Auditoría de código #16: los subtítulos tenían que tener tiempo límite, tope de tamaño y liberar memoria.

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHola\n'
let created = 0
const revoked: string[] = []

beforeEach(() => {
  created = 0
  revoked.length = 0
  vi.stubGlobal('location', { href: 'http://localhost/' })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:sub-${++created}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => void revoked.push(u))
})

afterEach(() => {
  clearSubtitleCache()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const okFetch = (body = VTT, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(body, { status: 200, headers }))

describe('caché de subtítulos', () => {
  it('reusa la URL blob del mismo subtítulo', async () => {
    const fetch = okFetch()
    vi.stubGlobal('fetch', fetch)
    const a = await loadSubtitle('https://subs.test/a.vtt')
    const b = await loadSubtitle('https://subs.test/a.vtt')
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it(`guarda como mucho ${SUB_CACHE_MAX} y libera las URL blob que desaloja`, async () => {
    vi.stubGlobal('fetch', okFetch())
    const first = await loadSubtitle('https://subs.test/0.vtt')
    for (let i = 1; i <= SUB_CACHE_MAX; i++) await loadSubtitle(`https://subs.test/${i}.vtt`)
    expect(subtitleCacheSize()).toEqual({ texts: SUB_CACHE_MAX, blobs: SUB_CACHE_MAX })
    expect(revoked).toEqual([first])
  })

  it('el usado hace poco no se desaloja', async () => {
    vi.stubGlobal('fetch', okFetch())
    const first = await loadSubtitle('https://subs.test/0.vtt')
    for (let i = 1; i < SUB_CACHE_MAX; i++) await loadSubtitle(`https://subs.test/${i}.vtt`)
    await loadSubtitle('https://subs.test/0.vtt') // se vuelve a usar
    await loadSubtitle('https://subs.test/nuevo.vtt')
    expect(revoked).not.toContain(first)
    expect(revoked).toHaveLength(1)
  })

  it('los archivos propios no se desalojan (no se pueden volver a bajar)', async () => {
    vi.stubGlobal('fetch', okFetch())
    const file = new File([VTT], 'mio.vtt')
    const own = await loadSubtitleFile(file)
    for (let i = 0; i < SUB_CACHE_MAX + 5; i++) await loadSubtitle(`https://subs.test/${i}.vtt`)
    expect(revoked).not.toContain(own)
    expect(await loadSubtitle(own)).toBe(own)
  })
})

describe('descarga de subtítulos', () => {
  it('rechaza los que dicen pesar más del tope', async () => {
    vi.stubGlobal('fetch', okFetch(VTT, { 'content-length': String(SUB_MAX_BYTES + 1) }))
    await expect(loadSubtitle('https://subs.test/enorme.srt')).rejects.toThrow('demasiado grande')
  })

  it('rechaza los que pesan más del tope aunque no lo digan', async () => {
    vi.stubGlobal('fetch', okFetch('x'.repeat(SUB_MAX_BYTES + 10)))
    await expect(loadSubtitle('https://subs.test/enorme2.srt')).rejects.toThrow('demasiado grande')
  })

  it('un addon colgado corta a los 15 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const p = loadSubtitle('https://subs.test/colgado.srt')
    const check = expect(p).rejects.toThrow('tardó demasiado')
    await vi.advanceTimersByTimeAsync(SUB_TIMEOUT_MS + 1)
    await check
  })

  it('un error HTTP se informa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })))
    await expect(loadSubtitle('https://subs.test/404.srt')).rejects.toThrow('HTTP 404')
  })
})

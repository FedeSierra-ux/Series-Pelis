import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipEntries } from '../../functions/_zip'
import { fileLimiter, matchesEpisode, onRequestGet, pickEntry, searchLimiter, sortSpanish, spanishVariant, type OnlineSub } from '../../functions/api/subs/[[path]]'

const SITE = 'https://series-pelis.pages.dev'
const FROM_APP = { 'Sec-Fetch-Site': 'same-origin' }
const FAKE_SUBDL = 'subdl-de-prueba'
const FAKE_OS = 'os-de-prueba'

type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>

function call(path: string, { env = { SUBDL_KEY: FAKE_SUBDL } as Record<string, string>, headers = FROM_APP as Record<string, string> } = {}) {
  const url = new URL(`${SITE}/api/subs/${path}`)
  const parts = url.pathname.replace('/api/subs/', '').split('/').filter(Boolean)
  return onRequestGet({ request: new Request(url, { headers }), env, params: { path: parts } })
}

const enc = new TextEncoder()

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Arma un .zip chico con los archivos dados (deflate). */
async function makeZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const locals: Uint8Array<ArrayBuffer>[] = []
  const centrals: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text)
    const packed = await deflate(raw)
    const nameBytes = enc.encode(name)
    const local = new Uint8Array(30 + nameBytes.length + packed.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(18, packed.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(packed, 30 + nameBytes.length)
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(20, packed.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  return new Blob([...locals, ...centrals, end]).arrayBuffer()
}

afterEach(() => {
  vi.unstubAllGlobals()
  searchLimiter.reset()
  fileLimiter.reset()
})

describe('función /api/subs', () => {
  it('_status dice qué fuentes hay, sin mostrar las keys', async () => {
    expect(await (await call('_status', { env: {} })).json()).toEqual({ enabled: false, sources: [] })
    const body = await (await call('_status', { env: { SUBDL_KEY: FAKE_SUBDL, OPENSUBTITLES_KEY: FAKE_OS } })).json()
    expect(body).toEqual({ enabled: true, sources: ['subdl', 'opensubtitles'] })
    expect(JSON.stringify(body)).not.toContain(FAKE_SUBDL)
    // Responde aunque se abra desde un link de otro sitio (no gasta cupo ni muestra keys).
    expect((await call('_status', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(200)
  })

  it('un error de SubDL (status: false) no queda guardado como "no hay subtítulos"', async () => {
    vi.stubGlobal('fetch', (async () => Response.json({ status: false, statusCode: 403, error: 'not_authorized' })) as FetchFn)
    const res = await call('search?imdb=tt0133093&type=movie')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as { detail?: string }
    expect(body.detail).toBe('SubDL 200 not_authorized')
    expect(JSON.stringify(body)).not.toContain(FAKE_SUBDL)
  })

  it('busca en SubDL en español, saca la key de la respuesta y pone el latino primero', async () => {
    const seen: URL[] = []
    vi.stubGlobal('fetch', (async (url) => {
      seen.push(new URL(String(url)))
      return Response.json({
        status: true,
        subtitles: [
          { release_name: 'The.Show.S01E02.1080p.WEB-DL.Castellano', url: `/subtitle/111-222.zip?api_key=${FAKE_SUBDL}`, language: 'ES', season: 1, episode: 2 },
          { release_name: 'The.Show.S01E02.720p.HDTV', url: '/subtitle/111-333.zip', language: 'ES', season: 1, episode: 2 },
          { release_name: 'The.Show.S01E02.1080p.WEB-DL', comment: 'Español Latino', url: `/subtitle/111-444.zip?api_key=${FAKE_SUBDL}`, language: 'ES', season: 1, episode: 2, hi: true },
          { release_name: 'The.Show.S01E03', url: '/subtitle/111-555.zip', language: 'ES', season: 1, episode: 3 },
          { release_name: 'Otro idioma', url: '/subtitle/111-666.zip', language: 'EN' },
        ],
      })
    }) as FetchFn)
    const res = await call('search?imdb=tt0944947&type=series&s=1&e=2')
    expect(res.status).toBe(200)
    const { subs } = (await res.json()) as { subs: OnlineSub[] }
    expect(subs.map((s) => [s.id, s.lang])).toEqual([
      ['sd:111-444', 'spl'],
      ['sd:111-333', 'spa'],
      ['sd:111-222', 'spn'],
    ])
    expect(subs[0]).toMatchObject({ url: '/api/subs/sd/111-444?s=1&e=2', source: 'subdl', sdh: true })
    expect(JSON.stringify(subs)).not.toContain(FAKE_SUBDL)
    const q = seen[0].searchParams
    expect(seen[0].origin + seen[0].pathname).toBe('https://api.subdl.com/api/v1/subtitles')
    expect([q.get('api_key'), q.get('imdb_id'), q.get('type'), q.get('languages'), q.get('season_number'), q.get('episode_number')]).toEqual([
      FAKE_SUBDL,
      'tt0944947',
      'tv',
      'ES',
      '1',
      '2',
    ])
  })

  it('si no hay del episodio busca el pack de la temporada', async () => {
    const seen: URL[] = []
    vi.stubGlobal('fetch', (async (url) => {
      const u = new URL(String(url))
      seen.push(u)
      const pack = u.searchParams.get('full_season') === '1'
      return Response.json({ status: true, subtitles: pack ? [{ release_name: 'Temporada 1', url: '/subtitle/9-9.zip', full_season: true }] : [] })
    }) as FetchFn)
    const { subs } = (await (await call('search?imdb=tt0944947&type=series&s=1&e=2')).json()) as { subs: OnlineSub[] }
    expect(seen).toHaveLength(2)
    expect(seen[1].searchParams.has('episode_number')).toBe(false)
    expect(subs.map((s) => s.url)).toEqual(['/api/subs/sd/9-9?s=1&e=2'])
  })

  it('sin nada en SubDL usa OpenSubtitles (ea = latino)', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', (async (url, init) => {
      const u = String(url)
      seen.push(u)
      if (u.startsWith('https://api.subdl.com')) return Response.json({ status: true, subtitles: [] })
      expect(new Headers(init?.headers).get('Api-Key')).toBe(FAKE_OS)
      return Response.json({ data: [{ attributes: { language: 'ea', release: 'Matrix.1999.1080p', files: [{ file_id: 42 }] } }] })
    }) as FetchFn)
    const res = await call('search?imdb=tt0133093&type=movie', { env: { SUBDL_KEY: FAKE_SUBDL, OPENSUBTITLES_KEY: FAKE_OS } })
    const { subs } = (await res.json()) as { subs: OnlineSub[] }
    expect(subs).toEqual([{ id: 'os:42', url: '/api/subs/os/42', lang: 'spl', release: 'Matrix.1999.1080p', source: 'opensubtitles' }])
    expect(new URL(seen[1]).searchParams.get('imdb_id')).toBe('133093')
  })

  it('baja el zip de SubDL y devuelve el .srt del episodio', async () => {
    const zip = await makeZip({
      'Show.S01E01.srt': '1\n00:00:01,000 --> 00:00:02,000\nUno\n',
      'Show.S01E02.srt': '1\n00:00:01,000 --> 00:00:02,000\nDos\n',
    })
    const seen: string[] = []
    vi.stubGlobal('fetch', (async (url) => {
      seen.push(String(url))
      return new Response(zip, { headers: { 'Content-Type': 'application/zip' } })
    }) as FetchFn)
    const res = await call('sd/111-222?s=1&e=2')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Dos')
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(seen).toEqual(['https://dl.subdl.com/subtitle/111-222.zip'])
  })

  it('rechaza otros sitios, ids raros y rutas desconocidas', async () => {
    vi.stubGlobal('fetch', (async () => Response.json({ status: true, subtitles: [] })) as FetchFn)
    expect((await call('search?imdb=tt0133093&type=movie', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect((await call('search?imdb=tt0133093&type=movie', { headers: {} })).status).toBe(403)
    expect((await call('search?imdb=../etc&type=movie')).status).toBe(400)
    expect((await call('sd/..%2F..%2Fetc')).status).toBe(400)
    expect((await call('os/1', { env: { SUBDL_KEY: FAKE_SUBDL } })).status).toBe(503)
    expect((await call('otra/cosa')).status).toBe(404)
    expect((await call('search?imdb=tt0133093&type=movie', { env: {} })).status).toBe(503)
  })

  it('avisa cuando se terminó el cupo del día', async () => {
    vi.stubGlobal('fetch', (async () => new Response('{"error":"api_download_limit_exceeded"}', { status: 429 })) as FetchFn)
    const res = await call('sd/111-222')
    expect(res.status).toBe(429)
  })
})

describe('ayudas de /api/subs', () => {
  it('reconoce latino y España', () => {
    expect(spanishVariant('Movie.2020.1080p.LAT')).toBe('spl')
    expect(spanishVariant('Movie.2020', 'Subtítulos en español latino')).toBe('spl')
    expect(spanishVariant('Movie.2020.Castellano')).toBe('spn')
    expect(spanishVariant('Movie.2020.1080p.WEB-DL')).toBe('spa')
    // "Translated" no es "lat", ni "es la" de una frase es latino.
    expect(spanishVariant('Movie.2020', 'esta es la versión corregida')).toBe('spa')
    expect(spanishVariant('Movie.Translated')).toBe('spa')
  })

  it('ordena latino, sin saber, España', () => {
    const s = (id: string, lang: OnlineSub['lang']): OnlineSub => ({ id, url: '', lang, release: '', source: 'subdl' })
    expect(sortSpanish([s('a', 'spn'), s('b', 'spa'), s('c', 'spl'), s('d', 'spa')]).map((x) => x.id)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('elige el archivo del episodio en un pack, o el más grande', () => {
    expect(matchesEpisode('Show.S01E02.srt', 1, 2)).toBe(true)
    expect(matchesEpisode('Show 1x02.srt', 1, 2)).toBe(true)
    expect(matchesEpisode('Show.S01E12.srt', 1, 2)).toBe(false)
    expect(matchesEpisode('Show.S11E02.srt', 1, 2)).toBe(false)
    const pack = [
      { name: 'S01E01.srt', size: 10 },
      { name: 'S01E02.ass', size: 30 },
      { name: 'S01E02.srt', size: 20 },
      { name: 'leeme.txt', size: 99 },
    ]
    expect(pickEntry(pack, 1, 2)?.name).toBe('S01E02.srt')
    expect(pickEntry(pack, 1, 9)).toBeUndefined()
    expect(pickEntry([{ name: 'forzados.srt', size: 2 }, { name: 'completo.srt', size: 50 }])?.name).toBe('completo.srt')
  })

  it('lee zips y deja afuera los archivos más grandes que el tope', async () => {
    const zip = await makeZip({ 'a.srt': 'hola', 'grande.srt': 'x'.repeat(5000) })
    const entries = zipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['a.srt', 'grande.srt'])
    expect(new TextDecoder().decode(await entries[0].read())).toBe('hola')
    expect(() => zipEntries(new ArrayBuffer(10))).toThrow()
    const small = zipEntries(zip, 6000)
    expect(await small[1].read()).toHaveLength(5000)
    const liar = zipEntries(zip, 4999)
    expect(liar.map((e) => e.name)).toEqual(['a.srt'])
  })
})

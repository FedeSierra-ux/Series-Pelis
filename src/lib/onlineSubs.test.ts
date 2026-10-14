import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOnlineSubs, onlineOptions, parseVideoId, releaseScore, resetOnlineSubs, streamText, type OnlineSub } from './onlineSubs'

const sub = (id: string, lang: OnlineSub['lang'], release = ''): OnlineSub => ({ id, url: `/api/subs/sd/${id}`, lang, release, source: 'subdl' })

afterEach(() => {
  vi.unstubAllGlobals()
  resetOnlineSubs()
})

describe('subtítulos online', () => {
  it('saca IMDb, temporada y episodio del id de Stremio', () => {
    expect(parseVideoId('movie', 'tt0133093')).toEqual({ imdb: 'tt0133093' })
    expect(parseVideoId('series', 'tt0944947:1:2')).toEqual({ imdb: 'tt0944947', s: 1, e: 2 })
    expect(parseVideoId('series', 'tt0944947')).toBeUndefined()
    expect(parseVideoId('movie', 'tmdb:movie:603')).toBeUndefined()
  })

  it('el release más parecido al video sale primero, pero el latino siempre arriba', () => {
    const text = streamText({ behaviorHints: { filename: 'The.Show.S01E02.1080p.WEB-DL.DDP5.1.H.264-NTb.mkv' } })
    expect(releaseScore('The.Show.S01E02.1080p.WEB-DL-NTb', text)).toBeGreaterThan(releaseScore('The.Show.S01E02.720p.HDTV-LOL', text))
    const list = onlineOptions(
      [sub('a', 'spa', 'The.Show.S01E02.720p.HDTV-LOL'), sub('b', 'spa', 'The.Show.S01E02.1080p.WEB-DL-NTb'), sub('c', 'spl', 'The.Show.S01E02.720p.HDTV-LOL'), sub('d', 'spn'), sub('e', 'spa')],
      text,
    )
    expect(list.map((o) => o.id)).toEqual(['c', 'b', 'a', 'e'])
    expect(list[0]).toMatchObject({ lang: 'spl', latino: true, label: 'Español latino (online)' })
  })

  it('pregunta _status una vez y no busca si el sitio no los tiene', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url)
      return Response.json({ enabled: false })
    })
    expect(await fetchOnlineSubs('movie', 'tt0133093')).toEqual([])
    expect(await fetchOnlineSubs('movie', 'tt0133093')).toEqual([])
    expect(seen).toEqual(['/api/subs/_status'])
  })

  it('busca con el episodio y arma las opciones del menú', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url)
      if (url.endsWith('_status')) return Response.json({ enabled: true })
      return Response.json({ subs: [sub('111-444', 'spl')] })
    })
    const found = await fetchOnlineSubs('series', 'tt0944947:1:2')
    expect(seen[1]).toBe('/api/subs/search?imdb=tt0944947&type=series&s=1&e=2')
    expect(found).toEqual([{ id: '111-444', url: '/api/subs/sd/111-444', lang: 'spl', label: 'Español latino (online)', latino: true, sdh: undefined }])
  })

  it('si la búsqueda falla no rompe nada', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('_status') ? Response.json({ enabled: true }) : new Response('', { status: 502 })))
    expect(await fetchOnlineSubs('movie', 'tt0133093')).toEqual([])
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from '../../functions/api/segments'

const SITE = 'https://series-pelis.pages.dev'

function call(query: string, headers: Record<string, string> = {}) {
  return onRequestGet({ request: new Request(`${SITE}/api/segments?${query}`, { headers }) })
}

afterEach(() => vi.unstubAllGlobals())

describe('función /api/segments', () => {
  it('pasa el pedido a IntroDB desde la app', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url)
      return new Response('{"segments":[]}', { status: 200 })
    })
    const res = await call('imdb_id=tt0133093', { 'Sec-Fetch-Site': 'same-origin', Origin: SITE })
    expect(res.status).toBe(200)
    expect(seen[0]).toContain('imdb_id=tt0133093')
    expect(seen[0]).toContain('is_movie=true')
  })

  it('rechaza pedidos de otros sitios (no es un proxy abierto)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await call('imdb_id=tt0133093', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await call('imdb_id=tt0133093', { Origin: 'https://otro.example' })).status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sin cabeceras de origen (curl, navegadores viejos) sigue andando', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"segments":[]}', { status: 200 }))
    expect((await call('imdb_id=tt0133093')).status).toBe(200)
  })

  it('valida imdb_id, temporada y episodio', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await call('imdb_id=matrix')).status).toBe(400)
    expect((await call('imdb_id=tt1&season=1')).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

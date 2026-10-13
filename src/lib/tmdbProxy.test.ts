import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from '../../functions/api/tmdb/[[path]]'
import { probeServerTmdb, SERVER_KEY, tmdbFetch, tmdbKey } from './tmdb'

const SITE = 'https://series-pelis.pages.dev'
const FAKE_KEY = 'clave-de-prueba'
const FAKE_TOKEN = 'eyJ-token-de-prueba'

function call(path: string, { key = FAKE_KEY, headers = {} }: { key?: string; headers?: Record<string, string> } = {}) {
  const url = new URL(`${SITE}/api/tmdb/${path}`)
  const parts = url.pathname.replace('/api/tmdb/', '').split('/').filter(Boolean)
  return onRequestGet({ request: new Request(url, { headers }), env: { TMDB_KEY: key }, params: { path: parts } })
}

afterEach(() => vi.unstubAllGlobals())

describe('función /api/tmdb', () => {
  it('pide a TMDB con la key del secreto y saca la api_key que mande el cliente', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      seen.push(String(url))
      return new Response('{"ok":true}', { status: 200 })
    })
    const res = await call('movie/603?language=es-MX&api_key=otra')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('max-age')
    const url = new URL(seen[0])
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/movie/603')
    expect(url.searchParams.get('language')).toBe('es-MX')
    expect(url.searchParams.getAll('api_key')).toEqual([FAKE_KEY])
  })

  it('con un token v4 manda Bearer y no api_key', async () => {
    let auth: string | null = null
    let target = ''
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      target = String(url)
      auth = new Headers(init.headers).get('Authorization')
      return new Response('{}', { status: 200 })
    })
    await call('trending/all/day', { key: FAKE_TOKEN })
    expect(auth).toBe(`Bearer ${FAKE_TOKEN}`)
    expect(new URL(target).searchParams.has('api_key')).toBe(false)
  })

  it('rechaza rutas fuera de la lista, pedidos de otros sitios y avisa si falta el secreto', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'))
    expect((await call('account/123')).status).toBe(404)
    expect((await call('movie/603', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect((await call('movie/603', { headers: { Origin: 'https://otro.com' } })).status).toBe(403)
    expect((await call('movie/603', { headers: { Origin: SITE, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(200)
    expect((await call('movie/603', { key: '' })).status).toBe(503)
  })

  it('_status dice si el sitio tiene TMDB sin mostrar la key', async () => {
    const on = await call('_status')
    const body = await on.text()
    expect(JSON.parse(body)).toEqual({ enabled: true })
    expect(body).not.toContain(FAKE_KEY)
    expect(await (await call('_status', { key: '' })).json()).toEqual({ enabled: false })
  })
})

describe('cliente con la key del sitio', () => {
  it('sin key propia usa el sitio cuando /_status dice que sí, y pide por /api/tmdb sin key', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
      removeItem: (k: string) => memory.delete(k),
    })
    vi.stubGlobal('location', { origin: SITE })
    const seen: { url: string; auth: string | null }[] = []
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') })
      return new Response(String(url).endsWith('/_status') ? '{"enabled":true}' : '{"id":603}', {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    expect(tmdbKey()).toBe('')
    expect(await probeServerTmdb()).toBe(true)
    expect(tmdbKey()).toBe(SERVER_KEY)
    expect(memory.get('sp-tmdb-server')).toBe('1')

    expect(await tmdbFetch('/movie/603', { language: 'es-MX' })).toEqual({ id: 603 })
    const last = seen[seen.length - 1]
    expect(last.url).toBe(`${SITE}/api/tmdb/movie/603?language=es-MX`)
    expect(last.auth).toBeNull()
  })

  it('si /_status no es JSON (Vite en local) queda apagado', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }))
    expect(await probeServerTmdb()).toBe(false)
    expect(tmdbKey()).toBe('')
  })
})

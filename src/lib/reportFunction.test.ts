import { describe, expect, it } from 'vitest'
import { hostOnly, MAX_BODY, onRequestGet, onRequestPost, RATE_LIMIT, sanitizeReport, scrubUrls, type KvLike } from '../../functions/api/report/[[path]]'

const SITE = 'https://series-pelis.pages.dev'
const SAME_SITE = { 'Sec-Fetch-Site': 'same-origin', Origin: SITE, 'CF-Connecting-IP': '203.0.113.7' }

/** KV de mentira en memoria (con `list` ordenado por clave, como el real). */
function fakeKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => {
      data.set(key, value)
    },
    list: async ({ prefix = '', limit = 1000 } = {}) => {
      const keys = [...data.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map((name) => ({ name }))
      return { keys, list_complete: true }
    },
  }
}

const valid = () => ({
  kind: 'player',
  message: 'HTTP 503 en https://torrentio.strem.fun/realdebrid=APIKEY/stream/movie/tt1.json',
  route: '/watch/movie/tt1?stream=https%3A%2F%2Fsecreto',
  version: '0.10.0',
  platform: { ua: 'Mozilla/5.0 (Linux; Android 9; AFTMM)', os: 'android', tv: true },
  theme: '2',
  addons: ['https://torrentio.strem.fun/realdebrid=APIKEY/manifest.json', 'cinemeta', 'esto no es un host'],
  stream: { url: 'https://debrid.example/dl/TOKEN/file.mkv', type: 'hls' },
  comment: 'Se corta a los 5 minutos',
  installId: 'a1b2c3d4-0000-4000-8000-abcdefabcdef',
})

function post(body: unknown, env: Record<string, unknown> = {}, headers: Record<string, string> = SAME_SITE, path: string[] = []) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  return onRequestPost({
    request: new Request(`${SITE}/api/report`, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', ...headers } }),
    env,
    params: { path },
  })
}

function get(path: string[], env: Record<string, unknown> = {}, headers: Record<string, string> = {}, query = '') {
  return onRequestGet({ request: new Request(`${SITE}/api/report${query}`, { headers }), env, params: { path } })
}

describe('sanitización del informe', () => {
  it('reduce manifests y streams al host', () => {
    expect(hostOnly('https://torrentio.strem.fun/realdebrid=APIKEY/manifest.json')).toBe('torrentio.strem.fun')
    expect(hostOnly('http://127.0.0.1:11470/manifest.json')).toBe('127.0.0.1:11470')
    expect(hostOnly('cinemeta.strem.io')).toBe('cinemeta.strem.io')
    expect(hostOnly('no es un host ni url')).toBe('')
    expect(hostOnly(42)).toBe('')
  })

  it('reemplaza las URLs dentro del texto', () => {
    expect(scrubUrls('HTTP 503 en https://torrentio.strem.fun/realdebrid=APIKEY/stream.json y listo')).toBe('HTTP 503 en torrentio.strem.fun y listo')
    expect(scrubUrls('magnet:?xt=urn:btih:abc')).toBe('magnet:?xt=urn:btih:abc')
  })

  it('arma el informe sin keys ni URLs completas', () => {
    const r = sanitizeReport(valid())!
    expect(r.addons).toEqual(['torrentio.strem.fun', 'cinemeta'])
    expect(r.stream).toEqual({ host: 'debrid.example', type: 'hls' })
    expect(r.route).toBe('/watch/movie/tt1')
    expect(JSON.stringify(r)).not.toMatch(/APIKEY|TOKEN|secreto/)
    expect(r.message).toBe('HTTP 503 en torrentio.strem.fun')
  })

  it('rechaza tipos desconocidos, ids raros y recorta lo largo', () => {
    expect(sanitizeReport({ ...valid(), kind: 'otro' })).toBeNull()
    expect(sanitizeReport({ ...valid(), installId: '<script>' })).toBeNull()
    expect(sanitizeReport('texto')).toBeNull()
    const r = sanitizeReport({ ...valid(), comment: 'x'.repeat(2000), message: 'y'.repeat(5000), context: { a: 'z'.repeat(1000) } })!
    expect(r.comment!.length).toBe(500)
    expect(r.message.length).toBe(1000)
    expect(r.context!.a.length).toBe(300)
  })
})

describe('función /api/report', () => {
  it('sin el KV contesta 503 "disabled" y _status dice que no está', async () => {
    const res = await post(valid())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, reason: 'disabled' })
    expect(await (await get(['_status'])).json()).toEqual({ enabled: false })
    expect(await (await get(['_status'], { REPORTS: fakeKv() })).json()).toEqual({ enabled: true })
  })

  it('guarda el informe recortado, con vencimiento y clave ordenada por fecha', async () => {
    const kv = fakeKv()
    const res = await post(valid(), { REPORTS: kv })
    expect(res.status).toBe(200)
    const stored = [...kv.data.entries()].filter(([k]) => k.startsWith('r:'))
    expect(stored).toHaveLength(1)
    const [key, value] = stored[0]
    expect(key).toMatch(/^r:\d{13}:a1b2c3d4-0000-4000-8000-abcdefabcdef$/)
    expect(value).not.toMatch(/APIKEY|TOKEN|secreto/)
    const parsed = JSON.parse(value)
    expect(parsed.addons).toEqual(['torrentio.strem.fun', 'cinemeta'])
    expect(parsed.receivedAt).toMatch(/^\d{4}-/)
  })

  it('rechaza otros sitios, JSON roto, cuerpos grandes e informes inválidos', async () => {
    const kv = fakeKv()
    expect((await post(valid(), { REPORTS: kv }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await post(valid(), { REPORTS: kv }, { Origin: 'https://otro.example' })).status).toBe(403)
    expect((await post('{no json', { REPORTS: kv })).status).toBe(400)
    expect((await post({ kind: 'player' }, { REPORTS: kv })).status).toBe(400)
    expect((await post({ ...valid(), comment: 'x'.repeat(MAX_BODY) }, { REPORTS: kv })).status).toBe(413)
    expect([...kv.data.keys()].filter((k) => k.startsWith('r:'))).toHaveLength(0)
  })

  it('limita a 20 por hora por IP', async () => {
    const kv = fakeKv()
    for (let i = 0; i < RATE_LIMIT; i++) expect((await post(valid(), { REPORTS: kv })).status).toBe(200)
    const res = await post(valid(), { REPORTS: kv })
    expect(res.status).toBe(429)
    expect((await post(valid(), { REPORTS: kv }, { ...SAME_SITE, 'CF-Connecting-IP': '198.51.100.9' })).status).toBe(200)
  })

  it('lista solo con el secreto; sin secreto configurado, 404', async () => {
    const kv = fakeKv()
    await post(valid(), { REPORTS: kv })
    await post({ ...valid(), kind: 'app', message: 'segundo' }, { REPORTS: kv })
    expect((await get([], { REPORTS: kv })).status).toBe(404)
    expect((await get([], { REPORTS: kv, REPORT_ADMIN_KEY: 'clave' })).status).toBe(401)
    expect((await get([], { REPORTS: kv, REPORT_ADMIN_KEY: 'clave' }, { Authorization: 'Bearer otra' })).status).toBe(401)
    const res = await get([], { REPORTS: kv, REPORT_ADMIN_KEY: 'clave' }, { Authorization: 'Bearer clave' }, '?limit=1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; reports: { message: string }[] }
    expect(body.count).toBe(1)
    // El más nuevo primero.
    expect(body.reports[0].message).toBe('segundo')
  })
})

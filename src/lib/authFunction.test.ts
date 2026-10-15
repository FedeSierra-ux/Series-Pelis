import { beforeEach, describe, expect, it } from 'vitest'
import { forgetCachedSessions, normalizeInvite, type AuthEnv } from '../../functions/_auth'
import { LIMITS, onRequest as auth } from '../../functions/api/auth/[[path]]'
import { onRequest as middleware } from '../../functions/api/_middleware'
import { decodeCursor, encodeCursor, HOUSE_MAX_ROWS, MAX_PROFILES as SERVER_MAX_PROFILES, onRequestGet as syncGet, onRequestPost as syncPost, PAGE, PUSH_LIMIT } from '../../functions/api/sync'
import { MAX_PROFILES } from './profileModel'
import { clientIp } from '../../functions/_lib'
import { fakeD1 } from './d1.testutil'

const SITE = 'https://series-pelis.pages.dev'
const ADMIN_KEY = 'clave-de-prueba-del-admin-que-es-bien-larga'
const FROM_APP = { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }

type RawDb = { prepare(s: string): { all(...p: unknown[]): Record<string, unknown>[]; run(...p: unknown[]): unknown } }
const rawDb = () => (env.DB as unknown as { raw: RawDb }).raw

let env: AuthEnv
let ipCounter = 0

beforeEach(async () => {
  forgetCachedSessions()
  env = { DB: await fakeD1(), ADMIN_KEY }
  ipCounter++
})

function req(path: string, { method = 'GET', body, cookie, headers = FROM_APP as Record<string, string>, ip }: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; ip?: string } = {}) {
  const h: Record<string, string> = { ...headers, 'CF-Connecting-IP': ip ?? `10.0.0.${ipCounter}` }
  if (cookie) h.Cookie = cookie
  return new Request(`${SITE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
}

function call(route: string, opts: Parameters<typeof req>[1] = {}) {
  return auth({ request: req(`/api/auth/${route}`, opts), env, params: { path: route.split('?')[0].split('/') } })
}

/** `__Host-sp_s=…` de la respuesta, listo para mandar como Cookie. */
function cookieOf(res: Response): string {
  const set = res.headers.get('Set-Cookie') ?? ''
  const m = /(__Host-sp_s=[^;]*)/.exec(set)
  expect(m, 'la respuesta trae la cookie de sesión').toBeTruthy()
  return m![1]
}

async function adminLogin() {
  const res = await call('setup', { method: 'POST', body: { key: ADMIN_KEY, name: 'Casa Fede', label: 'PC · Chrome' } })
  expect(res.status).toBe(200)
  return cookieOf(res)
}

async function newHouse(admin: string, name = 'Casa Tía') {
  const res = await call('houses', { method: 'POST', body: { name }, cookie: admin })
  expect(res.status).toBe(200)
  return (await res.json()) as { house: { id: string; name: string }; invite: string }
}

async function join(invite: string) {
  const res = await call('join', { method: 'POST', body: { code: invite, label: 'Celu' } })
  expect(res.status).toBe(200)
  return cookieOf(res)
}

describe('/api/auth', () => {
  it('sin la base, el login está apagado y la app sigue como antes', async () => {
    const res = await auth({ request: req('/api/auth/me'), env: {}, params: { path: ['me'] } })
    expect(await res.json()).toEqual({ enabled: false })
  })

  it('primera vez: pide crear la casa del admin', async () => {
    const res = await call('me')
    expect(await res.json()).toEqual({ enabled: true, session: null, needsSetup: true })
  })

  it('la clave del admin: corta o mal escrita no entra; bien, crea la casa y la sesión', async () => {
    env.ADMIN_KEY = 'corta'
    expect((await call('setup', { method: 'POST', body: { key: 'corta' } })).status).toBe(503)
    env.ADMIN_KEY = ADMIN_KEY
    expect((await call('setup', { method: 'POST', body: { key: 'otra-clave' } })).status).toBe(401)

    const cookie = await adminLogin()
    expect(cookie).toMatch(/^__Host-sp_s=[\w-]{40,}$/)
    const me = await (await call('me', { cookie })).json()
    expect(me.session.house).toMatchObject({ name: 'Casa Fede', isAdmin: true })
    expect(me.session.device).toMatchObject({ label: 'PC · Chrome', kind: 'web' })

    // Volver a usar la clave entra a la misma casa (recuperación), no crea otra.
    const again = await adminLogin()
    const me2 = await (await call('me', { cookie: again })).json()
    expect(me2.session.house.id).toBe(me.session.house.id)
    expect((await (await call('me')).json()).needsSetup).toBe(false)
  })

  it('la cookie es HttpOnly, Secure, SameSite=Lax y con prefijo __Host-', async () => {
    const res = await call('setup', { method: 'POST', body: { key: ADMIN_KEY } })
    const set = res.headers.get('Set-Cookie')!
    expect(set).toMatch(/^__Host-sp_s=/)
    expect(set).toContain('HttpOnly')
    expect(set).toContain('Secure')
    expect(set).toContain('SameSite=Lax')
    expect(set).toContain('Path=/')
    expect(set).not.toContain('Domain=')
  })

  it('en la base solo queda el hash del token y del código de invitación', async () => {
    const cookie = await adminLogin()
    const { invite } = await newHouse(cookie)
    const token = cookie.split('=')[1]
    const db = (env.DB as unknown as { raw: { prepare(s: string): { all(): Record<string, unknown>[] } } }).raw
    const dump = JSON.stringify([db.prepare('SELECT * FROM sessions').all(), db.prepare('SELECT * FROM invites').all()])
    expect(dump).not.toContain(token)
    expect(dump).not.toContain(invite)
  })

  it('el clave del admin tiene tope de intentos por IP', async () => {
    for (let i = 0; i < LIMITS.setup.n; i++) expect((await call('setup', { method: 'POST', body: { key: 'mal' } })).status).toBe(401)
    expect((await call('setup', { method: 'POST', body: { key: ADMIN_KEY } })).status).toBe(429)
    // Otra IP sí puede.
    expect((await call('setup', { method: 'POST', body: { key: ADMIN_KEY }, ip: '10.9.9.9' })).status).toBe(200)
  })

  it('POST desde otro sitio o sin señales de la app: 403', async () => {
    expect((await call('setup', { method: 'POST', body: { key: ADMIN_KEY }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect((await call('setup', { method: 'POST', body: { key: ADMIN_KEY }, headers: {} })).status).toBe(403)
  })

  it('invitación: entra a esa casa (sin ser admin); rotarla deja afuera el enlace viejo', async () => {
    const admin = await adminLogin()
    const { house, invite } = await newHouse(admin)
    expect(invite).toMatch(/^[A-Z2-9]{12}$/)

    // Sirve el enlace entero, en minúsculas o con guiones.
    const member = await join(`${SITE}/unirse#${invite.toLowerCase().replace(/(.{4})/g, '$1-')}`)
    const me = await (await call('me', { cookie: member })).json()
    expect(me.session.house).toEqual({ id: house.id, name: 'Casa Tía', isAdmin: false })

    const rotated = await call('houses/invite', { method: 'POST', body: { house: house.id }, cookie: admin })
    const { invite: fresh } = await rotated.json()
    expect((await call('join', { method: 'POST', body: { code: invite } })).status).toBe(404)
    await join(fresh)
    // Los que ya habían entrado siguen.
    expect((await (await call('me', { cookie: member })).json()).session).toBeTruthy()
  })

  it('un miembro no puede usar lo del admin ni ver otras casas', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    expect((await call('houses', { cookie: member })).status).toBe(403)
    expect((await call('houses', { method: 'POST', body: { name: 'X' }, cookie: member })).status).toBe(403)
    const adminHouse = (await (await call('me', { cookie: admin })).json()).session.house.id
    expect((await call(`devices?house=${adminHouse}`, { cookie: member })).status).toBe(403)
    expect((await call('devices/revoke', { method: 'POST', body: { id: 'x', house: adminHouse }, cookie: member })).status).toBe(403)
    expect((await call('houses')).status).toBe(401)
  })

  it('vincular la TV: código de 6 dígitos, se aprueba desde otro aparato y la sesión se entrega una vez', async () => {
    const admin = await adminLogin()
    const start = await call('pair/start', { method: 'POST', body: { label: 'TV · Living', tv: true } })
    const { code, poll } = await start.json()
    expect(code).toMatch(/^\d{6}$/)

    expect(await (await call('pair/poll', { method: 'POST', body: { poll } })).json()).toEqual({ status: 'pending' })
    const wrong = code === '000000' ? '111111' : '000000'
    expect((await call('pair/approve', { method: 'POST', body: { code: wrong }, cookie: admin })).status).toBe(404)
    expect((await call('pair/approve', { method: 'POST', body: { code } })).status).toBe(401)
    // Antes de aprobar se ve qué aparato lo pidió.
    expect((await call('pair/info', { method: 'POST', body: { code } })).status).toBe(401)
    const info = await (await call('pair/info', { method: 'POST', body: { code }, cookie: admin })).json()
    expect(info).toMatchObject({ label: 'TV · Living', kind: 'tv' })
    expect(typeof info.createdAt).toBe('number')
    expect((await call('pair/info', { method: 'POST', body: { code: wrong }, cookie: admin })).status).toBe(404)
    const ok = await call('pair/approve', { method: 'POST', body: { code: `${code.slice(0, 3)} ${code.slice(3)}` }, cookie: admin })
    expect(await ok.json()).toMatchObject({ ok: true, label: 'TV · Living', house: 'Casa Fede' })

    const done = await call('pair/poll', { method: 'POST', body: { poll } })
    expect(await done.json()).toEqual({ status: 'ok' })
    const tv = cookieOf(done)
    expect(done.headers.get('Set-Cookie')).toContain(`Max-Age=${365 * 24 * 60 * 60}`)
    const me = await (await call('me', { cookie: tv })).json()
    expect(me.session.device).toMatchObject({ label: 'TV · Living', kind: 'tv' })
    // Entra a la casa del admin, pero no es admin: eso es solo para los aparatos que pusieron la clave.
    expect(me.session.house).toMatchObject({ name: 'Casa Fede', isAdmin: false })
    expect((await call('houses', { cookie: tv })).status).toBe(403)

    // El secreto sirve una sola vez y el código ya no se puede volver a aprobar.
    expect((await call('pair/poll', { method: 'POST', body: { poll } })).status).toBe(410)
    expect((await call('pair/approve', { method: 'POST', body: { code }, cookie: admin })).status).toBe(404)
  })

  it('quien entra con invitación a la casa del admin tampoco es admin', async () => {
    const admin = await adminLogin()
    const adminHouse = (await (await call('me', { cookie: admin })).json()).session.house.id
    const { invite } = await (await call('houses/invite', { method: 'POST', body: { house: adminHouse }, cookie: admin })).json()
    const member = await join(invite)
    const me = await (await call('me', { cookie: member })).json()
    expect(me.session.house).toEqual({ id: adminHouse, name: 'Casa Fede', isAdmin: false })
    expect((await call('houses', { cookie: member })).status).toBe(403)
    expect((await push(member, [{ s: 'global', t: 'addons', k: 'list', v: '[]', u: 1 }])).body).toMatchObject({ forbidden: 1 })
  })

  it('volver a entrar en el mismo aparato cierra la sesión anterior', async () => {
    const first = await adminLogin()
    const res = await call('setup', { method: 'POST', body: { key: ADMIN_KEY, label: 'PC · Chrome' }, cookie: first })
    const second = cookieOf(res)
    expect((await (await call('me', { cookie: first })).json()).session).toBeNull()
    expect((await (await call('me', { cookie: second })).json()).session).toBeTruthy()
    expect(rawDb().prepare('SELECT id FROM sessions').all()).toHaveLength(1)
  })

  it('la sesión vence a los dos años aunque se use todos los días', async () => {
    const cookie = await adminLogin()
    rawDb().prepare('UPDATE sessions SET created_at = ?1').run(Date.now() - 2 * 365 * 86400_000 - 1000)
    forgetCachedSessions()
    expect((await (await call('me', { cookie })).json()).session).toBeNull()
  })

  it('el código de la TV no se puede aprobar dos veces ni desde dos casas', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    const { code } = await (await call('pair/start', { method: 'POST', body: { label: 'TV', tv: true } })).json()
    const [a, b] = await Promise.all([
      call('pair/approve', { method: 'POST', body: { code }, cookie: admin }),
      call('pair/approve', { method: 'POST', body: { code }, cookie: member }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 404])
  })

  it('aprobar códigos tiene tope por sesión (no se puede probar el millón de códigos)', async () => {
    const admin = await adminLogin()
    for (let i = 0; i < LIMITS.approve.n; i++) {
      expect((await call('pair/approve', { method: 'POST', body: { code: String(100000 + i) }, cookie: admin })).status).toBe(404)
    }
    expect((await call('pair/approve', { method: 'POST', body: { code: '999999' }, cookie: admin })).status).toBe(429)
  })

  it('aparatos: lista los de mi casa y cerrar uno lo deja afuera enseguida', async () => {
    const admin = await adminLogin()
    const { house, invite } = await newHouse(admin)
    const member = await join(invite)
    const list = await (await call('devices', { cookie: member })).json()
    expect(list.devices).toHaveLength(1)
    expect(list.devices[0]).toMatchObject({ label: 'Celu', current: true })

    // El admin ve y cierra los de otra casa.
    const seen = await (await call(`devices?house=${house.id}`, { cookie: admin })).json()
    expect(seen.devices[0].current).toBe(false)
    expect((await call('devices/revoke', { method: 'POST', body: { id: seen.devices[0].id, house: house.id }, cookie: admin })).status).toBe(200)
    expect((await call('me', { cookie: member })).status).toBe(200)
    expect((await (await call('me', { cookie: member })).json()).session).toBeNull()
  })

  it('salir borra la sesión y la cookie', async () => {
    const cookie = await adminLogin()
    const res = await call('logout', { method: 'POST', cookie })
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect((await (await call('me', { cookie })).json()).session).toBeNull()
  })

  it('borrar una casa saca sus aparatos y sus datos; la del admin no se borra', async () => {
    const admin = await adminLogin()
    const adminHouse = (await (await call('me', { cookie: admin })).json()).session.house.id
    expect((await call('houses/delete', { method: 'POST', body: { house: adminHouse }, cookie: admin })).status).toBe(400)
    const { house, invite } = await newHouse(admin)
    const member = await join(invite)
    await push(member, [{ s: 'profile', t: 'progress', k: 'tt1', v: '{"a":1}', u: 5 }])
    expect((await call('houses/delete', { method: 'POST', body: { house: house.id }, cookie: admin })).status).toBe(200)
    expect((await (await call('me', { cookie: member })).json()).session).toBeNull()
    const rows = rawDb().prepare('SELECT * FROM sync_items').all()
    expect(rows).toHaveLength(0)
  })

  it('normalizeInvite acepta el enlace o el código con guiones', () => {
    expect(normalizeInvite('https://x.pages.dev/unirse#abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN')
    expect(normalizeInvite('  abcd efgh jkmn ')).toBe('ABCDEFGHJKMN')
  })
})

describe('middleware de /api', () => {
  const next = async () => new Response('ok')
  const run = (path: string, cookie?: string, e: AuthEnv = env) => middleware({ request: req(path, { cookie }), env: e, next })

  it('TMDB y subtítulos piden sesión; _status y lo demás no', async () => {
    expect((await run('/api/tmdb/movie/603')).status).toBe(401)
    expect((await run('/api/subs/search?imdb=tt0133093&type=movie')).status).toBe(401)
    expect((await run('/api/tmdb/_status')).status).toBe(200)
    expect((await run('/api/subs/_status')).status).toBe(200)
    expect((await run('/api/segments?id=1')).status).toBe(200)
    const cookie = await adminLogin()
    expect(await (await run('/api/tmdb/movie/603', cookie)).text()).toBe('ok')
  })

  it('no se escapa con mayúsculas, %xx, barras dobles ni un _status al final', async () => {
    for (const p of ['/api/TMDB/movie/603', '/api/%74mdb/movie/603', '//api/tmdb/movie/603', '/api/tmdb//movie/603', '/api/tmdb/movie/603/_status', '/api/subs']) {
      expect((await run(p)).status, p).toBe(401)
    }
  })

  it('sin la base (sitio sin login) deja pasar todo, como antes', async () => {
    expect((await run('/api/tmdb/movie/603', undefined, {})).status).toBe(200)
  })
})

// ---------- Sincronización ----------

type Item = { s: string; t: string; k: string; v: string | null; u: number; d?: 1 }

async function push(cookie: string, items: Item[]) {
  const res = await syncPost({ request: req('/api/sync', { method: 'POST', body: { items }, cookie }), env })
  return { status: res.status, body: await res.json() }
}

async function pull(cookie: string, since = '', overlap = false) {
  const q = new URLSearchParams()
  if (since) q.set('since', since)
  if (overlap) q.set('overlap', '1')
  const res = await syncGet({ request: req(`/api/sync?${q}`, { cookie }), env })
  return { status: res.status, body: (await res.json()) as { items: Item[]; next: string; more: boolean } }
}

describe('/api/sync', () => {
  it('sin sesión: 401', async () => {
    expect((await pull('')).status).toBe(401)
    expect((await push('', [])).status).toBe(401)
  })

  it('sube y baja; gana el más nuevo y los borrados llegan como lápida', async () => {
    const admin = await adminLogin()
    await push(admin, [
      { s: 'profile', t: 'progress', k: 'tt1', v: '{"p":10}', u: 100 },
      { s: 'house', t: 'settings', k: 'autoplayNext', v: 'false', u: 100 },
    ])
    // Uno más viejo no pisa.
    const old = await push(admin, [{ s: 'profile', t: 'progress', k: 'tt1', v: '{"p":1}', u: 50 }])
    expect(old.body.saved).toBe(1)
    let got = (await pull(admin)).body
    expect(got.items.find((i) => i.k === 'tt1')).toMatchObject({ v: '{"p":10}', u: 100 })

    await push(admin, [{ s: 'profile', t: 'progress', k: 'tt1', v: null, u: 200, d: 1 }])
    got = (await pull(admin, got.next)).body
    expect(got.items).toEqual([{ s: 'profile', t: 'progress', k: 'tt1', v: null, u: 200, d: 1 }])
    // Desde el cursor, nada nuevo.
    expect((await pull(admin, got.next)).body.items).toEqual([])
  })

  it('cada casa ve solo lo suyo; los addons (global) los ven todas', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    await push(admin, [
      { s: 'profile', t: 'progress', k: 'tt-admin', v: '{}', u: 1 },
      { s: 'global', t: 'addons', k: 'list', v: '[]', u: 1 },
    ])
    await push(member, [{ s: 'profile', t: 'progress', k: 'tt-tia', v: '{}', u: 1 }])
    const keys = (await pull(member)).body.items.map((i) => i.k).sort()
    expect(keys).toEqual(['list', 'tt-tia'])
  })

  it('un miembro no puede cambiar los addons ni tiendas que no existen', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    const res = await push(member, [
      { s: 'global', t: 'addons', k: 'list', v: '[]', u: 1 },
      { s: 'house', t: 'secretos', k: 'x', v: '1', u: 1 },
      { s: 'profile', t: 'progress', k: '', v: '1', u: 1 },
      { s: 'profile', t: 'progress', k: 'tt1', v: '1', u: 1 },
    ])
    expect(res.body).toMatchObject({ saved: 1, forbidden: 1, rejected: 2 })
  })

  it('un reloj adelantado no gana para siempre', async () => {
    const admin = await adminLogin()
    await push(admin, [{ s: 'house', t: 'settings', k: 'hideSdh', v: 'true', u: Date.now() + 10 * 365 * 86400_000 }])
    // Si las dos caen en el mismo milisegundo, el tope las iguala y gana la primera.
    await new Promise((r) => setTimeout(r, 5))
    await push(admin, [{ s: 'house', t: 'settings', k: 'hideSdh', v: 'false', u: Date.now() + 120_000 }])
    expect((await pull(admin)).body.items[0].v).toBe('false')
  })

  it('pagina de a PAGE filas aunque todas tengan el mismo srv_ts', async () => {
    const admin = await adminLogin()
    const items = Array.from({ length: 300 }, (_, i) => ({ s: 'profile', t: 'progress', k: `tt${i}`, v: '{}', u: 1 }))
    await push(admin, items)
    await push(admin, items.map((it) => ({ ...it, k: `${it.k}b` })))
    await push(admin, items.map((it) => ({ ...it, k: `${it.k}c` })))
    const seen = new Set<string>()
    let since = ''
    for (let i = 0; i < 5; i++) {
      const page = (await pull(admin, since)).body
      page.items.forEach((it) => seen.add(it.k))
      since = page.next
      if (!page.more) break
      expect(page.items).toHaveLength(PAGE)
    }
    expect(seen.size).toBe(900)
  })

  it('un valor muy grande se rechaza (los addons tienen más lugar)', async () => {
    const admin = await adminLogin()
    const big = JSON.stringify('x'.repeat(40 * 1024))
    const res = await push(admin, [
      { s: 'profile', t: 'progress', k: 'tt1', v: big, u: 1 },
      { s: 'global', t: 'addons', k: 'list', v: big, u: 1 },
    ])
    expect(res.body).toMatchObject({ saved: 1, rejected: 1 })
  })

  it('cada aparato tiene un tope de subidas seguidas', async () => {
    const admin = await adminLogin()
    for (let i = 0; i < PUSH_LIMIT.n; i++) expect((await push(admin, [])).status).toBe(200)
    expect((await push(admin, [])).status).toBe(429)
  })

  it('cada casa tiene un tope de filas guardadas', async () => {
    const admin = await adminLogin()
    const { house, invite } = await newHouse(admin)
    const member = await join(invite)
    rawDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
         INSERT INTO sync_items (scope, store, key, value, updated_at, srv_ts, deleted)
         SELECT 'profile:' || ?1 || ':main', 'progress', 'tt' || i, '{}', 1, 1, 0 FROM n`,
      )
      .run(house.id, HOUSE_MAX_ROWS)
    expect((await push(member, [{ s: 'profile', t: 'progress', k: 'nuevo', v: '{}', u: 1 }])).status).toBe(507)
    // Las demás casas siguen.
    expect((await push(admin, [{ s: 'profile', t: 'progress', k: 'nuevo', v: '{}', u: 1 }])).status).toBe(200)
  })

  it('overlap relee los últimos segundos; el cursor roto baja todo', async () => {
    const admin = await adminLogin()
    await push(admin, [{ s: 'profile', t: 'ratings', k: 'tt1', v: '{}', u: 1 }])
    const first = (await pull(admin)).body
    expect((await pull(admin, first.next)).body.items).toHaveLength(0)
    expect((await pull(admin, first.next, true)).body.items).toHaveLength(1)
    expect(decodeCursor('basura')).toEqual([0, '', '', ''])
    expect(decodeCursor(encodeCursor([5, 'profile:á', 'x', 'ñ']))).toEqual([5, 'profile:á', 'x', 'ñ'])
  })
})

// ---------- Perfiles (v0.18) ----------

async function pushAs(cookie: string, profile: string, items: Item[]) {
  const res = await syncPost({ request: req(`/api/sync?profile=${encodeURIComponent(profile)}`, { method: 'POST', body: { items }, cookie }), env })
  return { status: res.status, body: await res.json() }
}

async function pullPart(cookie: string, part: 'shared' | 'profile', profile = 'main') {
  const res = await syncGet({ request: req(`/api/sync?part=${part}&profile=${encodeURIComponent(profile)}`, { cookie }), env })
  return { status: res.status, body: (await res.json()) as { items: Item[]; next: string; more: boolean } }
}

const keysOf = (items: Item[]) => items.map((i) => i.k).sort()

describe('/api/sync con perfiles', () => {
  it('un perfil mal escrito: 400', async () => {
    const admin = await adminLogin()
    expect((await pullPart(admin, 'profile', 'Mal:Id')).status).toBe(400)
    expect((await pushAs(admin, 'x', [])).status).toBe(400)
  })

  it('cada perfil tiene lo suyo; lo de la casa baja aparte y sin `part` se ve el principal (app v0.17)', async () => {
    const admin = await adminLogin()
    await pushAs(admin, 'main', [
      { s: 'profile', t: 'progress', k: 'tt-main', v: '{}', u: 1 },
      { s: 'house', t: 'profiles', k: 'ana123', v: '{"name":"Ana"}', u: 1 },
      { s: 'global', t: 'addons', k: 'list', v: '[]', u: 1 },
    ])
    await pushAs(admin, 'ana123', [{ s: 'profile', t: 'progress', k: 'tt-ana', v: '{}', u: 1 }])

    expect(keysOf((await pullPart(admin, 'shared')).body.items)).toEqual(['ana123', 'list'])
    expect(keysOf((await pullPart(admin, 'profile', 'main')).body.items)).toEqual(['tt-main'])
    expect(keysOf((await pullPart(admin, 'profile', 'ana123')).body.items)).toEqual(['tt-ana'])
    expect(keysOf((await pull(admin)).body.items)).toEqual(['ana123', 'list', 'tt-main'])
  })

  it('los perfiles son de cada casa', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    await pushAs(admin, 'ana123', [{ s: 'profile', t: 'progress', k: 'tt-fede', v: '{}', u: 1 }])
    await pushAs(member, 'ana123', [{ s: 'profile', t: 'progress', k: 'tt-tia', v: '{}', u: 1 }])
    expect(keysOf((await pullPart(member, 'profile', 'ana123')).body.items)).toEqual(['tt-tia'])
  })

  it('borrar un perfil borra sus datos del servidor y rechaza lo que suba después', async () => {
    const admin = await adminLogin()
    await pushAs(admin, 'main', [{ s: 'house', t: 'profiles', k: 'ana123', v: '{"name":"Ana"}', u: 1 }])
    await pushAs(admin, 'ana123', [
      { s: 'profile', t: 'progress', k: 'tt1', v: '{}', u: 1 },
      { s: 'profile', t: 'watchlist', k: 'tt2', v: '{}', u: 1 },
    ])
    await pushAs(admin, 'main', [{ s: 'house', t: 'profiles', k: 'ana123', v: null, u: 2, d: 1 }])
    const left = rawDb().prepare(`SELECT COUNT(*) AS n FROM sync_items WHERE scope LIKE 'profile:%:ana123'`).all()
    expect(left[0].n).toBe(0)

    // Un aparato que no se enteró sigue subiendo: no revive el perfil.
    const late = await pushAs(admin, 'ana123', [{ s: 'profile', t: 'progress', k: 'tt3', v: '{}', u: 3 }])
    expect(late.body).toMatchObject({ saved: 0, rejected: 1 })
    expect((await pullPart(admin, 'profile', 'ana123')).body.items).toEqual([])
  })

  it('el principal no se borra y las claves de perfiles se validan', async () => {
    const admin = await adminLogin()
    const res = await pushAs(admin, 'main', [
      { s: 'house', t: 'profiles', k: 'main', v: null, u: 1, d: 1 },
      { s: 'house', t: 'profiles', k: 'MAL ID', v: '{}', u: 1 },
      { s: 'house', t: 'profiles', k: 'main', v: '{"name":"Fede"}', u: 1 },
    ])
    expect(res.body).toMatchObject({ saved: 1, rejected: 2 })
  })

  it('el servidor tampoco deja pasar de 6 perfiles (el principal cuenta); borrar uno libera lugar', async () => {
    expect(SERVER_MAX_PROFILES).toBe(MAX_PROFILES)
    const admin = await adminLogin()
    const prof = (k: string, u = 1): Item => ({ s: 'house', t: 'profiles', k, v: `{"name":"${k}"}`, u })
    await pushAs(admin, 'main', [prof('main')])
    const five = ['perfil1', 'perfil2', 'perfil3', 'perfil4', 'perfil5']
    expect((await pushAs(admin, 'main', five.map((k) => prof(k)))).body).toMatchObject({ saved: 5, rejected: 0 })

    // El séptimo no entra, pero cambiar uno que ya existe sí.
    const res = await pushAs(admin, 'main', [prof('perfil6'), prof('perfil1', 2)])
    expect(res.body).toMatchObject({ saved: 1, rejected: 1 })
    expect(keysOf((await pullPart(admin, 'shared')).body.items)).toEqual(['main', ...five])

    // Borrar uno y crear otro en la misma subida.
    const swap = await pushAs(admin, 'main', [{ s: 'house', t: 'profiles', k: 'perfil2', v: null, u: 3, d: 1 }, prof('perfil6', 3)])
    expect(swap.body).toMatchObject({ saved: 2, rejected: 0 })
  })

  it('el tope es por casa', async () => {
    const admin = await adminLogin()
    const { invite } = await newHouse(admin)
    const member = await join(invite)
    const prof = (k: string): Item => ({ s: 'house', t: 'profiles', k, v: '{}', u: 1 })
    await pushAs(admin, 'main', ['perfil1', 'perfil2', 'perfil3', 'perfil4', 'perfil5'].map(prof))
    expect((await pushAs(member, 'main', [prof('perfil6')])).body).toMatchObject({ saved: 1, rejected: 0 })
  })
})

describe('esquema', () => {
  it('una base de una versión anterior recibe las columnas nuevas', async () => {
    const db = await fakeD1()
    db.raw.prepare(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, house_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run()
    db.raw.prepare(`CREATE TABLE pair_requests (code_hash TEXT PRIMARY KEY, poll_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, kind TEXT NOT NULL, house_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run()
    env = { DB: db, ADMIN_KEY }
    const cookie = await adminLogin()
    expect((await (await call('me', { cookie })).json()).session.house.isAdmin).toBe(true)
    expect((await call('pair/start', { method: 'POST', body: { label: 'TV', tv: true } })).status).toBe(200)
  })
})

describe('clientIp', () => {
  const ip = (v: string) => clientIp(new Request(SITE, { headers: { 'CF-Connecting-IP': v } }))
  it('IPv4 tal cual; IPv6 agrupada por /64 (un proveedor da un /64 entero a cada casa)', () => {
    expect(ip('200.1.2.3')).toBe('200.1.2.3')
    expect(ip('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64')
    expect(ip('2001:DB8:AA:BB::9')).toBe('2001:db8:aa:bb::/64')
    expect(ip('2001:db8::1')).toBe('2001:db8:0:0::/64')
  })
})

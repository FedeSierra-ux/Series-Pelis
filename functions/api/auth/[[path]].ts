// Cloudflare Pages Function: /api/auth/* — entrar con la casa, vincular la TV y (el admin) manejar las casas.
// Ver functions/_auth.ts. Todos los POST piden venir de una página del mismo sitio (`fromOwnSite`).

import {
  authEnabled,
  cleanLabel,
  cleanName,
  clearCookie,
  clearLimit,
  createSession,
  deleteSessions,
  ensureSchema,
  getSession,
  inviteCode,
  MIN_ADMIN_KEY,
  normalizeInvite,
  overLimit,
  PAIR_TTL_MS,
  pairCode,
  randomId,
  randomToken,
  readCookie,
  readJson,
  sameSecret,
  sessionCookie,
  sha256,
  sweep,
  unauthorized,
  type AuthEnv,
  type D1,
  type Session,
} from '../../_auth'
import { clientIp, crossSite, fromOwnSite, json } from '../../_lib'

const HOUR = 60 * 60 * 1000
/** Topes: clave del admin 5 por hora, invitaciones 10 por hora (por IP); códigos de la TV 5 cada 10 min (por sesión). */
export const LIMITS = {
  setup: { n: 5, ms: HOUR },
  join: { n: 10, ms: HOUR },
  pairStart: { n: 30, ms: HOUR },
  approve: { n: 10, ms: 10 * 60 * 1000 },
}
const MAX_HOUSES = 50

type Ctx = { request: Request; env: AuthEnv; params: { path?: string | string[] } }

const sessionInfo = (s: Session) => ({
  house: s.house,
  device: { id: s.id, label: s.label, kind: s.kind },
})

const kindOf = (body: Record<string, unknown>) => (body.tv === true ? 'tv' : 'web') as 'tv' | 'web'

/** "Buenos Aires, AR" según Cloudflare (`request.cf`); en local no hay. */
function originOf(request: Request): string | null {
  const cf = (request as Request & { cf?: { city?: unknown; country?: unknown } }).cf
  const parts = [cf?.city, cf?.country].filter((x): x is string => typeof x === 'string' && !!x)
  return parts.length ? parts.join(', ').slice(0, 80) : null
}

const notFoundCode = () => json({ error: 'Código incorrecto o vencido. Fijate el que muestra la TV ahora.' }, 404)

/** El código de 6 dígitos del cuerpo, con el tope de intentos de la sesión (adivinar no sirve). */
async function pairCodeOf(c: { request: Request; db: D1 }, s: Session): Promise<string | Response> {
  if (await overLimit(c.db, `approve:${s.id}`, LIMITS.approve.n, LIMITS.approve.ms)) return tooMany()
  const body = await readJson(c.request)
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
  return code.length === 6 ? code : json({ error: 'El código tiene 6 números' }, 400)
}

export const onRequest = async (context: Ctx): Promise<Response> => {
  const { request, env } = context
  const raw = context.params.path
  const route = (Array.isArray(raw) ? raw : raw ? [raw] : []).join('/')
  const method = request.method

  if (!authEnabled(env)) {
    if (route === 'me' && method === 'GET') return json({ enabled: false }, 200)
    return json({ error: 'El sitio no tiene casas configuradas' }, 404)
  }
  if (crossSite(request)) return json({ error: 'Solo desde la app' }, 403)
  if (method === 'POST' && !fromOwnSite(request)) return json({ error: 'Solo desde la app' }, 403)

  const db = env.DB
  try {
    await ensureSchema(db)
    const handler = ROUTES[`${method} ${route}`]
    if (!handler) return json({ error: 'No existe' }, 404)
    return await handler({ request, env, db })
  } catch (err) {
    console.warn('auth', err)
    return json({ error: 'La base no responde. Probá en un rato.' }, 503)
  }
}

type H = (c: { request: Request; env: AuthEnv; db: D1 }) => Promise<Response>

async function withSession(c: { request: Request; db: D1 }, fn: (s: Session) => Promise<Response>, admin = false): Promise<Response> {
  const s = await getSession(c.db, c.request)
  if (!s) return unauthorized()
  if (admin && !s.house.isAdmin) return json({ error: 'Solo el administrador' }, 403)
  return fn(s)
}

const withCookie = (res: Response, cookie: string) => {
  res.headers.append('Set-Cookie', cookie)
  return res
}

const tooMany = () => json({ error: 'Demasiados intentos. Esperá un rato y probá de nuevo.' }, 429, { 'Retry-After': '600' })

async function newInvite(db: D1, houseId: string, now = Date.now()): Promise<string> {
  const code = inviteCode()
  await db.batch([
    db.prepare('UPDATE invites SET revoked_at = ?2 WHERE house_id = ?1 AND revoked_at IS NULL').bind(houseId, now),
    db.prepare('INSERT INTO invites (code_hash, house_id, created_at) VALUES (?1, ?2, ?3)').bind(await sha256(code), houseId, now),
  ])
  return code
}

async function houseExists(db: D1, id: unknown): Promise<{ id: string; is_admin: number } | null> {
  if (typeof id !== 'string' || id.length > 40) return null
  return db.prepare('SELECT id, is_admin FROM houses WHERE id = ?1').bind(id).first<{ id: string; is_admin: number }>()
}

const ROUTES: Record<string, H> = {
  /** Estado del login: si hay sesión, de qué casa; si no, si falta crear la casa del admin. */
  'GET me': async ({ request, db }) => {
    const s = await getSession(db, request)
    if (s) {
      // Se vuelve a mandar la cookie para que su vencimiento acompañe al de la sesión (que se renueva con el uso).
      const res = json({ enabled: true, session: sessionInfo(s) }, 200)
      return withCookie(res, sessionCookie(readCookie(request)!, s.expiresAt - Date.now()))
    }
    const admin = await db.prepare('SELECT 1 AS x FROM houses WHERE is_admin = 1 LIMIT 1').first()
    return json({ enabled: true, session: null, needsSetup: !admin }, 200)
  },

  /** Crea la casa del administrador con `ADMIN_KEY`, o entra a ella si ya existe (recuperación). */
  'POST setup': async ({ request, env, db }) => {
    const key = env.ADMIN_KEY?.trim() ?? ''
    if (key.length < MIN_ADMIN_KEY) return json({ error: 'La clave del administrador no está configurada en el sitio (ADMIN_KEY).' }, 503)
    const limitKey = `setup:${clientIp(request)}`
    if (await overLimit(db, limitKey, LIMITS.setup.n, LIMITS.setup.ms)) return tooMany()
    const body = await readJson(request)
    if (!body || typeof body.key !== 'string' || !(await sameSecret(body.key.trim(), key))) {
      return json({ error: 'Clave incorrecta' }, 401)
    }
    await clearLimit(db, limitKey)
    let house = await db.prepare('SELECT id, name FROM houses WHERE is_admin = 1 LIMIT 1').first<{ id: string; name: string }>()
    if (!house) {
      house = { id: randomId(), name: cleanName(body.name) || 'Casa principal' }
      await db.prepare('INSERT INTO houses (id, name, is_admin, created_at) VALUES (?1, ?2, 1, ?3)').bind(house.id, house.name, Date.now()).run()
    }
    const cookie = await createSession(db, house.id, cleanLabel(body.label), kindOf(body), { admin: true, request })
    return withCookie(json({ ok: true, house: { ...house, isAdmin: true } }, 200), cookie)
  },

  /** Entrar con el enlace de invitación de una casa. */
  'POST join': async ({ request, db }) => {
    if (await overLimit(db, `join:${clientIp(request)}`, LIMITS.join.n, LIMITS.join.ms)) return tooMany()
    const body = await readJson(request)
    const code = typeof body?.code === 'string' ? normalizeInvite(body.code) : ''
    if (code.length < 10 || code.length > 20) return json({ error: 'El código de invitación no es válido' }, 400)
    const house = await db
      .prepare('SELECT h.id, h.name, h.is_admin FROM invites i JOIN houses h ON h.id = i.house_id WHERE i.code_hash = ?1 AND i.revoked_at IS NULL')
      .bind(await sha256(code))
      .first<{ id: string; name: string; is_admin: number }>()
    if (!house) return json({ error: 'Ese enlace no existe o ya se cambió. Pedile uno nuevo a quien te lo mandó.' }, 404)
    // Entrar con invitación nunca da permisos de admin (ni a la casa del admin): eso es solo con ADMIN_KEY.
    const cookie = await createSession(db, house.id, cleanLabel(body!.label), kindOf(body!), { request })
    return withCookie(json({ ok: true, house: { id: house.id, name: house.name, isAdmin: false } }, 200), cookie)
  },

  'POST logout': async ({ request, db }) => {
    const token = readCookie(request)
    if (token) await deleteSessions(db, { tokenHash: await sha256(token) })
    return withCookie(json({ ok: true }, 200), clearCookie())
  },

  /** La TV pide un código de 6 dígitos y un secreto para preguntar si ya la aprobaron. */
  'POST pair/start': async ({ request, db }) => {
    if (await overLimit(db, `pair:${clientIp(request)}`, LIMITS.pairStart.n, LIMITS.pairStart.ms)) return tooMany()
    const body = (await readJson(request)) ?? {}
    const now = Date.now()
    if (Math.random() < 0.05) await sweep(db, now)
    const poll = randomToken()
    for (let i = 0; i < 5; i++) {
      const code = pairCode()
      const codeHash = await sha256(code)
      // Un código vencido con el mismo número se reemplaza; uno vigente no (se prueba otro).
      await db.prepare('DELETE FROM pair_requests WHERE code_hash = ?1 AND expires_at < ?2').bind(codeHash, now).run()
      const res = await db
        .prepare('INSERT OR IGNORE INTO pair_requests (code_hash, poll_hash, label, kind, created_at, expires_at, origin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(codeHash, await sha256(poll), cleanLabel(body.label, 'TV'), kindOf(body), now, now + PAIR_TTL_MS, originOf(request))
        .run()
      if ((res.meta?.changes ?? 0) > 0) return json({ code, poll, expiresAt: now + PAIR_TTL_MS, interval: 3 }, 200)
    }
    return json({ error: 'No se pudo generar un código. Probá de nuevo.' }, 503)
  },

  /** La TV pregunta cada unos segundos; cuando la aprobaron, recibe su sesión (una sola vez). */
  'POST pair/poll': async ({ request, db }) => {
    const body = await readJson(request)
    if (typeof body?.poll !== 'string' || body.poll.length < 20 || body.poll.length > 100) return json({ status: 'expired' }, 410)
    const pollHash = await sha256(body.poll)
    const row = await db
      .prepare('SELECT code_hash, label, kind, house_id, expires_at FROM pair_requests WHERE poll_hash = ?1')
      .bind(pollHash)
      .first<{ code_hash: string; label: string; kind: string; house_id: string | null; expires_at: number }>()
    const now = Date.now()
    if (!row || row.expires_at < now) return json({ status: 'expired' }, 410)
    if (!row.house_id) return json({ status: 'pending' }, 200)
    // Se borra antes de crear la sesión: si dos pedidos llegan juntos, solo uno se la lleva.
    const del = await db.prepare('DELETE FROM pair_requests WHERE poll_hash = ?1 AND house_id IS NOT NULL').bind(pollHash).run()
    if ((del.meta?.changes ?? 0) === 0) return json({ status: 'expired' }, 410)
    const cookie = await createSession(db, row.house_id, row.label, row.kind === 'tv' ? 'tv' : 'web', { now, request })
    return withCookie(json({ status: 'ok' }, 200), cookie)
  },

  /**
   * Antes de aprobar: qué aparato pidió ese código, hace cuánto y desde dónde (lo dice Cloudflare). Así quien
   * aprueba ve si es su TV o un código que le mandó otro (el truco de "escaneá este QR").
   */
  'POST pair/info': (c) =>
    withSession(c, async (s) => {
      const code = await pairCodeOf(c, s)
      if (code instanceof Response) return code
      const row = await c.db
        .prepare('SELECT label, kind, created_at, origin FROM pair_requests WHERE code_hash = ?1 AND house_id IS NULL AND expires_at > ?2')
        .bind(await sha256(code), Date.now())
        .first<{ label: string; kind: string; created_at: number; origin: string | null }>()
      if (!row) return notFoundCode()
      return json({ label: row.label, kind: row.kind, createdAt: row.created_at, origin: row.origin ?? undefined, here: originOf(c.request) ?? undefined }, 200)
    }),

  /** Desde un aparato que ya entró: aprobar el código que muestra la TV. */
  'POST pair/approve': (c) =>
    withSession(c, async (s) => {
      const code = await pairCodeOf(c, s)
      if (code instanceof Response) return code
      // Un solo UPDATE: si dos aprueban a la vez, solo uno se lo lleva (y el otro recibe "vencido").
      const row = await c.db
        .prepare('UPDATE pair_requests SET house_id = ?2 WHERE code_hash = ?1 AND house_id IS NULL AND expires_at > ?3 RETURNING label')
        .bind(await sha256(code), s.house.id, Date.now())
        .first<{ label: string }>()
      if (!row) return notFoundCode()
      await clearLimit(c.db, `approve:${s.id}`)
      return json({ ok: true, label: row.label, house: s.house.name }, 200)
    }),

  /** Aparatos con sesión abierta en mi casa (o, para el admin, en la casa `?house=`). */
  'GET devices': (c) =>
    withSession(c, async (s) => {
      const asked = new URL(c.request.url).searchParams.get('house')
      let houseId = s.house.id
      if (asked && asked !== s.house.id) {
        if (!s.house.isAdmin) return json({ error: 'Solo el administrador' }, 403)
        if (!(await houseExists(c.db, asked))) return json({ error: 'Esa casa no existe' }, 404)
        houseId = asked
      }
      const { results } = await c.db
        .prepare('SELECT id, label, kind, created_at, last_seen_at FROM sessions WHERE house_id = ?1 AND expires_at > ?2 ORDER BY last_seen_at DESC')
        .bind(houseId, Date.now())
        .all<{ id: string; label: string; kind: string; created_at: number; last_seen_at: number }>()
      return json(
        { devices: results.map((d) => ({ id: d.id, label: d.label, kind: d.kind, createdAt: d.created_at, lastSeenAt: d.last_seen_at, current: d.id === s.id })) },
        200,
      )
    }),

  /** Cerrar la sesión de un aparato de mi casa (el admin: de cualquier casa). */
  'POST devices/revoke': (c) =>
    withSession(c, async (s) => {
      const body = await readJson(c.request)
      if (typeof body?.id !== 'string' || body.id.length > 40) return json({ error: 'Falta el aparato' }, 400)
      let houseId = s.house.id
      if (typeof body.house === 'string' && body.house !== s.house.id) {
        if (!s.house.isAdmin) return json({ error: 'Solo el administrador' }, 403)
        houseId = body.house
      }
      await deleteSessions(c.db, { id: body.id, houseId })
      const res = json({ ok: true }, 200)
      return body.id === s.id ? withCookie(res, clearCookie()) : res
    }),

  // ---------- Solo el administrador ----------

  'GET houses': (c) =>
    withSession(
      c,
      async () => {
        const { results } = await c.db
          .prepare(
            `SELECT h.id, h.name, h.is_admin, h.created_at,
               (SELECT COUNT(*) FROM sessions s WHERE s.house_id = h.id AND s.expires_at > ?1) AS devices,
               (SELECT COUNT(*) FROM invites i WHERE i.house_id = h.id AND i.revoked_at IS NULL) AS invites
             FROM houses h ORDER BY h.is_admin DESC, h.created_at`,
          )
          .bind(Date.now())
          .all<{ id: string; name: string; is_admin: number; created_at: number; devices: number; invites: number }>()
        return json(
          {
            houses: results.map((h) => ({ id: h.id, name: h.name, isAdmin: h.is_admin === 1, createdAt: h.created_at, devices: h.devices, hasInvite: h.invites > 0 })),
          },
          200,
        )
      },
      true,
    ),

  'POST houses': (c) =>
    withSession(
      c,
      async () => {
        const body = await readJson(c.request)
        const name = cleanName(body?.name)
        if (!name) return json({ error: 'Poné un nombre para la casa' }, 400)
        const count = await c.db.prepare('SELECT COUNT(*) AS n FROM houses').first<{ n: number }>()
        if ((count?.n ?? 0) >= MAX_HOUSES) return json({ error: `Hay un máximo de ${MAX_HOUSES} casas` }, 400)
        const id = randomId()
        await c.db.prepare('INSERT INTO houses (id, name, is_admin, created_at) VALUES (?1, ?2, 0, ?3)').bind(id, name, Date.now()).run()
        const invite = await newInvite(c.db, id)
        return json({ house: { id, name, isAdmin: false }, invite }, 200)
      },
      true,
    ),

  /** Enlace nuevo para una casa: el anterior deja de servir (los aparatos que ya entraron siguen). */
  'POST houses/invite': (c) =>
    withSession(
      c,
      async () => {
        const body = await readJson(c.request)
        const house = await houseExists(c.db, body?.house)
        if (!house) return json({ error: 'Esa casa no existe' }, 404)
        return json({ invite: await newInvite(c.db, house.id) }, 200)
      },
      true,
    ),

  'POST houses/invite/revoke': (c) =>
    withSession(
      c,
      async () => {
        const body = await readJson(c.request)
        const house = await houseExists(c.db, body?.house)
        if (!house) return json({ error: 'Esa casa no existe' }, 404)
        await c.db.prepare('UPDATE invites SET revoked_at = ?2 WHERE house_id = ?1 AND revoked_at IS NULL').bind(house.id, Date.now()).run()
        return json({ ok: true }, 200)
      },
      true,
    ),

  'POST houses/rename': (c) =>
    withSession(
      c,
      async () => {
        const body = await readJson(c.request)
        const name = cleanName(body?.name)
        const house = await houseExists(c.db, body?.house)
        if (!house) return json({ error: 'Esa casa no existe' }, 404)
        if (!name) return json({ error: 'Poné un nombre para la casa' }, 400)
        await c.db.prepare('UPDATE houses SET name = ?2 WHERE id = ?1').bind(house.id, name).run()
        return json({ ok: true }, 200)
      },
      true,
    ),

  /** Borra una casa con sus aparatos, invitaciones y datos sincronizados (la del admin no). */
  'POST houses/delete': (c) =>
    withSession(
      c,
      async () => {
        const body = await readJson(c.request)
        const house = await houseExists(c.db, body?.house)
        if (!house) return json({ error: 'Esa casa no existe' }, 404)
        if (house.is_admin === 1) return json({ error: 'La casa del administrador no se puede borrar' }, 400)
        await deleteSessions(c.db, { houseId: house.id })
        await c.db.batch([
          c.db.prepare('DELETE FROM invites WHERE house_id = ?1').bind(house.id),
          c.db.prepare('DELETE FROM pair_requests WHERE house_id = ?1').bind(house.id),
          c.db.prepare('DELETE FROM sync_items WHERE scope = ?1 OR scope LIKE ?2').bind(`house:${house.id}`, `profile:${house.id}:%`),
          c.db.prepare('DELETE FROM houses WHERE id = ?1').bind(house.id),
        ])
        return json({ ok: true }, 200)
      },
      true,
    ),
}

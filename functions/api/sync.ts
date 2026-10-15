// Cloudflare Pages Function: /api/sync — sincronización de los datos de la casa en D1 (v0.17).
//
// Cada dato es una fila (scope, store, key) con su valor en JSON y `updated_at` (cuándo lo cambió el
// aparato). Gana el más nuevo; un borrado es una fila con `deleted = 1` (lápida) para que llegue a los
// demás aparatos. `srv_ts` es cuándo lo guardó el servidor: los aparatos piden "lo nuevo desde X".
//
// Alcances (el aparato nunca elige la casa: sale de la sesión):
// - global:  los addons (iguales en todas las casas). Los lee cualquiera; solo el admin los cambia.
// - house:   ajustes generales y el idioma elegido por título, iguales en toda la casa.
// - profile: historial, seguir viendo, mi lista, estrellas, "no me interesa", diario y metas.
//            En la v0.17 hay un solo perfil por casa ("main"); los perfiles llegan en la v0.18.

import { authEnabled, ensureSchema, getSession, unauthorized, type AuthEnv, type Session } from '../_auth'
import { crossSite, fromOwnSite, json } from '../_lib'

export const SYNC_STORES = {
  global: ['addons'],
  house: ['settings', 'trackPrefs'],
  profile: ['progress', 'watchlist', 'ratings', 'notInterested', 'diary', 'goals'],
} as const
export type SyncScope = keyof typeof SYNC_STORES

/** Filas por página al bajar (el plan gratis de Functions da 10 ms de CPU por pedido). */
export const PAGE = 500
/** Por subida: filas y tamaño. La app parte lo que tenga en tandas de este tamaño. */
export const MAX_ITEMS = 300
export const MAX_BODY = 512 * 1024
const MAX_KEY = 200
const MAX_VALUE = 256 * 1024
/** Un aparato con el reloj adelantado no puede "ganar" para siempre: lo del futuro cuenta como ahora. */
const CLOCK_SKEW_MS = 60_000
export const OVERLAP_MS = 15_000

const scopeId = (scope: SyncScope, s: Session) => (scope === 'global' ? 'global' : scope === 'house' ? `house:${s.house.id}` : `profile:${s.house.id}:main`)

function scopeName(id: string): SyncScope {
  return id === 'global' ? 'global' : id.startsWith('house:') ? 'house' : 'profile'
}

/** Cursor = la última fila leída (srv_ts, scope, store, key), en base64url. */
export function encodeCursor(row: [number, string, string, string]): string {
  let bin = ''
  for (const b of new TextEncoder().encode(JSON.stringify(row))) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursor(raw: string | null): [number, string, string, string] {
  if (!raw) return [0, '', '', '']
  try {
    const bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
    const v: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    if (Array.isArray(v) && v.length === 4 && typeof v[0] === 'number' && v.slice(1).every((x) => typeof x === 'string')) return v as [number, string, string, string]
  } catch {
    // Cursor roto: se baja todo de nuevo (aplicar dos veces lo mismo no cambia nada).
  }
  return [0, '', '', '']
}

type Ctx = { request: Request; env: AuthEnv }

async function session(context: Ctx): Promise<Session | Response> {
  const { request, env } = context
  if (!authEnabled(env)) return json({ error: 'El sitio no tiene casas configuradas' }, 404)
  if (crossSite(request)) return json({ error: 'Solo desde la app' }, 403)
  try {
    await ensureSchema(env.DB)
    return (await getSession(env.DB, request)) ?? unauthorized()
  } catch {
    return json({ error: 'La base no responde. Probá en un rato.' }, 503)
  }
}

interface Row {
  scope: string
  store: string
  key: string
  value: string | null
  updated_at: number
  srv_ts: number
  deleted: number
}

/** Lo que cambió desde `?since=<cursor>` en los alcances de esta sesión, de a `PAGE` filas. */
export const onRequestGet = async (context: Ctx): Promise<Response> => {
  const s = await session(context)
  if (s instanceof Response) return s
  const db = context.env.DB!
  const params = new URL(context.request.url).searchParams
  let [ts, scope, store, key] = decodeCursor(params.get('since'))
  // Al empezar cada bajada, la app pide releer los últimos segundos: dos aparatos que guardan a la vez
  // pueden terminar con un `srv_ts` apenas anterior a lo que otro ya leyó.
  if (params.get('overlap') === '1' && ts > 0) [ts, scope, store, key] = [Math.max(0, ts - OVERLAP_MS), '', '', '']
  try {
    const { results } = await db
      .prepare(
        `SELECT scope, store, key, value, updated_at, srv_ts, deleted FROM sync_items
         WHERE scope IN (?1, ?2, ?3) AND srv_ts >= ?4 AND (srv_ts, scope, store, key) > (?4, ?5, ?6, ?7)
         ORDER BY srv_ts, scope, store, key LIMIT ${PAGE}`,
      )
      .bind(scopeId('global', s), scopeId('house', s), scopeId('profile', s), ts, scope, store, key)
      .all<Row>()
    const last = results[results.length - 1]
    return json(
      {
        items: results.map((r) => ({ s: scopeName(r.scope), t: r.store, k: r.key, v: r.deleted ? null : r.value, u: r.updated_at, ...(r.deleted ? { d: 1 } : {}) })),
        next: last ? encodeCursor([last.srv_ts, last.scope, last.store, last.key]) : encodeCursor([ts, scope, store, key]),
        more: results.length === PAGE,
        now: Date.now(),
      },
      200,
    )
  } catch {
    return json({ error: 'La base no responde. Probá en un rato.' }, 503)
  }
}

export interface PushItem {
  s: SyncScope
  t: string
  k: string
  /** Valor en JSON (texto); `null` si es un borrado. */
  v: string | null
  u: number
  d?: 1
}

/** Valida una fila subida; `undefined` si no se acepta. */
export function cleanItem(raw: unknown, isAdmin: boolean, now: number): PushItem | 'forbidden' | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const it = raw as Record<string, unknown>
  const scope = it.s as SyncScope
  if (!(scope in SYNC_STORES) || !(SYNC_STORES[scope] as readonly string[]).includes(it.t as string)) return undefined
  if (typeof it.k !== 'string' || !it.k || it.k.length > MAX_KEY) return undefined
  if (typeof it.u !== 'number' || !Number.isFinite(it.u) || it.u < 0) return undefined
  const deleted = it.d === 1
  if (!deleted && (typeof it.v !== 'string' || it.v.length > MAX_VALUE)) return undefined
  if (scope === 'global' && !isAdmin) return 'forbidden'
  return { s: scope, t: it.t as string, k: it.k, v: deleted ? null : (it.v as string), u: Math.min(Math.round(it.u), now + CLOCK_SKEW_MS), ...(deleted ? { d: 1 as const } : {}) }
}

/** Sube cambios: `{ items: PushItem[] }`. Cada fila se guarda solo si es más nueva que la del servidor. */
export const onRequestPost = async (context: Ctx): Promise<Response> => {
  const { request } = context
  if (!fromOwnSite(request)) return json({ error: 'Solo desde la app' }, 403)
  const s = await session(context)
  if (s instanceof Response) return s
  const db = context.env.DB!

  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return json({ error: 'Demasiado grande' }, 413)
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) return json({ error: 'Demasiado grande' }, 413)
    body = JSON.parse(text)
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const rawItems = (body as { items?: unknown })?.items
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) return json({ error: `Hasta ${MAX_ITEMS} cambios por vez` }, 400)

  const now = Date.now()
  let rejected = 0
  let forbidden = 0
  const rows: [string, string, string, string | null, number, number][] = []
  for (const raw of rawItems) {
    const it = cleanItem(raw, s.house.isAdmin, now)
    if (it === 'forbidden') forbidden++
    else if (!it) rejected++
    else rows.push([scopeId(it.s, s), it.t, it.k, it.v, it.u, it.d ? 1 : 0])
  }
  if (rows.length) {
    try {
      // Una sola consulta con todas las filas como un JSON (D1 limita a 100 parámetros por consulta).
      await db
        .prepare(
          `INSERT INTO sync_items (scope, store, key, value, updated_at, srv_ts, deleted)
           SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'),
                  json_extract(j.value, '$[3]'), json_extract(j.value, '$[4]'), ?2, json_extract(j.value, '$[5]')
           FROM json_each(?1) AS j WHERE 1
           ON CONFLICT (scope, store, key) DO UPDATE SET
             value = excluded.value, updated_at = excluded.updated_at, srv_ts = excluded.srv_ts, deleted = excluded.deleted
           WHERE excluded.updated_at > sync_items.updated_at`,
        )
        .bind(JSON.stringify(rows), now)
        .run()
    } catch {
      return json({ error: 'La base no responde. Probá en un rato.' }, 503)
    }
  }
  return json({ ok: true, saved: rows.length, rejected, forbidden, now }, 200)
}

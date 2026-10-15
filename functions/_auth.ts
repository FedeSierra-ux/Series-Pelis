// Login de las casas (v0.17): sesiones, casas, invitaciones y vinculación de la TV, todo en D1.
// Cloudflare no enruta los archivos que empiezan con "_": este solo se importa.
//
// - Sesiones opacas: el aparato guarda un token al azar en la cookie `__Host-sp_s` (HttpOnly) y en D1
//   solo queda su SHA-256. Duran 1 año en la TV y 6 meses en PC/celular, y se renuevan con el uso.
// - La casa (`house_id`) sale siempre de la sesión, nunca de lo que mande el cliente.
// - Invitaciones (`/unirse#CODIGO`) y códigos de la TV también se guardan con hash.

import { json } from './_lib'

// ---------- D1 (lo justo, sin depender de @cloudflare/workers-types) ----------

export interface D1Result<T = Record<string, unknown>> {
  results: T[]
  meta?: { changes?: number }
}
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}
export interface D1 {
  prepare(sql: string): D1Stmt
  batch(stmts: D1Stmt[]): Promise<D1Result[]>
}

export interface AuthEnv {
  DB?: D1
  /** Clave para crear (o recuperar) la casa del administrador. Mínimo 32 caracteres. */
  ADMIN_KEY?: string
}

export const COOKIE = '__Host-sp_s'
export const DAY = 24 * 60 * 60 * 1000
export const TV_SESSION_MS = 365 * DAY
export const WEB_SESSION_MS = 182 * DAY
/** `last_seen_at` / `expires_at` se actualizan como mucho una vez por día (escrituras de D1). */
const SLIDE_MS = DAY
/** Los códigos de la TV vencen a los 10 minutos. */
export const PAIR_TTL_MS = 10 * 60 * 1000
export const MIN_ADMIN_KEY = 32
/** Una sesión dura como mucho esto aunque se use todos los días: una cookie robada no vale para siempre. */
export const MAX_SESSION_AGE_MS = 2 * 365 * DAY

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, house_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS sessions_house ON sessions(house_id)`,
  `CREATE TABLE IF NOT EXISTS pair_requests (code_hash TEXT PRIMARY KEY, poll_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, kind TEXT NOT NULL, house_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, origin TEXT)`,
  `CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY, house_id TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS invites_house ON invites(house_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_items (scope TEXT NOT NULL, store TEXT NOT NULL, key TEXT NOT NULL, value TEXT, updated_at INTEGER NOT NULL, srv_ts INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (scope, store, key))`,
  `CREATE INDEX IF NOT EXISTS sync_scope_ts ON sync_items(scope, srv_ts)`,
]

/** Columnas que se sumaron después de crear las tablas (una base de una versión anterior no las tiene). */
const ADDED_COLUMNS = [
  `ALTER TABLE sessions ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pair_requests ADD COLUMN origin TEXT`,
]

async function addColumns(db: D1): Promise<void> {
  for (const sql of ADDED_COLUMNS) {
    try {
      await db.prepare(sql).run()
    } catch (err) {
      // Ya estaba: es lo normal en una base nueva.
      if (!/duplicate column/i.test(String((err as Error)?.message ?? err))) throw err
    }
  }
}

/** Las tablas se crean solas la primera vez que cada instancia del Worker usa la base. */
const ready = new WeakMap<D1, Promise<void>>()
export function ensureSchema(db: D1): Promise<void> {
  let p = ready.get(db)
  if (!p) {
    p = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(
      () => addColumns(db),
      (err) => {
        ready.delete(db)
        throw err
      },
    )
    ready.set(db, p)
  }
  return p
}

// ---------- Hash y códigos al azar ----------

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** id público (casas, aparatos): hexadecimal, así nunca choca con los comodines de LIKE. */
export function randomId(bytes = 12): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Sin 0/O, 1/I/L ni U: se puede dictar por teléfono. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
/** 12 símbolos de un alfabeto de 30 ≈ 59 bits: no se adivina ni con el tope por IP. */
export function inviteCode(): string {
  return pick(INVITE_ALPHABET, 12)
}

function pick(alphabet: string, n: number): string {
  let out = ''
  // Rechazo para no sesgar: solo valores < múltiplo exacto del largo del alfabeto.
  const max = 256 - (256 % alphabet.length)
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (b < max && out.length < n) out += alphabet[b % alphabet.length]
    }
  }
  return out
}

/** Código de 6 dígitos para la TV. */
export const pairCode = () => pick('0123456789', 6)

/** Lo que el usuario escribió como invitación: el enlace entero, con guiones o en minúsculas. */
export function normalizeInvite(raw: string): string {
  const text = raw.trim()
  const hash = text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text
  return hash.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Comparación en tiempo constante (para la clave del administrador). */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i)
  return diff === 0
}

// ---------- Tope de pedidos en D1 (compartido por todas las instancias) ----------

/** `true` si `key` ya hizo `limit` intentos en la ventana (y cuenta este). */
export async function overLimit(db: D1, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, now - windowMs)
    .first<{ count: number }>()
  return (row?.count ?? 0) > limit
}

/** Después de un intento bien hecho se perdonan los anteriores. */
export async function clearLimit(db: D1, key: string) {
  await db.prepare('DELETE FROM rate_limits WHERE key = ?1').bind(key).run()
}

/** Limpieza de vez en cuando (sesiones vencidas, códigos viejos, topes pasados). */
export async function sweep(db: D1, now = Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM pair_requests WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - DAY),
  ])
}

// ---------- Sesiones ----------

export interface House {
  id: string
  name: string
  /**
   * ¿Este aparato es del administrador? Solo los que entraron con `ADMIN_KEY` (no toda la casa del admin:
   * la TV o un invitado de esa casa no pueden crear casas ni cambiar los addons de todos).
   */
  isAdmin: boolean
}

export interface Session {
  /** id público del aparato (para listarlo y cerrarlo); nunca el token. */
  id: string
  tokenHash: string
  label: string
  kind: 'tv' | 'web'
  house: House
  lastSeenAt: number
  expiresAt: number
  createdAt: number
}

interface SessionRow {
  token_hash: string
  id: string
  label: string
  kind: string
  last_seen_at: number
  expires_at: number
  created_at: number
  house_id: string
  name: string
  is_admin: number
  s_admin: number
}

const fromRow = (r: SessionRow): Session => ({
  id: r.id,
  tokenHash: r.token_hash,
  label: r.label,
  kind: r.kind === 'tv' ? 'tv' : 'web',
  house: { id: r.house_id, name: r.name, isAdmin: r.is_admin === 1 && r.s_admin === 1 },
  lastSeenAt: r.last_seen_at,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
})

/**
 * Caché de 60 s por instancia: la app pide TMDB y subtítulos seguido y cada pedido costaría una lectura.
 * Una sesión cerrada desde otro aparato deja de andar en como mucho un minuto.
 */
const CACHE_MS = 60_000
const cache = new Map<string, { s: Session; until: number }>()
export const forgetCachedSessions = () => cache.clear()
const uncache = (pred: (s: Session) => boolean) => {
  for (const [k, v] of cache) if (pred(v.s)) cache.delete(k)
}

export function readCookie(request: Request, name = COOKIE): string | undefined {
  const raw = request.headers.get('Cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

export function sessionCookie(token: string, maxAgeMs: number): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/** La sesión del pedido (o `null`). Renueva el vencimiento una vez por día. */
export async function getSession(db: D1, request: Request, now = Date.now()): Promise<Session | null> {
  const token = readCookie(request)
  if (!token || token.length < 20 || token.length > 100) return null
  const hash = await sha256(token)
  const hit = cache.get(hash)
  if (hit && hit.until > now && hit.s.expiresAt > now) return hit.s
  await ensureSchema(db)
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.id, s.label, s.kind, s.last_seen_at, s.expires_at, s.created_at, s.is_admin AS s_admin, h.id AS house_id, h.name, h.is_admin
       FROM sessions s JOIN houses h ON h.id = s.house_id WHERE s.token_hash = ?1`,
    )
    .bind(hash)
    .first<SessionRow>()
  if (!row || row.expires_at <= now || row.created_at + MAX_SESSION_AGE_MS <= now) {
    cache.delete(hash)
    return null
  }
  const s = fromRow(row)
  if (now - s.lastSeenAt >= SLIDE_MS) {
    s.lastSeenAt = now
    s.expiresAt = Math.min(now + (s.kind === 'tv' ? TV_SESSION_MS : WEB_SESSION_MS), s.createdAt + MAX_SESSION_AGE_MS)
    await db.prepare('UPDATE sessions SET last_seen_at = ?2, expires_at = ?3 WHERE token_hash = ?1').bind(hash, s.lastSeenAt, s.expiresAt).run()
  }
  cache.set(hash, { s, until: now + CACHE_MS })
  return s
}

/**
 * Crea la sesión de un aparato y devuelve la cookie para mandarle. `admin` solo lo pone la entrada con
 * `ADMIN_KEY`. Si el pedido ya traía una sesión (entrar de nuevo, cambiar de casa), la vieja se cierra.
 */
export async function createSession(
  db: D1,
  houseId: string,
  label: string,
  kind: 'tv' | 'web',
  opts: { now?: number; admin?: boolean; request?: Request } = {},
): Promise<string> {
  const now = opts.now ?? Date.now()
  const old = opts.request && readCookie(opts.request)
  if (old) await deleteSessions(db, { tokenHash: await sha256(old) })
  const token = randomToken()
  const ms = kind === 'tv' ? TV_SESSION_MS : WEB_SESSION_MS
  await db
    .prepare('INSERT INTO sessions (token_hash, id, house_id, label, kind, created_at, last_seen_at, expires_at, is_admin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8)')
    .bind(await sha256(token), randomId(), houseId, label, kind, now, now + ms, opts.admin ? 1 : 0)
    .run()
  return sessionCookie(token, ms)
}

export async function deleteSessions(db: D1, where: { id?: string; houseId?: string; tokenHash?: string }) {
  if (where.tokenHash) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(where.tokenHash).run()
    uncache((s) => s.tokenHash === where.tokenHash)
  } else if (where.id && where.houseId) {
    await db.prepare('DELETE FROM sessions WHERE id = ?1 AND house_id = ?2').bind(where.id, where.houseId).run()
    uncache((s) => s.id === where.id)
  } else if (where.houseId) {
    await db.prepare('DELETE FROM sessions WHERE house_id = ?1').bind(where.houseId).run()
    uncache((s) => s.house.id === where.houseId)
  }
}

/** Nombre del aparato tal como lo manda la app ("TV · Chrome"), sin caracteres raros. */
export function cleanLabel(raw: unknown, fallback = 'Aparato'): string {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  return text || fallback
}

export function cleanName(raw: unknown): string {
  return cleanLabel(raw, '').slice(0, 40)
}

/**
 * El cuerpo como texto, cortando apenas pasa `maxBytes` (sin `Content-Length` no se lee entero antes de
 * mirar el tamaño). `null` si es más grande.
 */
export async function readText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

/** Lee el cuerpo JSON con tope de tamaño (un POST de login nunca pasa de unos cientos de bytes). */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 4096): Promise<T | null> {
  try {
    const text = await readText(request, maxBytes)
    if (text === null) return null
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
  } catch {
    return null
  }
}

/** Respuesta 401 estándar (la app la usa para volver a la pantalla de entrada). */
export const unauthorized = () => json({ error: 'Tenés que entrar con tu casa', auth: true }, 401)

/** ¿El sitio tiene login? Sin el binding `DB`, la app funciona como antes (sin casas). */
export const authEnabled = (env: AuthEnv): env is AuthEnv & { DB: D1 } => !!env.DB

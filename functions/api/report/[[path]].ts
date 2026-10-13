// Cloudflare Pages Function: /api/report → informes de errores (opt-in) en un KV.
//
// En una TV no se puede "copiar el detalle" de un error: la app lo manda acá y el dueño lo lee con curl.
// Lo que llega ya viene sin URLs completas de addons ni de streams (src/lib/diagnostics.ts), pero acá se
// vuelve a recortar todo campo por campo: nunca se guarda una URL con la key del debrid.
//
//   POST /api/report            guarda un informe (solo desde la app, 16 kB máx., 20 por hora por IP)
//   GET  /api/report/_status    { enabled } — ¿el sitio tiene el KV REPORTS?
//   GET  /api/report?limit=50   los últimos informes; pide `Authorization: Bearer <REPORT_ADMIN_KEY>`
//
// Config en Cloudflare (ver wrangler.toml): binding KV `REPORTS` y secreto `REPORT_ADMIN_KEY`.

import { crossSite, json } from '../../_lib'

export const MAX_BODY = 16 * 1024
export const RATE_LIMIT = 20
const RATE_WINDOW_S = 60 * 60
const REPORT_TTL_S = 60 * 60 * 24 * 30
const KINDS = new Set(['player', 'addon', 'app', 'manual'])
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i
const INSTALL_ID = /^[a-z0-9-]{8,64}$/
// Clave de orden invertido: KV lista por clave ascendente, así los más nuevos salen primero.
const TS_MAX = 9_999_999_999_999

/** Lo que usamos de un KV Namespace (sin depender de @cloudflare/workers-types). */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>
}

export interface Env {
  REPORTS?: KvLike
  REPORT_ADMIN_KEY?: string
}

type Context = { request: Request; env: Env; params: { path?: string | string[] } }

export interface StoredReport {
  kind: string
  message: string
  name?: string
  stack?: string
  route: string
  version: string
  platform: { ua: string; os: string; tv: boolean }
  theme: string
  addons: string[]
  stream?: { host: string; type: string }
  comment?: string
  context?: Record<string, string>
  installId: string
  /** Lo pone el servidor. */
  receivedAt: string
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

/** Solo el host de una URL (o lo que ya era un host); cualquier otra cosa se descarta. */
export function hostOnly(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim().slice(0, 300)
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return new URL(v).host.toLowerCase()
  } catch {
    return ''
  }
  return HOST.test(v) ? v.toLowerCase() : ''
}

/** Texto libre: toda URL se reemplaza por su host (el mensaje de un HttpError trae la URL del addon). */
export function scrubUrls(text: string): string {
  return text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()[\]]+/gi, (m) => hostOnly(m) || '[url]')
}

function parts(ctx: Context): string[] {
  const raw = ctx.params.path
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

/** Normaliza y recorta el informe. `null` si no tiene la forma mínima. */
export function sanitizeReport(input: unknown): Omit<StoredReport, 'receivedAt'> | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  const kind = str(r.kind, 10)
  if (!KINDS.has(kind)) return null
  const installId = str(r.installId, 64)
  if (!INSTALL_ID.test(installId)) return null
  const message = scrubUrls(str(r.message, 1000))
  const route = str(r.route, 300).split(/[?#]/)[0]
  const platform = (r.platform && typeof r.platform === 'object' ? r.platform : {}) as Record<string, unknown>
  const addons = Array.isArray(r.addons) ? r.addons.slice(0, 20).map(hostOnly).filter(Boolean) : []
  const out: Omit<StoredReport, 'receivedAt'> = {
    kind,
    message,
    route,
    version: str(r.version, 40),
    platform: { ua: str(platform.ua, 300), os: str(platform.os, 20), tv: platform.tv === true },
    theme: str(r.theme, 4),
    addons,
    installId,
  }
  const name = str(r.name, 100)
  if (name) out.name = name
  const stack = scrubUrls(str(r.stack, 2000))
  if (stack) out.stack = stack
  if (r.stream && typeof r.stream === 'object') {
    const s = r.stream as Record<string, unknown>
    const host = hostOnly(s.host ?? s.url)
    if (host) out.stream = { host, type: str(s.type, 20) }
  }
  const comment = str(r.comment, 500).trim()
  if (comment) out.comment = scrubUrls(comment)
  if (r.context && typeof r.context === 'object') {
    const context: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.context as Record<string, unknown>).slice(0, 20)) {
      if (typeof v === 'string' && k.length <= 40) context[k] = scrubUrls(v.slice(0, 300))
    }
    if (Object.keys(context).length) out.context = context
  }
  return out
}

/** Comparación en tiempo constante (que el tiempo de respuesta no delate la clave). */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function overLimit(kv: KvLike, ip: string): Promise<boolean> {
  const key = `rl:${ip}`
  const now = Math.floor(Date.now() / 1000)
  let n = 0
  let reset = now + RATE_WINDOW_S
  try {
    const stored = JSON.parse((await kv.get(key)) ?? 'null') as { n?: number; reset?: number } | null
    if (stored && typeof stored.reset === 'number' && stored.reset > now) {
      n = typeof stored.n === 'number' ? stored.n : 0
      reset = stored.reset
    }
  } catch {
    // Valor roto: se arranca de cero.
  }
  if (n >= RATE_LIMIT) return true
  await kv.put(key, JSON.stringify({ n: n + 1, reset }), { expirationTtl: Math.max(60, reset - now) })
  return false
}

export const onRequestGet = async (ctx: Context): Promise<Response> => {
  const { request, env } = ctx
  const p = parts(ctx)
  if (p.length === 1 && p[0] === '_status') {
    return json({ enabled: !!env.REPORTS }, 200, { 'Cache-Control': 'public, max-age=300' })
  }
  if (p.length !== 0) return json({ ok: false, reason: 'not_found' }, 404)

  // Lectura de informes: solo con el secreto. Sin secreto configurado la ruta no existe.
  const admin = env.REPORT_ADMIN_KEY?.trim()
  if (!admin) return json({ ok: false, reason: 'not_found' }, 404)
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !sameSecret(token, admin)) return json({ ok: false, reason: 'unauthorized' }, 401)
  if (!env.REPORTS) return json({ ok: false, reason: 'disabled' }, 503)

  const wanted = Number(new URL(request.url).searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(wanted) ? Math.min(200, Math.max(1, Math.floor(wanted))) : 50
  const { keys } = await env.REPORTS.list({ prefix: 'r:', limit })
  const reports = await Promise.all(
    keys.map(async ({ name }) => {
      try {
        return { key: name, ...(JSON.parse((await env.REPORTS!.get(name)) ?? 'null') as StoredReport | null) }
      } catch {
        return { key: name }
      }
    }),
  )
  return json({ ok: true, count: reports.length, reports }, 200)
}

export const onRequestPost = async (ctx: Context): Promise<Response> => {
  const { request, env } = ctx
  if (parts(ctx).length !== 0) return json({ ok: false, reason: 'not_found' }, 404)
  if (crossSite(request)) return json({ ok: false, reason: 'cross_site' }, 403)
  if (!env.REPORTS) return json({ ok: false, reason: 'disabled' }, 503)

  const declared = Number(request.headers.get('Content-Length') ?? 0)
  if (declared > MAX_BODY) return json({ ok: false, reason: 'too_large' }, 413)
  const text = await request.text()
  if (text.length > MAX_BODY) return json({ ok: false, reason: 'too_large' }, 413)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400)
  }
  const report = sanitizeReport(parsed)
  if (!report) return json({ ok: false, reason: 'invalid' }, 400)

  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'unknown'
  if (await overLimit(env.REPORTS, ip)) return json({ ok: false, reason: 'rate_limited' }, 429, { 'Retry-After': '3600' })

  const ts = Date.now()
  const stored: StoredReport = { ...report, receivedAt: new Date(ts).toISOString() }
  const key = `r:${String(TS_MAX - ts).padStart(13, '0')}:${report.installId}`
  await env.REPORTS.put(key, JSON.stringify(stored), { expirationTtl: REPORT_TTL_S })
  return json({ ok: true, key }, 200)
}

// Cloudflare Pages Function: subtítulos online en español (latino primero).
// SubDL es la fuente principal (tiene el archivo de Subscene) y OpenSubtitles el respaldo cuando SubDL no
// trae nada. Las keys viven como secretos del proyecto, nunca en el código ni en la app.
//
//   GET /api/subs/_status                          { enabled, sources } — ¿el sitio tiene subtítulos online?
//   GET /api/subs/search?imdb=tt…&type=movie|series[&s=1&e=2]   lista de subtítulos (solo desde la app)
//   GET /api/subs/sd/<id>[?s=1&e=2]                el .srt de SubDL, sacado del .zip
//   GET /api/subs/os/<file_id>                     el .srt de OpenSubtitles
//
// Las búsquedas y los archivos se guardan en la caché de Cloudflare: cada episodio se baja una sola vez para
// todas las casas (el plan gratis de SubDL da 50 descargas por día, OpenSubtitles 20).
//
// Secretos (opcionales): SUBDL_KEY; OPENSUBTITLES_KEY (+ OPENSUBTITLES_USER y OPENSUBTITLES_PASS para pasar de
// 5 a 20 descargas por día).

import { zipEntries } from '../../_zip'
import { clientIp, crossSite, fromOwnSite, json, memoryRateLimit } from '../../_lib'

interface Env {
  SUBDL_KEY?: string
  OPENSUBTITLES_KEY?: string
  OPENSUBTITLES_USER?: string
  OPENSUBTITLES_PASS?: string
}

interface Context {
  request: Request
  env: Env
  params: { path?: string | string[] }
  waitUntil?: (p: Promise<unknown>) => void
}

/** Un subtítulo de la lista, como lo usa la app. */
export interface OnlineSub {
  id: string
  /** Ruta de este mismo sitio que devuelve el archivo. */
  url: string
  /** `spl` = latino, `spn` = España, `spa` = no se sabe. */
  lang: 'spl' | 'spn' | 'spa'
  /** Nombre del release (para elegir el que coincide con el video). */
  release: string
  source: 'subdl' | 'opensubtitles'
  sdh?: boolean
}

const SUBDL_API = 'https://api.subdl.com/api/v1/subtitles'
const SUBDL_DL = 'https://dl.subdl.com/subtitle/'
const OS_API = 'https://api.opensubtitles.com/api/v1'
const OS_AGENT = 'SeriesPelis v1'

const IMDB = /^tt\d{5,10}$/
const SD_ID = /^\d{1,12}-\d{1,12}$/
const OS_ID = /^\d{1,12}$/
const SUB_EXT = /\.(srt|vtt|ass|ssa)$/i
/** Más que esto no es un subtítulo. */
const MAX_FILE = 5 * 1024 * 1024
const MAX_RESULTS = 30

const DAY = 24 * 60 * 60
const SEARCH_TTL = 12 * 60 * 60
const EMPTY_TTL = 60 * 60
const FILE_TTL = 30 * DAY

/** Búsquedas por minuto y por IP (una ficha hace una o dos). */
export const SEARCH_LIMIT = 60
/** Archivos por minuto y por IP. */
export const FILE_LIMIT = 20
export const searchLimiter = memoryRateLimit(SEARCH_LIMIT, 60_000)
export const fileLimiter = memoryRateLimit(FILE_LIMIT, 60_000)

// ---------- Latino o España ----------

const LATINO_RE = /(^|[^a-z])(latino|latinoamerica\w*|latam|lat|es[-_](la|419)|mexic\w*|neutro)([^a-z]|$)/i
const SPAIN_RE = /(^|[^a-z])(castellano|españa|espana|spain|es[-_]es|cast|ibérico|iberico)([^a-z]|$)/i

/** De qué español es, según el release, el comentario y el autor. Si dice las dos cosas, gana latino. */
export function spanishVariant(...texts: (string | undefined | null)[]): 'spl' | 'spn' | 'spa' {
  const text = texts.filter(Boolean).join(' ')
  if (LATINO_RE.test(text)) return 'spl'
  if (SPAIN_RE.test(text)) return 'spn'
  return 'spa'
}

/** Latino primero, después los que no se sabe y al final los de España (el orden de la fuente se respeta). */
export function sortSpanish(subs: OnlineSub[]): OnlineSub[] {
  const rank = { spl: 0, spa: 1, spn: 2 }
  return subs.map((s, i) => ({ s, i })).sort((a, b) => rank[a.s.lang] - rank[b.s.lang] || a.i - b.i).map((x) => x.s)
}

// ---------- Archivo dentro del zip ----------

/** ¿El nombre del archivo es de este episodio? (S01E02, 1x02, 01x02). */
export function matchesEpisode(name: string, s: number, e: number): boolean {
  const re = new RegExp(`(^|[^0-9])(s0*${s}[ ._-]*e0*${e}|0*${s}x0*${e})([^0-9]|$)`, 'i')
  return re.test(name)
}

/**
 * Qué archivo del zip devolver: el del episodio pedido (en los packs de temporada) o, si no hay episodio, el
 * subtítulo más grande (los zips a veces traen una versión "forzados" chiquita). Los .srt antes que los .ass.
 */
export function pickEntry<T extends { name: string; size: number }>(entries: T[], s?: number, e?: number): T | undefined {
  const subs = entries.filter((x) => SUB_EXT.test(x.name))
  const pool = s !== undefined && e !== undefined ? subs.filter((x) => matchesEpisode(x.name.split('/').pop() ?? x.name, s, e)) : []
  const list = pool.length > 0 ? pool : s !== undefined && e !== undefined && subs.length > 1 ? [] : subs
  return list.sort((a, b) => Number(/\.srt$/i.test(b.name)) - Number(/\.srt$/i.test(a.name)) || b.size - a.size)[0]
}

// ---------- Caché de Cloudflare ----------

function cacheStore(): Cache | undefined {
  return typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
}

async function fromCache(key: string): Promise<Response | undefined> {
  try {
    return (await cacheStore()?.match(key)) ?? undefined
  } catch {
    return undefined
  }
}

function toCache(ctx: Context, key: string, res: Response) {
  const store = cacheStore()
  if (!store) return
  const p = store.put(key, res.clone()).catch(() => undefined)
  if (ctx.waitUntil) ctx.waitUntil(p)
}

// ---------- SubDL ----------

interface SubdlSub {
  release_name?: string
  name?: string
  lang?: string
  language?: string
  author?: string
  url?: string
  season?: number
  episode?: number
  full_season?: boolean
  hi?: boolean
  comment?: string
  releases?: string[]
}

class QuotaError extends Error {}

async function subdlSearch(key: string, imdb: string, series: boolean, s?: number, e?: number): Promise<OnlineSub[]> {
  const ask = async (extra: Record<string, string>) => {
    const url = new URL(SUBDL_API)
    url.searchParams.set('api_key', key)
    url.searchParams.set('imdb_id', imdb)
    url.searchParams.set('type', series ? 'tv' : 'movie')
    url.searchParams.set('languages', 'ES')
    url.searchParams.set('subs_per_page', String(MAX_RESULTS))
    url.searchParams.set('comment', '1')
    url.searchParams.set('releases', '1')
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 429) throw new QuotaError('subdl')
    if (!res.ok) throw new Error(`SubDL ${res.status}`)
    const body = (await res.json()) as { status?: boolean; subtitles?: SubdlSub[] }
    return body.status && Array.isArray(body.subtitles) ? body.subtitles : []
  }
  let found = series && s !== undefined && e !== undefined ? await ask({ season_number: String(s), episode_number: String(e) }) : await ask({})
  // Muchas series solo tienen el pack de la temporada.
  if (found.length === 0 && series && s !== undefined) found = await ask({ season_number: String(s), full_season: '1' })
  const ep = series && s !== undefined && e !== undefined ? `?s=${s}&e=${e}` : ''
  const out: OnlineSub[] = []
  const seen = new Set<string>()
  for (const x of found) {
    const id = /\/subtitle\/(\d+-\d+)\.zip$/.exec(x.url ?? '')?.[1]
    if (!id || seen.has(id)) continue
    // SubDL a veces mezcla otros idiomas aunque se pida ES.
    if (x.language && x.language.toUpperCase() !== 'ES') continue
    // En una búsqueda por episodio, los de otro episodio no sirven (los packs sí).
    if (series && e !== undefined && x.episode && x.episode !== e && !x.full_season) continue
    seen.add(id)
    const release = x.release_name || x.name || ''
    out.push({
      id: `sd:${id}`,
      url: `/api/subs/sd/${id}${ep}`,
      lang: spanishVariant(release, x.comment, x.author, x.name, ...(x.releases ?? [])),
      release,
      source: 'subdl',
      sdh: x.hi || undefined,
    })
  }
  return out
}

async function subdlFile(key: string | undefined, id: string, s?: number, e?: number): Promise<Uint8Array<ArrayBuffer> | undefined> {
  // Primero sin key (cupo por IP de SubDL) y, si ese se terminó, con la key (50 por día en el plan gratis).
  // Cada archivo queda en la caché, así que casi no se repite.
  let res = await fetch(`${SUBDL_DL}${id}.zip`)
  if ((res.status === 429 || res.status === 403) && key) res = await fetch(`${SUBDL_DL}${id}.zip`, { headers: { 'x-api-key': key } })
  if (res.status === 429) throw new QuotaError('subdl')
  if (!res.ok) return undefined
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_FILE) return undefined
  const entry = pickEntry(zipEntries(buf, MAX_FILE), s, e)
  return entry ? await entry.read() : undefined
}

// ---------- OpenSubtitles (respaldo) ----------

let osToken: { value: string; until: number } | undefined

function osHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return { 'Api-Key': env.OPENSUBTITLES_KEY!.trim(), 'User-Agent': OS_AGENT, Accept: 'application/json', ...extra }
}

/** JWT de la cuenta de la app (sube el cupo de 5 a 20 descargas por día). Se guarda 12 h por instancia. */
async function osLogin(env: Env): Promise<string | undefined> {
  const user = env.OPENSUBTITLES_USER?.trim()
  const pass = env.OPENSUBTITLES_PASS?.trim()
  if (!user || !pass) return undefined
  if (osToken && osToken.until > Date.now()) return osToken.value
  const res = await fetch(`${OS_API}/login`, {
    method: 'POST',
    headers: osHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username: user, password: pass }),
  })
  if (!res.ok) return undefined
  const body = (await res.json()) as { token?: string }
  if (!body.token) return undefined
  osToken = { value: body.token, until: Date.now() + 12 * 60 * 60 * 1000 }
  return body.token
}

interface OsItem {
  attributes?: {
    language?: string
    release?: string
    comments?: string
    hearing_impaired?: boolean
    files?: { file_id?: number; file_name?: string }[]
  }
}

async function osSearch(env: Env, imdb: string, series: boolean, s?: number, e?: number): Promise<OnlineSub[]> {
  const ask = async (languages: string) => {
    const url = new URL(`${OS_API}/subtitles`)
    const num = String(Number(imdb.slice(2)))
    if (series) {
      url.searchParams.set('parent_imdb_id', num)
      if (s !== undefined) url.searchParams.set('season_number', String(s))
      if (e !== undefined) url.searchParams.set('episode_number', String(e))
    } else {
      url.searchParams.set('imdb_id', num)
    }
    url.searchParams.set('languages', languages)
    return fetch(url, { headers: osHeaders(env) })
  }
  // `ea` es el español latino de OpenSubtitles; si algún día no lo acepta, se busca solo `es`.
  let res = await ask('ea,es')
  if (res.status === 400) res = await ask('es')
  if (res.status === 429) throw new QuotaError('opensubtitles')
  if (!res.ok) throw new Error(`OpenSubtitles ${res.status}`)
  const body = (await res.json()) as { data?: OsItem[] }
  const out: OnlineSub[] = []
  for (const item of body.data ?? []) {
    const a = item.attributes
    const file = a?.files?.[0]
    if (!a || !file?.file_id) continue
    const release = a.release || file.file_name || ''
    const lang = a.language === 'ea' ? 'spl' : spanishVariant(release, a.comments)
    out.push({ id: `os:${file.file_id}`, url: `/api/subs/os/${file.file_id}`, lang, release, source: 'opensubtitles', sdh: a.hearing_impaired || undefined })
    if (out.length >= MAX_RESULTS) break
  }
  return out
}

async function osFile(env: Env, id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const token = await osLogin(env)
  const res = await fetch(`${OS_API}/download`, {
    method: 'POST',
    headers: osHeaders(env, { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    body: JSON.stringify({ file_id: Number(id) }),
  })
  if (res.status === 406 || res.status === 429) throw new QuotaError('opensubtitles')
  if (!res.ok) return undefined
  const { link } = (await res.json()) as { link?: string }
  if (!link || !/^https:\/\//.test(link)) return undefined
  const file = await fetch(link)
  if (!file.ok) return undefined
  const buf = await file.arrayBuffer()
  return buf.byteLength > MAX_FILE ? undefined : new Uint8Array(buf)
}

// ---------- Rutas ----------

function intParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name)
  if (raw === null || !/^\d{1,4}$/.test(raw)) return undefined
  return Number(raw)
}

function fileResponse(data: Uint8Array<ArrayBuffer>): Response {
  return new Response(data, {
    headers: {
      // Va crudo (puede ser Windows-1252): la app lo decodifica y lo pasa a VTT.
      'Content-Type': 'application/octet-stream',
      'Cache-Control': `public, max-age=${FILE_TTL}, immutable`,
    },
  })
}

export const onRequestGet = async (ctx: Context): Promise<Response> => {
  const { request, env } = ctx
  if (crossSite(request)) return json({ error: 'Solo desde la app' }, 403)
  const raw = ctx.params.path
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : []
  const subdl = env.SUBDL_KEY?.trim()
  const os = env.OPENSUBTITLES_KEY?.trim()

  if (parts.length === 1 && parts[0] === '_status') {
    const sources = [subdl ? 'subdl' : '', os ? 'opensubtitles' : ''].filter(Boolean)
    return json({ enabled: sources.length > 0, sources }, 200, { 'Cache-Control': 'public, max-age=300' })
  }

  if (!subdl && !os) return json({ error: 'Los subtítulos online no están configurados en el sitio' }, 503)
  // Las keys del sitio solo se usan desde la app.
  if (!fromOwnSite(request)) return json({ error: 'Solo desde la app' }, 403)

  const url = new URL(request.url)
  const ip = clientIp(request)

  if (parts.length === 1 && parts[0] === 'search') {
    const imdb = url.searchParams.get('imdb') ?? ''
    const type = url.searchParams.get('type')
    if (!IMDB.test(imdb) || (type !== 'movie' && type !== 'series')) return json({ error: 'Pedido inválido' }, 400)
    const series = type === 'series'
    const s = series ? intParam(url.searchParams, 's') : undefined
    const e = series ? intParam(url.searchParams, 'e') : undefined
    const cacheKey = `${url.origin}/api/subs/__cache/search/${imdb}/${type}/${s ?? ''}/${e ?? ''}`
    const hit = await fromCache(cacheKey)
    if (hit) return hit
    if (searchLimiter.over(ip)) return json({ error: 'Demasiados pedidos' }, 429, { 'Retry-After': '60' })

    let subs: OnlineSub[] = []
    let failed = false
    if (subdl) {
      try {
        subs = await subdlSearch(subdl, imdb, series, s, e)
      } catch {
        failed = true
      }
    }
    if (subs.length === 0 && os) {
      try {
        subs = await osSearch(env, imdb, series, s, e)
        failed = false
      } catch {
        failed = true
      }
    }
    if (failed && subs.length === 0) return json({ error: 'Los servicios de subtítulos no responden' }, 502)
    const res = json({ subs: sortSpanish(subs) }, 200, { 'Cache-Control': `public, max-age=${subs.length ? SEARCH_TTL : EMPTY_TTL}` })
    toCache(ctx, cacheKey, res)
    return res
  }

  if (parts.length === 2 && (parts[0] === 'sd' || parts[0] === 'os')) {
    const [source, id] = parts
    if (source === 'sd' ? !SD_ID.test(id) : !OS_ID.test(id)) return json({ error: 'Pedido inválido' }, 400)
    if (source === 'os' && !os) return json({ error: 'OpenSubtitles no está configurado' }, 503)
    const s = intParam(url.searchParams, 's')
    const e = intParam(url.searchParams, 'e')
    const cacheKey = `${url.origin}/api/subs/__cache/file/${source}/${id}/${s ?? ''}/${e ?? ''}`
    const hit = await fromCache(cacheKey)
    if (hit) return hit
    if (fileLimiter.over(ip)) return json({ error: 'Demasiados pedidos' }, 429, { 'Retry-After': '60' })
    try {
      const data = source === 'sd' ? await subdlFile(subdl, id, s, e) : await osFile(env, id)
      if (!data) return json({ error: 'No se encontró el subtítulo' }, 404)
      const res = fileResponse(data)
      toCache(ctx, cacheKey, res)
      return res
    } catch (err) {
      if (err instanceof QuotaError) return json({ error: 'Se terminó el cupo de descargas del día' }, 429, { 'Retry-After': '3600' })
      return json({ error: 'No se pudo bajar el subtítulo' }, 502)
    }
  }

  return json({ error: 'Ruta no permitida' }, 404)
}

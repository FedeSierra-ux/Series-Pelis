import { timeoutSignal } from './abort'
import { cached } from './cache'
import { liveTvStore } from './store'

// TV en vivo: canales gratis de Argentina de la lista abierta de iptv-org (M3U).
// Solo mostramos aire, noticias, deportes y música, y sacamos los de cable pago que trae la lista
// (no tienen señal oficial gratis). Tampoco falseamos cabeceras: los canales que piden
// `http-referrer` se descartan y los `http://` no se ofrecen si la app corre en https.

export const LIVE_TV_PLAYLIST = 'https://iptv-org.github.io/iptv/countries/ar.m3u'
const TTL_MS = 6 * 60 * 60 * 1000

export type LiveCategory = 'aire' | 'noticias' | 'deportes' | 'musica'

export const LIVE_CATEGORIES: { id: LiveCategory; label: string }[] = [
  { id: 'aire', label: 'Aire' },
  { id: 'noticias', label: 'Noticias' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'musica', label: 'Música' },
]

export interface LiveChannel {
  /** tvg-id de iptv-org (o el nombre si no trae). Es lo que se guarda en favoritos. */
  id: string
  /** Número de canal, según el orden de la lista. */
  no: number
  name: string
  logo?: string
  category: LiveCategory
  quality?: string
  /** "[Not 24/7]": no transmite todo el día. */
  notAlways: boolean
  /** "[Geo-blocked]": solo anda desde su zona. */
  geoBlocked: boolean
  url: string
}

interface RawEntry {
  attrs: Record<string, string>
  title: string
  url: string
}

const PAY_TV =
  /\b(ESPN|DSports|DirecTV|Fox|TyC Sports|TNT|Disney|Cartoon Network|AMC|AXN|Cinecanal|FX|MTV|Comedy Central|Discovery|TCM|Adult Swim|El Gourmet|Europa Europa|HBO|Sony|Warner|Universal|Paramount|Nat ?Geo|History|Nickelodeon|Space|Golden|Telemundo|Cinemax|Tooncast|Latin America)\b|^E!/i

function parseEntries(text: string): RawEntry[] {
  const out: RawEntry[] = []
  let pending: Omit<RawEntry, 'url'> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#EXTINF')) {
      // El título va después de la primera coma que sigue a los atributos (`clave="valor"`), así un
      // nombre con coma ("Canal 9, Buenos Aires") no se corta. Sin atributos, es la primera coma.
      const afterAttrs = line.lastIndexOf('"') + 1
      let comma = line.indexOf(',', afterAttrs)
      if (comma < 0) comma = line.indexOf(',')
      if (comma < 0) comma = line.length
      const attrs: Record<string, string> = {}
      for (const m of line.slice(0, comma).matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2]
      pending = { attrs, title: line.slice(comma + 1).trim() }
    } else if (pending && line && !line.startsWith('#')) {
      out.push({ ...pending, url: line })
      pending = null
    }
  }
  return out
}

function categoryOf(groups: string[]): LiveCategory | null {
  if (groups.includes('News')) return 'noticias'
  if (groups.includes('Sports')) return 'deportes'
  if (groups.includes('Music')) return 'musica'
  if (groups.some((g) => g === 'General' || g === 'Undefined' || g === 'Entertainment')) return 'aire'
  return null
}

/** Convierte el M3U de iptv-org en la lista de canales que mostramos. */
export function parseLiveChannels(text: string, opts: { secure: boolean }): LiveChannel[] {
  const channels: LiveChannel[] = []
  const seen = new Set<string>()
  for (const e of parseEntries(text)) {
    const category = categoryOf((e.attrs['group-title'] ?? '').split(';'))
    if (!category) continue
    if (PAY_TV.test(e.title)) continue
    if (e.attrs['http-referrer']) continue
    if (opts.secure && !e.url.startsWith('https://')) continue
    const quality = e.title.match(/\((\d{3,4}[pi])\)/)?.[1]
    const name = e.title.replace(/\s*\(\d{3,4}[pi]\)/, '').replace(/\s*\[[^\]]*\]/g, '').trim()
    const id = e.attrs['tvg-id'] || name
    if (seen.has(id)) continue
    seen.add(id)
    channels.push({
      id,
      no: channels.length + 1,
      name,
      logo: e.attrs['tvg-logo'] || undefined,
      category,
      quality,
      notAlways: /\[Not 24\/7\]/i.test(e.title),
      geoBlocked: /\[Geo-blocked\]/i.test(e.title),
      url: e.url,
    })
  }
  return channels
}

async function fetchText(url: string, timeoutMs = 15000) {
  const t = timeoutSignal(timeoutMs)
  try {
    const res = await fetch(url, { signal: t.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
    return await res.text()
  } finally {
    t.clear()
  }
}

export async function loadLiveChannels(): Promise<LiveChannel[]> {
  const secure = location.protocol === 'https:'
  // Guardamos el M3U crudo (no el resultado) para que un cambio de filtro no espere 6 horas.
  const text = await cached(`livetv:ar`, () => fetchText(LIVE_TV_PLAYLIST), TTL_MS)
  return parseLiveChannels(text, { secure })
}

/** Iniciales para cuando el canal no trae logo o no carga. */
export function channelInitials(name: string) {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/**
 * El canal que está `step` lugares más allá en `list`, dando la vuelta. Los que `skip` descarta (los que se
 * sabe que no andan) se saltean, salvo que no quede ninguno.
 */
export function stepChannel(list: LiveChannel[], currentId: string | undefined, step: number, skip?: (c: LiveChannel) => boolean): LiveChannel | undefined {
  if (!list.length) return undefined
  const i = list.findIndex((c) => c.id === currentId)
  if (i < 0) return list.find((c) => !skip?.(c)) ?? list[0]
  const dir = step < 0 ? -1 : 1
  let j = (i + step + list.length) % list.length
  for (let tries = 0; tries < list.length && skip?.(list[j]) && j !== i; tries++) j = (j + dir + list.length) % list.length
  return list[j]
}

export function toggleLiveFavorite(id: string) {
  liveTvStore.set((s) => ({
    ...s,
    favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
  }))
}

export function setLastChannel(id: string) {
  if (liveTvStore.get().last !== id) liveTvStore.set((s) => ({ ...s, last: id }))
}

// ---------- Canales que el navegador no puede reproducir (auditoría de uso #10) ----------
// Con hls.js el video se arma con `fetch`, y eso pide CORS: si el servidor del canal no manda
// `Access-Control-Allow-Origin` (en la lista o en los segmentos), el canal nunca va a andar acá aunque
// esté en el aire. La lista no dice cuáles son, así que se prueba en segundo plano como lo haría hls.js
// (la lista, la primera sublista y el primer segmento) y los que fallan se atenúan, se marcan y el zapping
// los saltea. No se ocultan: la lista no se mueve mientras se recorre con el control (el foco no salta) y
// el número de cada canal sigue siendo el mismo. Con HLS nativo (Safari, Fire TV) el video no pide CORS y
// no se prueba nada.

/** `blocked`: el navegador no lo puede pedir (sin CORS, o el servidor no existe). `down`: responde con error. */
export type ChannelHealth = 'ok' | 'blocked' | 'down'

export const HEALTH_KEY = 'sp-ltv-health'
export const HEALTH_TTL_MS = 12 * 60 * 60 * 1000
const PROBE_TIMEOUT_MS = 8000
const PROBE_CONCURRENCY = 3

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Una línea de URI de un M3U8, resuelta contra la URL de la lista. */
function firstUri(text: string, base: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    try {
      return new URL(line, base).toString()
    } catch {
      return undefined
    }
  }
  return undefined
}

class ProbeHttpError extends Error {}

/** Pide `url` con CORS. Si `body` es false, corta apenas llegan las cabeceras (un segmento puede pesar MB). */
async function probeFetch(url: string, fetchImpl: FetchLike, body: boolean, timeoutMs: number, outer?: AbortSignal): Promise<string> {
  const t = timeoutSignal(timeoutMs, outer)
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  t.signal.addEventListener('abort', onAbort)
  try {
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal })
    if (!res.ok) throw new ProbeHttpError(String(res.status))
    if (!body) {
      ctrl.abort()
      return ''
    }
    return await res.text()
  } finally {
    t.signal.removeEventListener('abort', onAbort)
    t.clear()
  }
}

/**
 * Prueba un canal como lo pediría hls.js. `undefined` si no se pudo saber (tardó demasiado, o se canceló):
 * en ese caso no se marca nada. Las URLs que no son HLS van directo al `<video>`, que no pide CORS.
 */
export async function probeChannel(url: string, fetchImpl: FetchLike = fetch, timeoutMs = PROBE_TIMEOUT_MS, signal?: AbortSignal): Promise<ChannelHealth | undefined> {
  if (!/\.m3u8(\?|$)/i.test(url)) return 'ok'
  try {
    const master = await probeFetch(url, fetchImpl, true, timeoutMs, signal)
    let media = master
    let mediaUrl = url
    if (/#EXT-X-STREAM-INF/i.test(master)) {
      const variant = firstUri(master, url)
      if (!variant) return 'down'
      mediaUrl = variant
      media = await probeFetch(variant, fetchImpl, true, timeoutMs, signal)
    }
    const segment = firstUri(media, mediaUrl)
    if (segment) await probeFetch(segment, fetchImpl, false, timeoutMs, signal)
    return 'ok'
  } catch (err) {
    if (err instanceof ProbeHttpError) return 'down'
    const name = (err as { name?: string })?.name
    // Tiempo agotado o cancelado: no sabemos nada (puede ser un servidor lento que después anda).
    if (name === 'AbortError' || name === 'TimeoutError') return undefined
    // TypeError de fetch: CORS, DNS o servidor que no existe. Para el navegador da igual: no se puede ver.
    return 'blocked'
  }
}

type HealthCache = Record<string, { h: ChannelHealth; at: number }>

/** Lo que se sabe de cada canal de las últimas 12 h (en localStorage: es por dispositivo y por navegador). */
export function loadChannelHealth(now = Date.now()): Record<string, ChannelHealth> {
  try {
    const raw = JSON.parse(localStorage.getItem(HEALTH_KEY) ?? '{}') as HealthCache
    const out: Record<string, ChannelHealth> = {}
    for (const [id, v] of Object.entries(raw ?? {})) if (v && now - v.at < HEALTH_TTL_MS) out[id] = v.h
    return out
  } catch {
    return {}
  }
}

export function saveChannelHealth(results: Record<string, ChannelHealth>, now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(HEALTH_KEY) ?? '{}') as HealthCache
    const next: HealthCache = {}
    for (const [id, v] of Object.entries(raw ?? {})) if (v && now - v.at < HEALTH_TTL_MS) next[id] = v
    for (const [id, h] of Object.entries(results)) next[id] = { h, at: now }
    localStorage.setItem(HEALTH_KEY, JSON.stringify(next))
  } catch {
    // Sin localStorage: se vuelve a probar la próxima vez.
  }
}

/**
 * Prueba los canales de a 3 y avisa los resultados. Los fallos se guardan hasta que al menos uno ande:
 * si fallan todos, lo más probable es que el problema sea la conexión y no los canales, y no se marca nada.
 */
export async function probeChannels(
  channels: Pick<LiveChannel, 'id' | 'url'>[],
  onResult: (results: Record<string, ChannelHealth>) => void,
  opts: { fetchImpl?: FetchLike; signal?: AbortSignal; concurrency?: number; timeoutMs?: number } = {},
): Promise<Record<string, ChannelHealth>> {
  const queue = [...channels]
  const all: Record<string, ChannelHealth> = {}
  let pending: Record<string, ChannelHealth> = {}
  let anyOk = false
  const flush = () => {
    if (!anyOk || Object.keys(pending).length === 0) return
    Object.assign(all, pending)
    onResult(pending)
    pending = {}
  }
  const worker = async () => {
    while (queue.length && !opts.signal?.aborted) {
      const c = queue.shift()!
      const h = await probeChannel(c.url, opts.fetchImpl ?? fetch, opts.timeoutMs ?? PROBE_TIMEOUT_MS, opts.signal)
      if (!h || opts.signal?.aborted) continue
      if (h === 'ok') anyOk = true
      pending[c.id] = h
      flush()
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? PROBE_CONCURRENCY, queue.length) }, worker))
  return all
}

/** Para el zapping y el primer canal: los que se sabe que no andan quedan afuera (si quedan otros). */
export function watchable(list: LiveChannel[], health: Record<string, ChannelHealth>): LiveChannel[] {
  const ok = list.filter((c) => health[c.id] !== 'blocked' && health[c.id] !== 'down')
  return ok.length ? ok : list
}

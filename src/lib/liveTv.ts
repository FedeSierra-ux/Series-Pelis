import { timeoutSignal } from './abort'
import { liveTvStore } from './store'

// TV en vivo: una lista fija con los canales que eligió el usuario, solo con señales oficiales y gratis.
// Cada canal va por su stream HLS público (Canal 26, Music Top, América) o por la transmisión en vivo de
// su canal oficial de YouTube (los demás), embebida como el tráiler. No usamos las retransmisiones de
// terceros que traen las listas de IPTV (Telefe, El Trece, etc. salen de IPs sueltas por http): no son
// de los canales y cruzan el límite del proyecto. DeporTV no tiene hoy ninguna señal oficial que ande.

export type LiveCategory = 'noticias' | 'publicos' | 'aire' | 'musica'

export const LIVE_CATEGORIES: { id: LiveCategory; label: string }[] = [
  { id: 'noticias', label: 'Noticias' },
  { id: 'publicos', label: 'Públicos' },
  { id: 'aire', label: 'Aire' },
  { id: 'musica', label: 'Música' },
]

export interface LiveChannel {
  /** Lo que se guarda en favoritos, en el último canal y en lo que se sabe de cada uno. */
  id: string
  /** Número de canal (para ir directo con el control). */
  no: number
  name: string
  logo?: string
  category: LiveCategory
  quality?: string
  /** No transmite todo el día (en YouTube, cuando no hay vivo se ve el aviso de YouTube). */
  notAlways: boolean
  /** HLS del canal; en los de YouTube, su página de "en vivo" (para abrirlo afuera). */
  url: string
  /** Id del canal oficial de YouTube: se reproduce su transmisión en vivo. */
  youtube?: string
}

type ChannelDef = Omit<LiveChannel, 'no' | 'url' | 'notAlways'> & { url?: string; notAlways?: boolean }

const IMG = 'https://i.imgur.com/'

const DEFS: ChannelDef[] = [
  { id: 'TN.ar', name: 'TN Todo Noticias', category: 'noticias', youtube: 'UCj6PcyLvpnIRT_2W_mwa9Aw', logo: `${IMG}vFwPhPS.png` },
  { id: 'C5N.ar', name: 'C5N', category: 'noticias', youtube: 'UCFgk2Q2mVO1BklRQhSv6p0w', logo: `${IMG}E3pamA5.png` },
  { id: 'CronicaTV.ar', name: 'Crónica TV', category: 'noticias', youtube: 'UCT7KFGv6s2a-rh2Jq8ZdM1g', logo: `${IMG}k2Ku8Ib.png` },
  {
    id: 'Canal26.ar@SD',
    name: 'Canal 26',
    category: 'noticias',
    quality: '1080p',
    url: 'https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Canal_26_logo_%282022%29.svg/500px-Canal_26_logo_%282022%29.svg.png',
  },
  // LN+ y la Pública a veces tienen más de un vivo a la vez y YouTube no siempre elige uno para el embed.
  { id: 'LaNacionPlus.ar', name: 'LN+', category: 'noticias', youtube: 'UCba3hpU7EFBSk817y9qZkiA', notAlways: true, logo: `${IMG}vJYzGt1.png` },
  { id: 'A24.ar', name: 'A24', category: 'noticias', youtube: 'UCR9120YBAqMfntqgRTKmkjQ', logo: `${IMG}LnXQkIU.png` },
  // El canal de YouTube de la TV Pública ahora se llama "Canal Siete" (@TVPublicaArgentina).
  { id: 'TVPublica.ar', name: 'Televisión Pública', category: 'publicos', youtube: 'UCs231K71Bnu5295_x0MB5Pg', notAlways: true, logo: `${IMG}XGrkzN3.png` },
  { id: 'Encuentro.ar', name: 'Encuentro', category: 'publicos', youtube: 'UC1zLDoKL-eKmd_K7qkUZ-ow', notAlways: true, logo: `${IMG}uBBZR1X.png` },
  { id: 'CineAr.ar', name: 'Cine.AR', category: 'publicos', youtube: 'UCXImrAedgaNtSDEs8GEGWLQ', notAlways: true, logo: `${IMG}RPLyrIC.png` },
  { id: 'Telefe.ar', name: 'Telefe', category: 'aire', youtube: 'UCHc3el42hXKKhjs_1vzWk9A', notAlways: true, logo: `${IMG}wrZfMXn.png` },
  { id: 'ElTrece.ar', name: 'El Trece', category: 'aire', youtube: 'UC0DM_mHV2u6dj8ig51GkQwg', notAlways: true, logo: `${IMG}TrgBAdA.png` },
  { id: 'ElNueve.ar', name: 'El Nueve', category: 'aire', youtube: 'UCUT4NmGqjrVpKf2JyiS_bbA', logo: `${IMG}cJHP7bU.png` },
  {
    id: 'AmericaTV.ar@SD',
    name: 'América TV',
    category: 'aire',
    quality: '720p',
    url: 'https://prepublish.f.qaotic.net/a07/americahls-100056/playlist_720p.m3u8',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Am%C3%A9rica_TV_%28Nuevo_logo_Junio_2020%29.png/500px-Am%C3%A9rica_TV_%28Nuevo_logo_Junio_2020%29.png',
  },
  {
    id: 'MusicTop.ar@SD',
    name: 'Music Top',
    category: 'musica',
    quality: '1080p',
    url: 'https://stream-gtlc.telecentro.net.ar/hls/musictophls/main.m3u8',
    logo: 'https://cdn.mitvstatic.com/channels/ar_musictop_m.png',
  },
]

export const LIVE_CHANNELS: LiveChannel[] = DEFS.map((d, i) => ({
  ...d,
  no: i + 1,
  notAlways: d.notAlways ?? false,
  url: d.url ?? `https://www.youtube.com/channel/${d.youtube}/live`,
}))

/**
 * Embed de la transmisión en vivo de un canal de YouTube (sin cookies, como los tráileres). Arranca solo y
 * sin controles: el sonido y el cambio de canal se manejan desde la página. `enablejsapi` deja silenciar
 * y saber si está reproduciendo con postMessage.
 */
export function youtubeLiveUrl(channelId: string, opts: { muted: boolean; origin?: string }): string {
  const params = new URLSearchParams({
    channel: channelId,
    autoplay: '1',
    mute: opts.muted ? '1' : '0',
    controls: '0',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    hl: 'es',
    enablejsapi: '1',
  })
  if (opts.origin) params.set('origin', opts.origin)
  return `https://www.youtube-nocookie.com/embed/live_stream?${params}`
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

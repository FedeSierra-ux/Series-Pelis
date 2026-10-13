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
      const comma = line.lastIndexOf(',')
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
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
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

/** El canal que está `step` lugares más allá en `list`, dando la vuelta. */
export function stepChannel(list: LiveChannel[], currentId: string | undefined, step: number): LiveChannel | undefined {
  if (!list.length) return undefined
  const i = list.findIndex((c) => c.id === currentId)
  if (i < 0) return list[0]
  return list[(i + step + list.length) % list.length]
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

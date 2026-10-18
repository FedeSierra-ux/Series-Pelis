import { cached, fetchJson, load } from './cache'
import type { AddonStreams, CatalogDef, ExtraProp, InstalledAddon, Manifest, Meta, MetaPreview, ResourceDef, Stream, Subtitle, Video } from './types'
import { errorText } from './errors'

// Cliente del protocolo de addons de Stremio. Un addon es un servidor HTTP que expone
// /manifest.json y recursos con la forma /{recurso}/{tipo}/{id}[/{extras}].json.

export const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'

const HOUR = 60 * 60 * 1000
const CATALOG_TTL = 6 * HOUR
const META_TTL = 24 * HOUR
const STREAM_TTL = 10 * 60 * 1000
const STREAM_TIMEOUT = 20000

const cinemetaCatalog = (type: string, id: string, name: string, search: boolean): CatalogDef => ({
  type,
  id,
  name,
  extra: [{ name: 'genre' }, ...(search ? [{ name: 'search' }] : []), { name: 'skip' }],
  extraSupported: search ? ['search', 'genre', 'skip'] : ['genre', 'skip'],
})

/** Copia local del manifest de Cinemeta para no esperar a la red en el primer arranque. */
export const CINEMETA_ADDON: InstalledAddon = {
  transportUrl: CINEMETA_URL,
  manifest: {
    id: 'com.linvo.cinemeta',
    version: '3.0.14',
    name: 'Cinemeta',
    description: 'The official addon for movie and series catalogs',
    resources: ['catalog', 'meta', 'addon_catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [
      cinemetaCatalog('movie', 'top', 'Popular', true),
      cinemetaCatalog('series', 'top', 'Popular', true),
      cinemetaCatalog('movie', 'year', 'New', false),
      cinemetaCatalog('series', 'year', 'New', false),
      cinemetaCatalog('movie', 'imdbRating', 'Featured', false),
      cinemetaCatalog('series', 'imdbRating', 'Featured', false),
    ],
  },
}

/** Acepta `stremio://`, URLs sin `/manifest.json` y espacios sobrantes. */
export function normalizeManifestUrl(input: string): string {
  // Al copiar de un chat o de un PDF suelen venir espacios o saltos de línea en el medio.
  let url = input.replace(/\s+/g, '')
  if (/^stremio:\/\//i.test(url)) url = 'https://' + url.slice('stremio://'.length)
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  url = url.replace(/#.*$/, '')
  // La página de configuración del addon (…/configure) no es el manifest: el manifest está al lado.
  url = url.replace(/\/configure\/?(\?.*)?$/i, '')
  // Al copiar de la barra del navegador o de un chat suele quedar una barra al final
  // (`…/manifest.json/`): sin sacarla, se armaba `…/manifest.json/manifest.json` y daba 404.
  url = url.replace(/(manifest\.json)\/+(?=\?|$)/, '$1')
  if (!/manifest\.json(\?.*)?$/.test(url)) url = url.replace(/\/+(?=\?|$)/, '').replace(/(\?.*)?$/, (q) => '/manifest.json' + q)
  return url
}

function baseUrl(transportUrl: string): string {
  return transportUrl.replace(/\/manifest\.json(\?.*)?$/, '')
}

function encodeExtra(extra?: Record<string, string | undefined>): string {
  if (!extra) return ''
  const parts = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
  return parts.length ? '/' + parts.join('&') : ''
}

export function resourceUrl(
  addon: InstalledAddon,
  resource: string,
  type: string,
  id: string,
  extra?: Record<string, string | undefined>,
): string {
  return `${baseUrl(addon.transportUrl)}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${encodeExtra(extra)}.json`
}

export function supportsResource(manifest: Manifest, resource: string, type: string, id?: string): boolean {
  return manifest.resources.some((r: ResourceDef) => {
    const name = typeof r === 'string' ? r : r.name
    if (name !== resource) return false
    const types = (typeof r === 'string' ? undefined : r.types) ?? manifest.types
    const prefixes = (typeof r === 'string' ? undefined : r.idPrefixes) ?? manifest.idPrefixes
    if (types && !types.includes(type)) return false
    if (id && prefixes && prefixes.length > 0 && !prefixes.some((p) => id.startsWith(p))) return false
    return true
  })
}

/** Addons que se consultan: los desactivados quedan instalados pero no se usan. */
export const isAddonEnabled = (addon: InstalledAddon) => addon.disabled !== true

export function enabledAddons(addons: InstalledAddon[]): InstalledAddon[] {
  return addons.filter(isAddonEnabled)
}

// ---------- Validación de lo que responden los addons (auditoría #14) ----------
// Un addon de la comunidad con un bug puede mandar `{"streams": {"error": "rate limited"}}` o un manifest sin
// nombre. Antes eso tiraba un TypeError que se llevaba puesta la ficha entera (o Ajustes, sin forma de quitar
// el addon). Acá se normaliza en el borde: lo que no tiene la forma esperada es un error de ESE addon.

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const strList = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined)

/** La respuesta de un addon no tiene la forma del protocolo. */
export class AddonFormatError extends Error {
  constructor(what: string) {
    super(`El addon respondió ${what} con un formato inválido`)
    this.name = 'AddonFormatError'
  }
}

/**
 * Lista `field` de una respuesta: si falta, vacía; si viene pero no es una lista, error del addon.
 * Solo quedan los elementos que pasan `clean` (los que devuelven `undefined` se descartan).
 */
export function listField<T>(res: unknown, field: string, clean: (x: Record<string, unknown>) => T | undefined): T[] {
  if (!isObj(res)) throw new AddonFormatError(field)
  const raw = res[field]
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new AddonFormatError(field)
  const out: T[] = []
  for (const x of raw) {
    if (!isObj(x)) continue
    const v = clean(x)
    if (v !== undefined) out.push(v)
  }
  return out
}

/** Campos de texto que la interfaz parte o compara: si no son texto, se sacan. */
function textFields<T extends Record<string, unknown>>(x: T, fields: string[]): T {
  const out: Record<string, unknown> = { ...x }
  for (const f of fields) if (out[f] !== undefined && typeof out[f] !== 'string') delete out[f]
  return out as T
}

export function cleanStream(x: Record<string, unknown>): Stream | undefined {
  const s = textFields(x, ['url', 'ytId', 'infoHash', 'externalUrl', 'name', 'title', 'description'])
  if (s.behaviorHints !== undefined && !isObj(s.behaviorHints)) delete s.behaviorHints
  if (s.fileIdx !== undefined && typeof s.fileIdx !== 'number') delete s.fileIdx
  if (s.sources !== undefined) s.sources = strList(s.sources)
  if (s.subtitles !== undefined) s.subtitles = Array.isArray(s.subtitles) ? s.subtitles.filter(isObj).map(cleanSubtitle).filter(Boolean) : undefined
  // Sin nada para reproducir no sirve ni para mostrarlo.
  if (!s.url && !s.ytId && !s.infoHash && !s.externalUrl) return undefined
  return s as Stream
}

export function cleanSubtitle(x: Record<string, unknown>): Subtitle | undefined {
  const url = str(x.url)
  if (!url) return undefined
  return { ...(str(x.id) ? { id: str(x.id) } : {}), url, lang: str(x.lang) ?? 'und' }
}

export function cleanMetaPreview(x: Record<string, unknown>): MetaPreview | undefined {
  const id = str(x.id)
  if (!id) return undefined
  const m = textFields(x, ['poster', 'background', 'logo', 'description', 'releaseInfo', 'imdbRating', 'released']) as Record<string, unknown>
  m.id = id
  m.type = str(x.type) ?? ''
  m.name = str(x.name) ?? ''
  for (const f of ['genre', 'genres']) if (m[f] !== undefined) m[f] = strList(m[f])
  if (typeof m.year === 'number') m.year = String(m.year)
  else if (m.year !== undefined && typeof m.year !== 'string') delete m.year
  return m as unknown as MetaPreview
}

export function cleanMeta(x: unknown): Meta | undefined {
  if (!isObj(x)) return undefined
  const base = cleanMetaPreview(x) as (Meta & Record<string, unknown>) | undefined
  if (!base) return undefined
  if (base.videos !== undefined) {
    base.videos = Array.isArray(base.videos)
      ? base.videos.filter((v): v is Video => isObj(v) && typeof v.id === 'string' && !!v.id).map((v) => textFields(v as unknown as Record<string, unknown>, ['title', 'name', 'released', 'firstAired', 'overview', 'description', 'thumbnail']) as unknown as Video)
      : []
  }
  for (const f of ['cast', 'director', 'writer']) if (base[f] !== undefined) base[f] = strList(base[f])
  for (const f of ['trailers', 'trailerStreams', 'links']) if (base[f] !== undefined && !Array.isArray(base[f])) delete base[f]
  return base
}

function cleanCatalog(x: Record<string, unknown>): CatalogDef | undefined {
  const id = str(x.id)
  const type = str(x.type)
  if (!id || !type) return undefined
  const c = { ...x, id, type } as unknown as CatalogDef & Record<string, unknown>
  if (c.name !== undefined && typeof c.name !== 'string') delete c.name
  if (c.extra !== undefined) c.extra = Array.isArray(c.extra) ? c.extra.filter((e): e is ExtraProp => isObj(e) && typeof e.name === 'string') : undefined
  for (const f of ['genres', 'extraRequired', 'extraSupported']) if (c[f] !== undefined) c[f] = strList(c[f])
  return c
}

/** Manifest con los campos que la app usa siempre presentes y del tipo correcto. Sin `id` o `resources`, error. */
export function cleanManifest(raw: unknown): Manifest {
  if (!isObj(raw) || !str(raw.id) || !Array.isArray(raw.resources)) throw new Error('La URL no devolvió un manifest de addon válido')
  const id = str(raw.id)!
  const resources = raw.resources.filter(
    (r): r is ResourceDef => typeof r === 'string' || (isObj(r) && typeof r.name === 'string'),
  )
  const m = { ...raw } as unknown as Manifest & Record<string, unknown>
  m.id = id
  // Un manifest sin nombre rompía Ajustes (`name[0]`): se muestra el id.
  m.name = str(raw.name)?.trim() || id
  m.version = str(raw.version) ?? (typeof raw.version === 'number' ? String(raw.version) : '0')
  m.resources = resources
  m.types = strList(raw.types) ?? []
  m.catalogs = Array.isArray(raw.catalogs) ? raw.catalogs.filter(isObj).map(cleanCatalog).filter((c): c is CatalogDef => !!c) : []
  if (raw.idPrefixes !== undefined) m.idPrefixes = strList(raw.idPrefixes)
  for (const f of ['description', 'logo']) if (m[f] !== undefined && typeof m[f] !== 'string') delete m[f]
  if (m.behaviorHints !== undefined && !isObj(m.behaviorHints)) delete m.behaviorHints
  return m
}

/** Nombre para mostrar de un addon (los guardados antes de la validación pueden no tenerlo). */
export const addonName = (m: Partial<Manifest> | undefined) => (typeof m?.name === 'string' && m.name.trim()) || m?.id || 'Addon'

export async function fetchManifest(url: string): Promise<Manifest> {
  return cleanManifest(await fetchJson<unknown>(url))
}

export const catalogKey = (addon: InstalledAddon, c: CatalogDef, extra?: Record<string, string | undefined>) =>
  `catalog:${resourceUrl(addon, 'catalog', c.type, c.id, extra)}`

export function getCatalog(
  addon: InstalledAddon,
  catalog: CatalogDef,
  extra?: Record<string, string | undefined>,
): Promise<MetaPreview[]> {
  const url = resourceUrl(addon, 'catalog', catalog.type, catalog.id, extra)
  const isSearch = !!extra?.search
  return cached(
    `catalog:${url}`,
    async (signal) => listField(await fetchJson<unknown>(url, undefined, signal), 'metas', cleanMetaPreview),
    isSearch ? HOUR : CATALOG_TTL,
    !isSearch,
  )
}

/** Catálogos que se pueden pedir sin parámetros obligatorios (los que van en el inicio). */
export function browsableCatalogs(addons: InstalledAddon[]): { addon: InstalledAddon; catalog: CatalogDef }[] {
  return enabledAddons(addons).flatMap((addon) =>
    addon.manifest.catalogs
      .filter((c) => {
        const required = c.extraRequired ?? c.extra?.filter((e) => e.isRequired).map((e) => e.name) ?? []
        return required.length === 0
      })
      .map((catalog) => ({ addon, catalog })),
  )
}

export function searchableCatalogs(addons: InstalledAddon[]) {
  return enabledAddons(addons).flatMap((addon) =>
    addon.manifest.catalogs
      .filter((c) => c.extra?.some((e) => e.name === 'search') || c.extraSupported?.includes('search'))
      .map((catalog) => ({ addon, catalog })),
  )
}

export const metaKey = (type: string, id: string) => `meta:${type}:${id}`

export function getMeta(addons: InstalledAddon[], type: string, id: string): Promise<Meta> {
  return cached(
    metaKey(type, id),
    async () => {
      const all = addons.filter((a) => supportsResource(a.manifest, 'meta', type, id))
      // Los desactivados solo como último recurso, para que la ficha no se rompa si se apagó Cinemeta.
      const enabled = enabledAddons(all)
      const candidates = enabled.length > 0 ? enabled : all
      let lastError: unknown = new Error('Ningún addon instalado da información de este título')
      for (const addon of candidates) {
        try {
          const res = await fetchJson<unknown>(resourceUrl(addon, 'meta', type, id))
          const meta = isObj(res) ? cleanMeta(res.meta) : undefined
          if (meta) return meta
          if (isObj(res) && res.meta !== undefined && res.meta !== null) lastError = new AddonFormatError('meta')
        } catch (err) {
          lastError = err
        }
      }
      throw lastError
    },
    META_TTL,
  )
}

/** Cuánto tiene que quedarse el foco en un póster para precargar su ficha. */
export const PREFETCH_DELAY_MS = 400
let prefetchTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Precarga la ficha de un título (por ejemplo al pasar el foco por un póster). Con un respiro: al
 * recorrer una fila con las flechas en la TV, solo se pide la del póster donde el foco se queda quieto
 * (antes se pedían las 20 de la fila, de cientos de kB cada una).
 */
export function prefetchMeta(addons: InstalledAddon[], type: string, id: string) {
  clearTimeout(prefetchTimer)
  prefetchTimer = setTimeout(() => {
    getMeta(addons, type, id).catch(() => {})
  }, PREFETCH_DELAY_MS)
}

/**
 * Pide streams a todos los addons compatibles en paralelo y avisa a medida que
 * cada uno responde, así los primeros resultados aparecen sin esperar al más lento.
 * La función que devuelve corta los pedidos que nadie más espera (auditoría #15): con un debrid
 * compartido entre varias casas, los pedidos huérfanos sumaban consultas a TorBox hasta el rate limit.
 */
export function getStreams(
  addons: InstalledAddon[],
  type: string,
  videoId: string,
  onUpdate: (groups: AddonStreams[]) => void,
): () => void {
  let cancelled = false
  const ctrl = new AbortController()
  const targets = enabledAddons(addons).filter((a) => supportsResource(a.manifest, 'stream', type, videoId))
  const groups: AddonStreams[] = targets.map((addon) => ({ addon, streams: [], loading: true }))
  onUpdate([...groups])

  targets.forEach((addon, i) => {
    const url = resourceUrl(addon, 'stream', type, videoId)
    cached(
      `stream:${url}`,
      async (signal) => listField(await fetchJson<unknown>(url, STREAM_TIMEOUT, signal), 'streams', cleanStream),
      STREAM_TTL,
      false,
      ctrl.signal,
    )
      .then((streams) => {
        groups[i] = { addon, streams, loading: false }
      })
      .catch((err: unknown) => {
        groups[i] = { addon, streams: [], loading: false, error: errorText(err) }
      })
      .finally(() => {
        if (!cancelled) onUpdate([...groups])
      })
  })

  return () => {
    cancelled = true
    ctrl.abort()
  }
}

/** Precarga los streams (quedan 10 min en caché) sin cortarlos: alguien los va a usar enseguida. */
export function prefetchStreams(addons: InstalledAddon[], type: string, videoId: string) {
  for (const addon of enabledAddons(addons).filter((a) => supportsResource(a.manifest, 'stream', type, videoId))) {
    const url = resourceUrl(addon, 'stream', type, videoId)
    cached(`stream:${url}`, async (signal) => listField(await fetchJson<unknown>(url, STREAM_TIMEOUT, signal), 'streams', cleanStream), STREAM_TTL, false).catch(() => {})
  }
}

export async function getSubtitles(addons: InstalledAddon[], type: string, videoId: string): Promise<Subtitle[]> {
  const targets = enabledAddons(addons).filter((a) => supportsResource(a.manifest, 'subtitles', type, videoId))
  const results = await Promise.allSettled(
    targets.map((addon) => {
      const url = resourceUrl(addon, 'subtitles', type, videoId)
      return load(`subs:${url}`, async (signal) => listField(await fetchJson<unknown>(url, STREAM_TIMEOUT, signal), 'subtitles', cleanSubtitle), false)
    }),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** Tope de trackers en la URL del motor de la app (Torrentio manda decenas; con unos pocos alcanza). */
export const MAX_ENGINE_TRACKERS = 20

/**
 * Largo máximo de la URL del motor. Su servidor acepta pedidos de hasta 8 KB (línea + cabeceras); con 3,5 KB
 * queda lugar de sobra para las cabeceras del reproductor. Si no entra, se sacan trackers del final (los
 * primeros son los del addon, los mejores); el nombre del archivo (`f`) queda siempre.
 */
export const MAX_ENGINE_URL = 3500

const TRACKER_RE = /^(udp|https?|wss):\/\/\S+$/i

/** Trackers que manda el addon en `sources` (`tracker:udp://…`), sin repetir y solo udp/http/https/wss. */
export function streamTrackers(stream: Stream, max = MAX_ENGINE_TRACKERS): string[] {
  const out: string[] = []
  for (const src of stream.sources ?? []) {
    if (out.length >= max) break
    if (typeof src !== 'string' || !src.startsWith('tracker:')) continue
    const tr = src.slice('tracker:'.length).trim()
    if (TRACKER_RE.test(tr) && !out.includes(tr)) out.push(tr)
  }
  return out
}

/**
 * URL para reproducir un torrent a través del servidor de streaming de Stremio instalado en la PC. Con
 * `engine` es el motor de la app de Android: además lleva los trackers (`tr`, repetido) y el nombre del
 * archivo (`f`). Se codifica con `encodeURIComponent` (espacio = %20, no "+").
 */
/** infoHash en hex de 40 en minúsculas: también pasa el base32 de 32 (como en algunos magnet). Otro formato
 *  queda igual (el servidor lo rechaza con su propio error). */
export function normalizeInfoHash(raw: string): string {
  const h = raw.trim()
  if (/^[0-9a-f]{40}$/i.test(h)) return h.toLowerCase()
  if (!/^[a-z2-7]{32}$/i.test(h)) return h
  let bits = ''
  for (const c of h.toUpperCase()) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')
  return bits.match(/.{4}/g)!.map((b) => parseInt(b, 2).toString(16)).join('')
}

export function streamingServerUrl(server: string, stream: Stream, engine = false): string | undefined {
  const hash = stream.infoHash && normalizeInfoHash(stream.infoHash)
  if (!hash || !server) return undefined
  const idx = stream.fileIdx ?? -1
  const base = `${server.replace(/\/+$/, '')}/${hash}/${idx}`
  if (!engine) return base
  const trackers = streamTrackers(stream).map((tr) => `tr=${encodeURIComponent(tr)}`)
  const file = stream.behaviorHints?.filename?.trim()
  const tail = file ? [`f=${encodeURIComponent(file)}`] : []
  const build = () => {
    const params = [...trackers, ...tail]
    return params.length ? `${base}?${params.join('&')}` : base
  }
  let url = build()
  while (url.length > MAX_ENGINE_URL && trackers.length) {
    trackers.pop()
    url = build()
  }
  return url
}

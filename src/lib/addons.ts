import { cached, fetchJson, load } from './cache'
import type { AddonStreams, CatalogDef, InstalledAddon, Manifest, Meta, MetaPreview, ResourceDef, Stream, Subtitle } from './types'

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
  let url = input.trim()
  if (url.startsWith('stremio://')) url = 'https://' + url.slice('stremio://'.length)
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  if (!/manifest\.json(\?.*)?$/.test(url)) url = url.replace(/\/+$/, '') + '/manifest.json'
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

export async function fetchManifest(url: string): Promise<Manifest> {
  const manifest = await fetchJson<Manifest>(url)
  if (!manifest || !manifest.id || !Array.isArray(manifest.resources)) {
    throw new Error('La URL no devolvió un manifest de addon válido')
  }
  manifest.catalogs ??= []
  manifest.types ??= []
  return manifest
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
    async () => (await fetchJson<{ metas?: MetaPreview[] }>(url)).metas ?? [],
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
          const res = await fetchJson<{ meta?: Meta }>(resourceUrl(addon, 'meta', type, id))
          if (res.meta) return res.meta
        } catch (err) {
          lastError = err
        }
      }
      throw lastError
    },
    META_TTL,
  )
}

/** Precarga la ficha de un título (por ejemplo al pasar el foco por un póster). */
export function prefetchMeta(addons: InstalledAddon[], type: string, id: string) {
  getMeta(addons, type, id).catch(() => {})
}

/**
 * Pide streams a todos los addons compatibles en paralelo y avisa a medida que
 * cada uno responde, así los primeros resultados aparecen sin esperar al más lento.
 */
export function getStreams(
  addons: InstalledAddon[],
  type: string,
  videoId: string,
  onUpdate: (groups: AddonStreams[]) => void,
): () => void {
  let cancelled = false
  const targets = enabledAddons(addons).filter((a) => supportsResource(a.manifest, 'stream', type, videoId))
  const groups: AddonStreams[] = targets.map((addon) => ({ addon, streams: [], loading: true }))
  onUpdate([...groups])

  targets.forEach((addon, i) => {
    const url = resourceUrl(addon, 'stream', type, videoId)
    cached(`stream:${url}`, async () => (await fetchJson<{ streams?: Stream[] }>(url, STREAM_TIMEOUT)).streams ?? [], STREAM_TTL, false)
      .then((streams) => {
        groups[i] = { addon, streams, loading: false }
      })
      .catch((err: unknown) => {
        groups[i] = { addon, streams: [], loading: false, error: err instanceof Error ? err.message : String(err) }
      })
      .finally(() => {
        if (!cancelled) onUpdate([...groups])
      })
  })

  return () => {
    cancelled = true
  }
}

export async function getSubtitles(addons: InstalledAddon[], type: string, videoId: string): Promise<Subtitle[]> {
  const targets = enabledAddons(addons).filter((a) => supportsResource(a.manifest, 'subtitles', type, videoId))
  const results = await Promise.allSettled(
    targets.map((addon) => {
      const url = resourceUrl(addon, 'subtitles', type, videoId)
      return load(`subs:${url}`, async () => (await fetchJson<{ subtitles?: Subtitle[] }>(url, STREAM_TIMEOUT)).subtitles ?? [], false)
    }),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** URL para reproducir un torrent a través del servidor de streaming de Stremio instalado en la PC. */
export function streamingServerUrl(server: string, stream: Stream): string | undefined {
  if (!stream.infoHash || !server) return undefined
  const idx = stream.fileIdx ?? -1
  return `${server.replace(/\/+$/, '')}/${stream.infoHash}/${idx}`
}

import { cleanManifest } from './addons'
import { addonKey } from './addonKey'
import type { ListItem, WatchEntry } from './store'
import type { InstalledAddon, Manifest } from './types'

// Lógica pura para traer datos desde una cuenta de Stremio: convierte los "libraryItem"
// de su API en entradas de historial/progreso y de Mi lista, y arma la vista previa.
// Formato de referencia: stremio-core (types/library/library_item.rs). Los tiempos van en ms.

export interface StremioLibraryState {
  lastWatched?: string | null
  timeWatched?: number
  /** Posición en milisegundos. */
  timeOffset?: number
  overallTimeWatched?: number
  timesWatched?: number
  flaggedWatched?: number
  /** Duración en milisegundos. */
  duration?: number
  video_id?: string | null
  watched?: string | null
  noNotif?: boolean
}

export interface StremioLibraryItem {
  _id: string
  name: string
  type: string
  poster?: string | null
  posterShape?: string
  /** Lo sacó de la biblioteca (pero puede tener progreso). */
  removed?: boolean
  /** Solo está por "Seguir viendo": nunca lo agregó a la biblioteca. */
  temp?: boolean
  _ctime?: string | null
  _mtime?: string | null
  state?: StremioLibraryState
}

export interface StremioAddonDescriptor {
  transportUrl: string
  transportName?: string
  manifest: Manifest
  flags?: { official?: boolean; protected?: boolean }
}

export interface StremioData {
  addons?: StremioAddonDescriptor[]
  library?: StremioLibraryItem[]
}

const SUPPORTED_TYPES = new Set(['movie', 'series'])
const WATCHED_RATIO = 0.9

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) && t > 0 ? t : undefined
}

const isSupported = (it: StremioLibraryItem) => !!it && typeof it._id === 'string' && !!it._id && SUPPORTED_TYPES.has(it.type)

/** En la biblioteca de verdad (no borrado ni temporal). */
export const inStremioLibrary = (it: StremioLibraryItem) => isSupported(it) && !it.removed && !it.temp

/**
 * Se puede usar acá: URL http(s) de un manifest. Quedan afuera los transportes viejos
 * (`/stremio/v1`) y el addon de archivos locales del servidor de Stremio.
 */
export function isImportableAddon(d: StremioAddonDescriptor): boolean {
  if (!d?.manifest?.id || typeof d.transportUrl !== 'string') return false
  let url: URL
  try {
    url = new URL(d.transportUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  // El addon "Local Files" vive en el servidor de streaming de Stremio (puerto 11470).
  if (url.port === '11470' || url.pathname.startsWith('/local-addon/')) return false
  return /\/manifest\.json$/.test(url.pathname)
}

/** Con el manifest validado (sin nombre, por ejemplo, rompía Ajustes). Tira error si no sirve. */
export function toInstalledAddon(d: StremioAddonDescriptor): InstalledAddon {
  return { transportUrl: d.transportUrl, manifest: cleanManifest({ ...d.manifest, resources: Array.isArray(d.manifest?.resources) ? d.manifest.resources : [] }) }
}

/** `tt123:2:5` → temporada 2, episodio 5. */
function parseEpisode(videoId: string): { season?: number; episode?: number } {
  const parts = videoId.split(':')
  if (parts.length < 3) return {}
  const season = Number(parts[parts.length - 2])
  const episode = Number(parts[parts.length - 1])
  return Number.isInteger(season) && Number.isInteger(episode) ? { season, episode } : {}
}

/** Entrada de historial/progreso para un ítem de la biblioteca de Stremio (o nada si nunca lo vio). */
export function libraryItemToProgress(it: StremioLibraryItem): WatchEntry | undefined {
  if (!isSupported(it)) return undefined
  const st = it.state ?? {}
  const offset = Math.max(0, (st.timeOffset ?? 0) / 1000)
  const duration = Math.max(0, (st.duration ?? 0) / 1000)
  const times = (st.timesWatched ?? 0) + (st.flaggedWatched ?? 0)
  const lastWatched = time(st.lastWatched)
  if (offset <= 0 && times <= 0) return undefined
  if (!lastWatched && offset <= 0) return undefined

  const isSeries = it.type === 'series'
  const videoId = st.video_id || (isSeries ? undefined : it._id)
  // De una serie sin episodio no sabemos qué guardar.
  if (!videoId) return undefined
  const ep = isSeries ? parseEpisode(videoId) : {}
  if (isSeries && ep.season === undefined) return undefined

  // Stremio vuelve el offset a 0 cuando termina; si quedó cerca del final también cuenta como visto.
  const watched = (st.flaggedWatched ?? 0) > 0 || (times > 0 && offset === 0) || (duration > 0 && offset / duration >= WATCHED_RATIO)
  const updatedAt = lastWatched ?? time(it._mtime) ?? Date.now()
  const created = time(it._ctime)
  return {
    videoId,
    metaId: it._id,
    type: it.type,
    name: it.name,
    poster: it.poster || undefined,
    ...ep,
    position: offset,
    duration,
    watched,
    updatedAt,
    firstWatchedAt: created && created <= updatedAt ? created : updatedAt,
  }
}

export function libraryItemToListItem(it: StremioLibraryItem): ListItem | undefined {
  if (!inStremioLibrary(it)) return undefined
  return {
    id: it._id,
    type: it.type,
    name: it.name,
    poster: it.poster || undefined,
    addedAt: time(it._ctime) ?? time(it._mtime) ?? Date.now(),
  }
}

/**
 * Mezcla el progreso importado sin pisar lo de acá, salvo que lo de Stremio sea más reciente.
 * Devuelve el resultado y cuántas entradas cambiaron.
 */
export function mergeProgress(
  current: Record<string, WatchEntry>,
  imported: WatchEntry[],
): { result: Record<string, WatchEntry>; changed: number } {
  const result = { ...current }
  let changed = 0
  for (const e of imported) {
    const prev = result[e.videoId]
    if (prev && prev.updatedAt >= e.updatedAt) continue
    result[e.videoId] = prev
      ? { ...e, watched: prev.watched || e.watched, firstWatchedAt: Math.min(prev.firstWatchedAt, e.firstWatchedAt) }
      : e
    changed++
  }
  return { result, changed }
}

export function mergeWatchlist(current: Record<string, ListItem>, imported: ListItem[]): { result: Record<string, ListItem>; added: number } {
  const result = { ...current }
  let added = 0
  for (const it of imported) {
    if (result[it.id]) continue
    result[it.id] = it
    added++
  }
  return { result, added }
}

export interface ImportPlan {
  addons: { total: number; fresh: InstalledAddon[]; skipped: number }
  watchlist: { total: number; items: ListItem[]; fresh: number }
  progress: { total: number; entries: WatchEntry[]; fresh: number }
}

/** Vista previa: cuánto hay en la cuenta y cuánto es nuevo (o más reciente) respecto de lo de acá. */
export function planImport(
  data: StremioData,
  current: { addons: InstalledAddon[]; progress: Record<string, WatchEntry>; watchlist: Record<string, ListItem> },
): ImportPlan {
  const descriptors = data.addons ?? []
  const usable = descriptors.filter(isImportableAddon)
  // La identidad de un addon es su URL (auditoría #4): Torrentio con la TorBox compartida y Torrentio con
  // tu propio debrid tienen el mismo `manifest.id` pero son dos addons distintos, y los dos se importan.
  const urls = new Set(current.addons.map((a) => addonKey(a.transportUrl)))
  const fresh: InstalledAddon[] = []
  for (const d of usable) {
    const key = addonKey(d.transportUrl)
    if (urls.has(key)) continue
    let addon: InstalledAddon
    try {
      addon = toInstalledAddon(d)
    } catch {
      continue
    }
    urls.add(key)
    fresh.push(addon)
  }

  const library = (data.library ?? []).filter(isSupported)
  const items = library.map(libraryItemToListItem).filter((x): x is ListItem => !!x)
  const entries = library.map(libraryItemToProgress).filter((x): x is WatchEntry => !!x)
  return {
    addons: { total: descriptors.length, fresh, skipped: descriptors.length - usable.length },
    watchlist: { total: items.length, items, fresh: mergeWatchlist(current.watchlist, items).added },
    progress: { total: entries.length, entries, fresh: mergeProgress(current.progress, entries).changed },
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const looksLikeLibrary = (v: unknown): v is StremioLibraryItem[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && typeof x._id === 'string' && typeof x.type === 'string')
const looksLikeAddons = (v: unknown): v is StremioAddonDescriptor[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && typeof x.transportUrl === 'string' && isObj(x.manifest))

/**
 * Entiende lo que el usuario pegue: la respuesta de `datastoreGet` o de `addonCollectionGet`
 * (con o sin `result`), una lista de libraryItem o de addons, o `{ addons, library }`.
 */
export function parseStremioJson(raw: unknown): StremioData {
  const out: StremioData = {}
  const visit = (v: unknown, depth: number) => {
    if (depth > 3 || v == null) return
    if (looksLikeLibrary(v) && v.length) out.library = [...(out.library ?? []), ...v]
    else if (looksLikeAddons(v) && v.length) out.addons = [...(out.addons ?? []), ...v]
    else if (isObj(v)) {
      for (const k of ['result', 'addons', 'library', 'libraryItems', 'items']) if (k in v) visit(v[k], depth + 1)
    }
  }
  visit(raw, 0)
  if (!out.library && !out.addons) throw new Error('No encontré addons ni biblioteca de Stremio en ese JSON')
  return out
}

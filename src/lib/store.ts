import { useSyncExternalStore } from 'react'
import { createStore, get, set } from 'idb-keyval'
import { CINEMETA_ADDON, fetchManifest } from './addons'
import type { ExternalPlayerId } from './externalPlayers'
import type { ScreensaverMinutes } from './idle'
import type { TvModeSetting } from './platform'
import type { InstalledAddon, MetaPreview } from './types'
import { DEFAULT_CATALOG_PREFS, normalizePrefs, type CatalogPrefs } from './catalogPrefs'

// Datos del usuario guardados en el navegador (IndexedDB). En la v0.2 se van a
// sincronizar con Cloudflare D1; por eso todo pasa por estos stores y no por
// llamadas sueltas a IndexedDB desde los componentes.

const idb = createStore('series-pelis-data', 'kv')

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Completa con los valores por defecto, también un nivel adentro (ej. `subtitleStyle`, `sourceRules`). */
function withDefaults<T>(defaults: T, stored: T): T {
  if (!isPlain(defaults) || !isPlain(stored)) return stored
  const out: Record<string, unknown> = { ...defaults, ...stored }
  for (const [k, v] of Object.entries(defaults)) if (isPlain(v) && isPlain(out[k])) out[k] = { ...v, ...(out[k] as object) }
  return out as T
}

class PersistedStore<T> {
  private initial: T

  private value: T
  private listeners = new Set<() => void>()

  constructor(
    private key: string,
    initial: T,
  ) {
    this.value = initial
    this.initial = initial
  }

  /** Valores por defecto con lo que haya en `stored` encima (para importar copias viejas). */
  merge(stored: T) {
    this.set(withDefaults(this.initial, stored))
  }

  async hydrate() {
    try {
      const stored = await get<T>(this.key, idb)
      if (stored !== undefined) {
        // En objetos de configuración completamos con los valores por defecto de campos nuevos.
        this.value = withDefaults(this.value, stored)
      }
    } catch {
      // IndexedDB bloqueado (modo privado, por ejemplo): seguimos con los valores por defecto.
    }
  }

  get = () => this.value

  set(next: T | ((prev: T) => T)) {
    this.value = typeof next === 'function' ? (next as (prev: T) => T)(this.value) : next
    this.listeners.forEach((l) => l())
    // Se escribe enseguida: los cambios son pocos (el progreso se guarda cada 5 s) y así
    // no se pierde nada si se cierra la app justo después.
    set(this.key, this.value, idb).catch(() => {})
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export function useStore<T>(store: PersistedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

// ---------- Addons ----------

export const addonsStore = new PersistedStore<InstalledAddon[]>('addons', [CINEMETA_ADDON])

export async function installAddon(manifestUrl: string) {
  const manifest = await fetchManifest(manifestUrl)
  addonsStore.set((list) => {
    const existing = list.findIndex((a) => a.transportUrl === manifestUrl || a.manifest.id === manifest.id)
    const entry = { transportUrl: manifestUrl, manifest }
    if (existing >= 0) return list.map((a, i) => (i === existing ? entry : a))
    return [...list, entry]
  })
  return manifest
}

export function removeAddon(transportUrl: string) {
  addonsStore.set((list) => list.filter((a) => a.transportUrl !== transportUrl))
}

/** Activa o desactiva un addon sin desinstalarlo. */
export function setAddonEnabled(transportUrl: string, enabled: boolean) {
  addonsStore.set((list) =>
    list.map((a) => {
      if (a.transportUrl !== transportUrl) return a
      const { disabled: _old, ...rest } = a
      return enabled ? rest : { ...rest, disabled: true }
    }),
  )
}

/** Agrega addons de los que ya tenemos el manifest (por ejemplo, importados de Stremio). */
export function addInstalledAddons(entries: InstalledAddon[]) {
  addonsStore.set((list) => {
    const urls = new Set(list.map((a) => a.transportUrl))
    const ids = new Set(list.map((a) => a.manifest.id))
    const fresh = entries.filter((e) => !urls.has(e.transportUrl) && !ids.has(e.manifest.id))
    return fresh.length ? [...list, ...fresh] : list
  })
}

export function moveAddon(transportUrl: string, delta: -1 | 1) {
  addonsStore.set((list) => {
    const i = list.findIndex((a) => a.transportUrl === transportUrl)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return list
    const copy = [...list]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
}

/** Actualiza los manifests en segundo plano (catálogos o géneros nuevos). */
async function refreshManifests() {
  const fresh = new Map<string, InstalledAddon['manifest']>()
  await Promise.all(
    addonsStore.get().map(async (a) => {
      try {
        fresh.set(a.transportUrl, await fetchManifest(a.transportUrl))
      } catch {
        // Si un addon no responde dejamos el manifest que ya teníamos.
      }
    }),
  )
  // Mezclamos sobre la lista actual: mientras tanto el usuario pudo agregar o quitar addons.
  addonsStore.set((list) => list.map((a) => (fresh.has(a.transportUrl) ? { ...a, manifest: fresh.get(a.transportUrl)! } : a)))
}

// ---------- Progreso e historial ----------

export interface WatchEntry {
  /** id del video: `tt123` para pelis, `tt123:1:2` para episodios. */
  videoId: string
  metaId: string
  type: string
  name: string
  poster?: string
  background?: string
  season?: number
  episode?: number
  episodeTitle?: string
  /** segundos */
  position: number
  duration: number
  watched: boolean
  updatedAt: number
  firstWatchedAt: number
  /** Oculto de "Seguir viendo" por el usuario (se vuelve a mostrar si lo reproduce de nuevo). */
  hidden?: boolean
}

export const progressStore = new PersistedStore<Record<string, WatchEntry>>('progress', {})

const WATCHED_RATIO = 0.9

export function saveProgress(entry: Omit<WatchEntry, 'watched' | 'updatedAt' | 'firstWatchedAt' | 'hidden'>) {
  progressStore.set((all) => {
    const prev = all[entry.videoId]
    const now = Date.now()
    const watched = prev?.watched || (entry.duration > 0 && entry.position / entry.duration >= WATCHED_RATIO)
    return {
      ...all,
      [entry.videoId]: { ...entry, watched, updatedAt: now, firstWatchedAt: prev?.firstWatchedAt ?? now },
    }
  })
}

export function setWatched(
  base: Pick<WatchEntry, 'videoId' | 'metaId' | 'type' | 'name' | 'poster' | 'season' | 'episode' | 'episodeTitle'>,
  watched: boolean,
) {
  progressStore.set((all) => {
    const prev = all[base.videoId]
    if (!watched) {
      if (!prev) return all
      const { [base.videoId]: _removed, ...rest } = all
      return rest
    }
    const now = Date.now()
    return {
      ...all,
      [base.videoId]: {
        ...base,
        position: prev?.position ?? 0,
        duration: prev?.duration ?? 0,
        watched: true,
        updatedAt: now,
        firstWatchedAt: prev?.firstWatchedAt ?? now,
      },
    }
  })
}

export function removeHistory(videoIds: string[]) {
  progressStore.set((all) => {
    const copy = { ...all }
    videoIds.forEach((id) => delete copy[id])
    return copy
  })
}

/** Lo empezado y no terminado, uno por título (el episodio más reciente de cada serie). */
export function continueWatching(all: Record<string, WatchEntry>): WatchEntry[] {
  const byMeta = new Map<string, WatchEntry>()
  for (const e of Object.values(all)) {
    const cur = byMeta.get(e.metaId)
    if (!cur || e.updatedAt > cur.updatedAt) byMeta.set(e.metaId, e)
  }
  return [...byMeta.values()]
    .filter((e) => !e.hidden && !e.watched && e.duration > 0 && e.position > 30)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Saca un título de "Seguir viendo" sin borrar su progreso ni su historial. */
export function hideFromContinue(metaId: string) {
  progressStore.set((all) => {
    const copy = { ...all }
    for (const [id, e] of Object.entries(copy)) if (e.metaId === metaId) copy[id] = { ...e, hidden: true }
    return copy
  })
}

// ---------- Última fuente elegida por título ----------

export interface LastSource {
  /** transportUrl del addon */
  addonUrl: string
  bingeGroup?: string
  /** `name` del stream, para reconocerlo si no hay bingeGroup */
  streamName?: string
  at: number
}

export const lastSourceStore = new PersistedStore<Record<string, LastSource>>('lastSource', {})

// ---------- Audio y subtítulos elegidos por título ----------

export interface TrackPref {
  /** Idioma del subtítulo elegido (ISO 639-2). */
  subLang?: string
  /** Si el elegido era de "forzados" (solo carteles y diálogos en otro idioma). */
  subForced?: boolean
  /** Eligió "Sin subtítulos". */
  subOff?: boolean
  audioLang?: string
  at: number
}

/** Por metaId (serie o peli): le gana a los idiomas generales de Ajustes. */
export const trackPrefsStore = new PersistedStore<Record<string, TrackPref>>('trackPrefs', {})

export function rememberTracks(metaId: string, patch: Partial<TrackPref>) {
  trackPrefsStore.set((all) => ({ ...all, [metaId]: { ...all[metaId], ...patch, at: Date.now() } }))
}

export function forgetTracks(metaId: string) {
  trackPrefsStore.set((all) => {
    const { [metaId]: _removed, ...rest } = all
    return rest
  })
}

// ---------- Mi lista ----------

export interface ListItem {
  id: string
  type: string
  name: string
  poster?: string
  year?: string
  imdbRating?: string
  addedAt: number
}

export const watchlistStore = new PersistedStore<Record<string, ListItem>>('watchlist', {})

export function toggleWatchlist(meta: MetaPreview) {
  watchlistStore.set((all) => {
    if (all[meta.id]) {
      const { [meta.id]: _removed, ...rest } = all
      return rest
    }
    return {
      ...all,
      [meta.id]: {
        id: meta.id,
        type: meta.type,
        name: meta.name,
        poster: meta.poster,
        year: meta.releaseInfo ?? meta.year,
        imdbRating: meta.imdbRating,
        addedAt: Date.now(),
      },
    }
  })
}

// ---------- Catálogos (gestor: renombrar, ocultar, reordenar, fusionar) ----------

export const catalogPrefsStore = new PersistedStore<CatalogPrefs>('catalogPrefs', DEFAULT_CATALOG_PREFS)

// ---------- Ajustes ----------

export interface SubtitleStyle {
  size: 's' | 'm' | 'l' | 'xl'
  color: 'white' | 'yellow'
  background: 'none' | 'light' | 'semi' | 'solid'
  /** Contorno negro alrededor de las letras. */
  outline: boolean
  font: 'system' | 'rounded' | 'serif' | 'mono'
  /** Cuánto más arriba del lugar normal, en % del alto del video. */
  position: 0 | 10 | 20
}

export interface SourceRules {
  /** manual: el usuario elige siempre. auto: se reproduce el mejor stream según las reglas. */
  mode: 'manual' | 'auto'
  /** Volver a usar el mismo addon/fuente que la última vez en ese título. */
  rememberLast: boolean
  preferredQuality: 'any' | '2160p' | '1080p' | '720p'
  /** Palabras que suman puntos (ej. "latino", "dual"). */
  preferKeywords: string[]
  /** Palabras que descartan el stream (ej. "cam", "hdts"). */
  excludeKeywords: string[]
  /** Tamaño máximo en GB (0 = sin límite). */
  maxSizeGB: number
  /** Códecs que descartan el stream. */
  excludeCodecs: ('hevc' | 'av1')[]
  hdr: 'allow' | 'prefer' | 'exclude'
  /** Ocultar los repetidos (mismo torrent o enlace, o mismo archivo y tamaño). */
  dedupe: boolean
}

export interface Settings {
  /** Servidor de streaming de Stremio (solo PC con Stremio abierto). Vacío = desactivado. */
  streamingServerUrl: string
  /** Idiomas de subtítulos preferidos, en códigos ISO 639-2 (spa, eng...). */
  subtitleLangs: string[]
  /** Activar solo el primer subtítulo disponible de `subtitleLangs`. */
  autoSubtitles: boolean
  /** Idiomas de audio preferidos (ISO 639-2), para elegir pista en streams con varias. */
  audioLangs: string[]
  subtitleStyle: SubtitleStyle
  /** Ocultar subtítulos para sordos (SDH) y sacar las descripciones de sonidos. */
  hideSdh: boolean
  autoplayNext: boolean
  /** Saltar intro/resumen/créditos: mostrar botón, saltar solo o nada. */
  skipSegments: 'button' | 'auto' | 'off'
  /** Preguntar "¿Seguís viendo?" después de N episodios seguidos sin tocar nada (0 = nunca). */
  stillWatchingAfter: number
  /** Miniatura del cuadro al pasar el mouse por la barra (se apaga sola con ahorro de datos). */
  seekPreview: boolean
  sourceRules: SourceRules
  /** Reproductor externo para el botón "Abrir en…" (ver lib/externalPlayers.ts). */
  externalPlayer: ExternalPlayerId
  /** API key (v3) o Read Access Token (v4) de TMDB. Vacío = solo Cinemeta. */
  tmdbKey: string
  /** Reproducir el tráiler sin sonido en la portada de Inicio (necesita TMDB). */
  heroTrailer: boolean
  /** Protector de pantalla: minutos sin actividad (0 = apagado). */
  screensaverMinutes: ScreensaverMinutes
  /** Modo TV (teclado en pantalla): automático según el dispositivo, o forzado. */
  tvMode: TvModeSetting
  /** Ajustes: mostrar también las opciones avanzadas (`data-advanced`). */
  showAdvanced: boolean
  /** Ya se mostró (o se salteó) el asistente inicial. */
  onboardingDone: boolean
}

export const settingsStore = new PersistedStore<Settings>('settings', {
  streamingServerUrl: '',
  subtitleLangs: ['spa', 'eng'],
  autoSubtitles: false,
  audioLangs: ['spa', 'eng'],
  subtitleStyle: { size: 'm', color: 'white', background: 'semi', outline: false, font: 'system', position: 0 },
  hideSdh: false,
  autoplayNext: true,
  skipSegments: 'button',
  stillWatchingAfter: 3,
  seekPreview: true,
  sourceRules: {
    mode: 'manual', rememberLast: true, preferredQuality: '1080p', preferKeywords: [], excludeKeywords: ['cam', 'hdcam', 'telesync', 'hdts'],
    maxSizeGB: 0,
    excludeCodecs: [],
    hdr: 'allow',
    dedupe: true,
  },
  externalPlayer: 'system',
  tmdbKey: '',
  heroTrailer: true,
  screensaverMinutes: 5,
  tvMode: 'auto',
  showAdvanced: false,
  onboardingDone: false,
})

// ---------- Copia de seguridad ----------

export function exportData() {
  return {
    app: 'series-pelis',
    version: 1,
    exportedAt: new Date().toISOString(),
    addons: addonsStore.get().map((a) => a.transportUrl),
    progress: progressStore.get(),
    watchlist: watchlistStore.get(),
    settings: settingsStore.get(),
    trackPrefs: trackPrefsStore.get(),
    disabledAddons: addonsStore.get().filter((a) => a.disabled).map((a) => a.transportUrl),
    catalogPrefs: catalogPrefsStore.get(),
  }
}

export async function importData(raw: unknown) {
  const data = raw as ReturnType<typeof exportData>
  if (!data || data.app !== 'series-pelis') throw new Error('El archivo no es una copia de Series-Pelis')
  if (data.progress) progressStore.set((all) => ({ ...all, ...data.progress }))
  if (data.watchlist) watchlistStore.set((all) => ({ ...all, ...data.watchlist }))
  if (data.settings) settingsStore.merge({ ...settingsStore.get(), ...data.settings })
  if (data.trackPrefs) trackPrefsStore.set((all) => ({ ...all, ...data.trackPrefs }))
  const installed = new Set(addonsStore.get().map((a) => a.transportUrl))
  for (const url of data.addons ?? []) {
    if (!installed.has(url)) await installAddon(url).catch(() => {})
  }
  if (data.disabledAddons?.length) data.disabledAddons.forEach((url) => setAddonEnabled(url, false))
  if (data.catalogPrefs) catalogPrefsStore.set(normalizePrefs(data.catalogPrefs))
}

// ---------- Arranque ----------

export async function hydrateStores() {
  await Promise.all([
    addonsStore.hydrate(),
    progressStore.hydrate(),
    watchlistStore.hydrate(),
    settingsStore.hydrate(),
    lastSourceStore.hydrate(),
    trackPrefsStore.hydrate(),
    catalogPrefsStore.hydrate(),
  ])
  if (addonsStore.get().length === 0) addonsStore.set([CINEMETA_ADDON])
  // No bloquea el arranque.
  setTimeout(() => refreshManifests().catch(() => {}), 2000)
}

import { useSyncExternalStore } from 'react'
import { createStore, delMany, get, update } from 'idb-keyval'
import { clearCache, dropLegacySwCaches, isQuotaError } from './cache'
import { announce, applyPatch, diffPatch, newestUpdate, onRemoteChange, type Patch, type Resolver } from './storeSync'
import { CINEMETA_ADDON, cleanManifest, fetchManifest } from './addons'
import { mergeProgress, mergeWatchlist } from './stremioLibrary'
import { DEFAULT_CATALOG_PREFS, normalizePrefs, type CatalogPrefs } from './catalogPrefs'
import { crossedFinish, diaryEntryFrom, isDuplicate, missingFromProgress, rebuildFromProgress, withoutLatest, withoutVideos, type DiaryEntry, type DiaryState } from './diary'
import type { GoalsState } from './goals'
import type { ExternalPlayerId } from './externalPlayers'
import type { ScreensaverMinutes } from './idle'
import type { TvModeSetting } from './platform'
import type { InstalledAddon, Manifest, MetaPreview } from './types'
import { cleanSettings } from './settingsModel'
import { cleanProfile, MAIN_PROFILE, PROFILE_STORES, profileStorageKey, type Profile } from './profileModel'
import { activeProfileId, profileWritesFrozen, setActiveProfileId } from './profiles'

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

export interface StoreOptions<T = unknown> {
  /** Hasta qué nivel se mezcla con lo de otras pestañas (1: por clave; 2: también un nivel adentro). */
  depth?: number
  /** Para una misma clave cambiada en dos pestañas, cuál queda (ver storeSync.ts). */
  resolve?: Resolver
  /** Cada perfil tiene el suyo (v0.18): se guarda en `p:<perfil>:<clave>`; el principal, en `<clave>`. */
  perProfile?: boolean
  /** Revisa lo que llega de afuera (IndexedDB, copias) contra el valor de fábrica; por defecto, solo se completa con él. */
  clean?: (stored: unknown, base: T) => T
}

// ---------- Problemas al guardar (cuota llena) ----------

let storageIssue: string | undefined
const issueListeners = new Set<() => void>()

function setStorageIssue(text: string | undefined) {
  if (storageIssue === text) return
  storageIssue = text
  issueListeners.forEach((l) => l())
}

export const storageIssueStore = {
  get: () => storageIssue,
  subscribe: (l: () => void) => {
    issueListeners.add(l)
    return () => issueListeners.delete(l)
  },
  dismiss: () => setStorageIssue(undefined),
}

export function useStorageIssue(): string | undefined {
  return useSyncExternalStore(storageIssueStore.subscribe, storageIssueStore.get, storageIssueStore.get)
}

export class PersistedStore<T> {
  private initial: T

  private value: T
  private listeners = new Set<() => void>()
  /** Sube con cada cambio local: si cambió mientras se releía de IndexedDB, se vuelve a leer. */
  private seq = 0

  constructor(
    private key: string,
    initial: T,
    private opts: StoreOptions<T> = {},
  ) {
    this.value = initial
    this.initial = initial
    // Otra pestaña guardó esta clave: se relee (auditoría #2). Los de cada perfil, al leerlos (ver `hydrate`).
    if (!opts.perProfile) onRemoteChange(key, () => void this.refresh())
  }

  /** Dónde se guarda. El perfil queda fijo hasta recargar la app (cambiar de perfil recarga). */
  private get storageKey() {
    return this.opts.perProfile ? profileStorageKey(this.key, activeProfileId()) : this.key
  }

  /** Valores por defecto con lo que haya en `stored` encima (para importar copias viejas). */
  merge(stored: T) {
    this.set(this.restore(this.initial, stored))
  }

  private restore(base: T, stored: T): T {
    return this.opts.clean ? this.opts.clean(stored, base) : withDefaults(base, stored)
  }

  async hydrate() {
    if (this.opts.perProfile) onRemoteChange(this.storageKey, () => void this.refresh())
    try {
      const stored = await get<T>(this.storageKey, idb)
      if (stored !== undefined) {
        // En objetos de configuración completamos con los valores por defecto de campos nuevos.
        this.value = this.restore(this.initial, stored)
      }
    } catch {
      // IndexedDB bloqueado (modo privado, por ejemplo): seguimos con los valores por defecto.
    }
  }

  /** Relee de IndexedDB lo que guardó otra pestaña. */
  async refresh(): Promise<void> {
    const seq = this.seq
    let stored: T | undefined
    try {
      stored = await get<T>(this.storageKey, idb)
    } catch {
      return
    }
    // Hubo un cambio acá mientras tanto: su escritura va después de esta lectura, así que se relee.
    if (seq !== this.seq) return this.refresh()
    if (stored === undefined) return
    this.value = this.restore(this.initial, stored)
    this.emit()
  }

  get = () => this.value

  set(next: T | ((prev: T) => T)) {
    const prev = this.value
    const value = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
    if (Object.is(value, prev)) return
    this.value = value
    this.seq++
    this.emit()
    // Perfil borrándose (ver initProfileWatch): guardar ahora lo volvería a crear en este aparato.
    if (this.opts.perProfile && profileWritesFrozen()) return
    // Se escribe enseguida: los cambios son pocos (el progreso se guarda cada 5 s) y así
    // no se pierde nada si se cierra la app justo después.
    this.write(diffPatch(prev, value, this.opts.depth ?? 1), value, false)
  }

  /**
   * Guarda solo lo que cambió, mezclado con lo que haya en IndexedDB en una sola transacción
   * (`update` de idb-keyval): lo que guardó otra pestaña mientras tanto no se pisa.
   */
  private write(patch: Patch, value: T, retried: boolean) {
    const fail = (err: unknown) => void this.writeFailed(err, patch, value, retried)
    const key = this.storageKey
    try {
      update<unknown>(key, (stored) => (stored === undefined ? value : applyPatch(stored, patch, value, this.opts.resolve)), idb).then(() => {
        if (retried) setStorageIssue(undefined)
        announce(key)
      }, fail)
    } catch (err) {
      fail(err)
    }
  }

  private async writeFailed(err: unknown, patch: Patch, value: T, retried: boolean) {
    if (!isQuotaError(err)) {
      console.warn(`No se pudo guardar "${this.key}"`, err)
      return
    }
    if (!retried) {
      // Cuota llena (auditoría #5): la caché de catálogos y fichas se puede volver a bajar; el progreso no.
      await clearCache().catch(() => {})
      this.write(patch, value, true)
      return
    }
    setStorageIssue('El navegador se quedó sin espacio y no se pudo guardar tu progreso. Liberá espacio (o borrá datos de otros sitios) y volvé a abrir la app.')
  }

  private emit() {
    this.listeners.forEach((l) => l())
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

/** `updated`: ya estaba y se actualizó; `disabled`: ya estaba apagado y sigue apagado. */
export type InstallStatus = 'new' | 'updated' | 'disabled'

// Identidad de un addon: su URL (ver addonKey.ts).
export { addonKey, sameAddon } from './addonKey'
import { addonKey, sameAddon } from './addonKey'

export async function installAddon(manifestUrl: string): Promise<{ manifest: Manifest; status: InstallStatus }> {
  const manifest = await fetchManifest(manifestUrl, { strict: true })
  let status: InstallStatus = 'new'
  addonsStore.set((list) => {
    const existing = list.findIndex((a) => sameAddon(a.transportUrl, manifestUrl))
    const entry: InstalledAddon = { transportUrl: manifestUrl, manifest }
    if (existing < 0) return [...list, entry]
    // Volver a pegar la URL no lo prende: si estaba apagado, sigue apagado (se avisa en pantalla).
    status = list[existing].disabled ? 'disabled' : 'updated'
    if (list[existing].disabled) entry.disabled = true
    return list.map((a, i) => (i === existing ? entry : a))
  })
  return { manifest, status }
}

/** Quita un addon. Devuelve lo quitado y dónde estaba, para "Deshacer" (`restoreAddon`). */
export function removeAddon(transportUrl: string): { addon: InstalledAddon; index: number } | undefined {
  const list = addonsStore.get()
  const index = list.findIndex((a) => a.transportUrl === transportUrl)
  if (index < 0) return undefined
  const addon = list[index]
  addonsStore.set((all) => all.filter((a) => a.transportUrl !== transportUrl))
  return { addon, index }
}

/** "Deshacer" de `removeAddon`: lo vuelve a poner en su lugar (si mientras tanto se agregó otra vez, no hace nada). */
export function restoreAddon(removed: { addon: InstalledAddon; index: number }) {
  addonsStore.set((list) => {
    if (list.some((a) => sameAddon(a.transportUrl, removed.addon.transportUrl))) return list
    const copy = [...list]
    copy.splice(Math.min(removed.index, copy.length), 0, removed.addon)
    return copy
  })
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
    const urls = new Set(list.map((a) => addonKey(a.transportUrl)))
    const fresh: InstalledAddon[] = []
    for (const e of entries) {
      const key = addonKey(e.transportUrl)
      if (urls.has(key)) continue
      urls.add(key)
      fresh.push(e)
    }
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

/** Cada cuánto se vuelve a bajar el manifest de cada addon (catálogos o géneros nuevos). */
export const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000
const MANIFEST_CHECKED_KEY = 'sp-manifest-checked'

/** Cuándo se revisó por última vez cada addon (por URL), en localStorage para no bajar todo en cada arranque. */
function manifestChecks(): Record<string, number> {
  try {
    const raw = localStorage.getItem(MANIFEST_CHECKED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    return isPlain(parsed) ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveManifestChecks(checks: Record<string, number>) {
  try {
    localStorage.setItem(MANIFEST_CHECKED_KEY, JSON.stringify(checks))
  } catch {
    // Sin localStorage (modo privado): se revisa en cada arranque, como antes.
  }
}

/**
 * Actualiza en segundo plano los manifests que no se revisaron en las últimas 24 h. Si ningún manifest
 * cambió no se toca la lista: así Buscar, "Tus series" y "Tu año" no repiten sus pedidos al arrancar.
 */
export async function refreshManifests(now = Date.now()) {
  const checks = manifestChecks()
  const fresh = new Map<string, InstalledAddon['manifest']>()
  const due = addonsStore.get().filter((a) => now - (checks[addonKey(a.transportUrl)] ?? 0) >= MANIFEST_TTL_MS)
  if (due.length === 0) return
  await Promise.all(
    due.map(async (a) => {
      try {
        fresh.set(a.transportUrl, await fetchManifest(a.transportUrl))
        checks[addonKey(a.transportUrl)] = now
      } catch {
        // Si un addon no responde dejamos el manifest que ya teníamos y se vuelve a probar en el próximo arranque.
      }
    }),
  )
  // Olvidamos los addons que ya no están para que la marca no crezca sin fin.
  const installed = new Set(addonsStore.get().map((a) => addonKey(a.transportUrl)))
  for (const k of Object.keys(checks)) if (!installed.has(k)) delete checks[k]
  saveManifestChecks(checks)
  // Mezclamos sobre la lista actual: mientras tanto el usuario pudo agregar o quitar addons.
  const list = addonsStore.get()
  const changed = list.some((a) => {
    const next = fresh.get(a.transportUrl)
    return !!next && JSON.stringify(next) !== JSON.stringify(a.manifest)
  })
  if (!changed) return
  addonsStore.set((cur) =>
    cur.map((a) => {
      const next = fresh.get(a.transportUrl)
      return next && JSON.stringify(next) !== JSON.stringify(a.manifest) ? { ...a, manifest: next } : a
    }),
  )
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

export const progressStore = new PersistedStore<Record<string, WatchEntry>>('progress', {}, { resolve: newestUpdate, perProfile: true })

const WATCHED_RATIO = 0.9
/** Retroceder más que esto respecto de donde iba cuenta como "lo empezó de nuevo". */
const RESTART_GAP_S = 60

const ratioOf = (e: { position: number; duration: number } | undefined) => (e && e.duration > 0 ? e.position / e.duration : 0)

/**
 * Algo ya visto que se vuelve a mirar: desde el principio (lo anterior había quedado al final, o se marcó
 * visto a mano sin reproducirlo) o bastante antes de donde iba. Deja de contar como visto para que vuelva
 * a "Seguir viendo" y retome; al terminarlo otra vez, el diario lo anota de nuevo.
 */
export function restartedWatched(prev: WatchEntry | undefined, next: { position: number; duration: number }): boolean {
  if (!prev?.watched || ratioOf(next) >= WATCHED_RATIO) return false
  return prev.duration <= 0 || ratioOf(prev) >= WATCHED_RATIO || next.position < prev.position - RESTART_GAP_S
}

export function saveProgress(entry: Omit<WatchEntry, 'watched' | 'updatedAt' | 'firstWatchedAt' | 'hidden'>) {
  const before = progressStore.get()[entry.videoId]
  if (crossedFinish(before, entry)) logDiary(entry, 'player')
  progressStore.set((all) => {
    const prev = all[entry.videoId]
    const now = Date.now()
    const watched = restartedWatched(prev, entry) ? false : prev?.watched || ratioOf(entry) >= WATCHED_RATIO
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
      diaryStore.set((d) => ({ ...d, entries: withoutLatest(d.entries, base.videoId) }))
      const { [base.videoId]: _removed, ...rest } = all
      return rest
    }
    const now = Date.now()
    if (!prev?.watched) logDiary({ ...base, duration: prev?.duration }, 'manual')
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

/**
 * Marca (o desmarca) varios videos de una vez, por ejemplo una temporada entera: una sola escritura
 * del progreso y una del diario. Misma lógica que `setWatched`; lo que ya estaba como se pide no se toca.
 */
export function setWatchedMany(
  bases: Array<Pick<WatchEntry, 'videoId' | 'metaId' | 'type' | 'name' | 'poster' | 'season' | 'episode' | 'episodeTitle'>>,
  watched: boolean,
) {
  progressStore.set((all) => {
    const now = Date.now()
    const next = { ...all }
    const changed: typeof bases = []
    for (const base of bases) {
      const prev = all[base.videoId]
      if (!watched) {
        if (!prev) continue
        delete next[base.videoId]
        changed.push(base)
        continue
      }
      if (prev?.watched) continue
      changed.push(base)
      next[base.videoId] = {
        ...base,
        position: prev?.position ?? 0,
        duration: prev?.duration ?? 0,
        watched: true,
        updatedAt: now,
        firstWatchedAt: prev?.firstWatchedAt ?? now,
      }
    }
    if (changed.length === 0) return all
    diaryStore.set((d) => {
      let entries = d.entries
      for (const base of changed) {
        if (!watched) {
          entries = withoutLatest(entries, base.videoId)
          continue
        }
        if (isDuplicate(entries, base.videoId, now)) continue
        const entry = diaryEntryFrom({ ...base, duration: all[base.videoId]?.duration }, now, 'manual')
        entries = { ...entries, [entry.id]: entry }
      }
      return entries === d.entries ? d : { ...d, entries }
    })
    return next
  })
}

/** Lo que borró `removeHistory`, para "Deshacer". */
export interface RemovedHistory {
  progress: WatchEntry[]
  diary: DiaryEntry[]
}

/** Saca esos videos del historial (y del diario). Devuelve una copia de lo borrado para poder deshacerlo. */
export function removeHistory(videoIds: string[]): RemovedHistory {
  const ids = new Set(videoIds)
  const progressAll = progressStore.get()
  const removed: RemovedHistory = {
    progress: videoIds.map((id) => progressAll[id]).filter((e): e is WatchEntry => !!e),
    diary: Object.values(diaryStore.get().entries).filter((d) => ids.has(d.videoId)),
  }
  diaryStore.set((d) => ({ ...d, entries: withoutVideos(d.entries, videoIds) }))
  progressStore.set((all) => {
    const copy = { ...all }
    videoIds.forEach((id) => delete copy[id])
    return copy
  })
  return removed
}

/** "Deshacer" de `removeHistory`: vuelve a poner lo borrado (si mientras tanto se volvió a ver, gana lo nuevo). */
export function restoreHistory(removed: RemovedHistory) {
  if (removed.progress.length > 0) {
    progressStore.set((all) => {
      const copy = { ...all }
      for (const e of removed.progress) if (!copy[e.videoId]) copy[e.videoId] = e
      return copy
    })
  }
  if (removed.diary.length > 0) {
    diaryStore.set((d) => {
      const entries = { ...d.entries }
      for (const e of removed.diary) if (!entries[e.id]) entries[e.id] = e
      return { ...d, entries }
    })
  }
}

/**
 * Borra todo el historial del perfil activo: lo visto, "Seguir viendo" y el diario (uso-04). "Mi lista", las
 * estrellas, las metas y los ajustes quedan. Son los mismos stores por perfil que usa `removeHistory`, así que con
 * la casa se sincroniza igual (cada entrada borrada sube como lápida, en tandas). Devuelve lo borrado para "Deshacer".
 */
export function clearHistory(): RemovedHistory {
  const removed: RemovedHistory = { progress: Object.values(progressStore.get()), diary: Object.values(diaryStore.get().entries) }
  progressStore.set((all) => (Object.keys(all).length ? {} : all))
  diaryStore.set((d) => (Object.keys(d.entries).length ? { ...d, entries: {} } : d))
  return removed
}

/** Cómo estaban esos videos antes de marcarlos o desmarcarlos en bloque (una temporada), para "Deshacer". */
export interface WatchSnapshot {
  videoIds: string[]
  progress: Record<string, WatchEntry>
  diary: DiaryEntry[]
}

export function snapshotWatch(videoIds: string[]): WatchSnapshot {
  const ids = new Set(videoIds)
  const all = progressStore.get()
  return {
    videoIds,
    progress: Object.fromEntries(videoIds.filter((id) => all[id]).map((id) => [id, all[id]])),
    diary: Object.values(diaryStore.get().entries).filter((d) => ids.has(d.videoId)),
  }
}

/** "Deshacer" de `setWatchedMany`: deja el progreso y el diario de esos videos como estaban en `snapshotWatch`. */
export function restoreWatchSnapshot(snap: WatchSnapshot) {
  const ids = new Set(snap.videoIds)
  progressStore.set((all) => {
    const copy = { ...all }
    for (const id of snap.videoIds) {
      if (snap.progress[id]) copy[id] = snap.progress[id]
      else delete copy[id]
    }
    return copy
  })
  diaryStore.set((d) => {
    const entries = Object.fromEntries(Object.entries(d.entries).filter(([, e]) => !ids.has(e.videoId)))
    for (const e of snap.diary) entries[e.id] = e
    return { ...d, entries }
  })
}

/**
 * Segundos vistos para que algo cuente como "empezado": Seguir viendo, "Continuar · quedan…" en la
 * ficha y el reproductor (que retoma desde ahí) usan este mismo umbral. Menos es un arranque y se
 * vuelve a empezar de cero.
 */
export const RESUME_MIN_S = 30

/** Lo empezado y no terminado, uno por título (el episodio más reciente de cada serie). */
export function continueWatching(all: Record<string, WatchEntry>): WatchEntry[] {
  const byMeta = new Map<string, WatchEntry>()
  for (const e of Object.values(all)) {
    const cur = byMeta.get(e.metaId)
    if (!cur || e.updatedAt > cur.updatedAt) byMeta.set(e.metaId, e)
  }
  return [...byMeta.values()]
    .filter((e) => !e.hidden && !e.watched && e.duration > 0 && e.position > RESUME_MIN_S)
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

// ---------- Diario y metas (v0.5) ----------

/** Cada vez que se terminó algo (ver `lib/diary.ts`). */
export const diaryStore = new PersistedStore<DiaryState>('diary', { v: 0, entries: {} }, { depth: 2, perProfile: true })

function logDiary(e: Parameters<typeof diaryEntryFrom>[0], source: DiaryEntry['source']) {
  const at = Date.now()
  diaryStore.set((d) => {
    if (isDuplicate(d.entries, e.videoId, at)) return d
    const entry = diaryEntryFrom(e, at, source)
    return { ...d, entries: { ...d.entries, [entry.id]: entry } }
  })
}

export function removeDiaryEntry(id: string) {
  diaryStore.set((d) => {
    const { [id]: _removed, ...rest } = d.entries
    return { ...d, entries: rest }
  })
}

/** Metas anuales y logros ya vistos (ver `lib/goals.ts`). */
export const goalsStore = new PersistedStore<GoalsState>('goals', { byYear: {}, seen: [] }, { depth: 2, perProfile: true })

// ---------- Última fuente elegida por título ----------

export interface LastSource {
  /** transportUrl del addon */
  addonUrl: string
  bingeGroup?: string
  /** `name` del stream, para reconocerlo si no hay bingeGroup */
  streamName?: string
  /** v0.14: título o archivo del stream, para seguir en el mismo idioma y release (ver `lastSourceOf`). */
  streamTitle?: string
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

export const watchlistStore = new PersistedStore<Record<string, ListItem>>('watchlist', {}, { perProfile: true })

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

// ---------- v0.5 gustos: tu puntaje y "Ya no me interesa" ----------

/** Tu puntaje de un título (peli o serie), de 0,5 a 5 estrellas. */
export interface RatingEntry {
  stars: number
  at: number
  type: string
  name: string
  poster?: string
  /** Id de TMDB, si se conocía al puntuar (para las recomendaciones). */
  tmdbId?: number
}

/** Por id del título (`tt…`, o `tmdb:movie:603` si no tiene IMDb). Ver `ratings.ts`. */
export const ratingsStore = new PersistedStore<Record<string, RatingEntry>>('ratings', {}, { perProfile: true })

/** Títulos que el usuario sacó de las recomendaciones y de las filas de Inicio. */
export interface NotInterestedEntry {
  id: string
  type: string
  name: string
  poster?: string
  tmdbId?: number
  at: number
}

export const notInterestedStore = new PersistedStore<Record<string, NotInterestedEntry>>('notInterested', {}, { perProfile: true })

// ---------- v0.5: búsquedas recientes ----------

/** Lo último que buscó el usuario (máx. 10, la más nueva primero). */
export const recentSearchesStore = new PersistedStore<string[]>('recentSearches', [])
// ---------- Catálogos (gestor: renombrar, ocultar, reordenar, fusionar) ----------

export const catalogPrefsStore = new PersistedStore<CatalogPrefs>('catalogPrefs', DEFAULT_CATALOG_PREFS)

/**
 * Borra de este aparato todo lo que tiene URLs de addons (llevan la key del debrid): la lista, la última
 * fuente por título, las filas de catálogos, las revisiones de manifests y la caché de respuestas.
 * Se usa cuando un aparato que no es del admin sale de la casa o lo sacan (v0.17.1).
 */
export async function forgetAddonData() {
  addonsStore.set([CINEMETA_ADDON])
  lastSourceStore.set({})
  catalogPrefsStore.set(DEFAULT_CATALOG_PREFS)
  try {
    localStorage.removeItem(MANIFEST_CHECKED_KEY)
  } catch {
    // Sin localStorage no había nada guardado.
  }
  await clearCache().catch(() => {})
}

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
  /** v0.20: en la app de Android TV, reproducir con el reproductor nativo (Media3) en vez del de la web. Por aparato. */
  nativePlayer: boolean
  /** API key (v3) o Read Access Token (v4) de TMDB. Vacío = solo Cinemeta. */
  tmdbKey: string
  /** Modo sin spoilers: difumina miniaturas y oculta sinopsis de los episodios que no viste. */
  spoilerFree: boolean
  /** Con el modo sin spoilers, ocultar también la sinopsis de los títulos que no empezaste. */
  spoilerUnstarted: boolean
  /** v0.22.3: la casa ya recibió el modo sin spoilers prendido (se sincroniza; ver `applyHouseDefaults`). */
  spoilerDefaulted: boolean
  /** v0.26.2: la casa ya eligió idiomas (asistente o Ajustes). Se sincroniza: con login, un aparato nuevo no muestra el asistente. */
  langsChosen: boolean
  /** Ofrecer puntuar con estrellas al terminar una peli o el último episodio. */
  askRatingAtEnd: boolean
  /** v0.5: puntaje de IMDb sobre el póster, debajo (como antes) o sin puntaje. */
  posterRating: 'on' | 'below' | 'off'
  /** v0.5: etiquetas "Episodio nuevo", "Temporada nueva", "Top 10" y "Estreno" en los pósters. */
  posterLabels: boolean
  /** v0.5: tráiler en una tarjeta ampliada al quedarse unos segundos sobre un póster (no en celulares). */
  hoverTrailer: boolean
  /** v0.5: ids de listas curadas que se muestran como filas en Inicio. */
  curatedRows: string[]
  /** Protector de pantalla: minutos sin actividad (0 = apagado). */
  screensaverMinutes: ScreensaverMinutes
  /** Modo TV (teclado en pantalla): automático según el dispositivo, o forzado. */
  tvMode: TvModeSetting
  /** Ajustes: mostrar también las opciones avanzadas (`data-advanced`). */
  showAdvanced: boolean
  /** Ya se mostró (o se salteó) el asistente inicial. */
  onboardingDone: boolean
  /** Ya se vio la guía del control remoto (la capa con tarjetas que aparece la primera vez en la TV). */
  hintsSeen: boolean
  /** v0.10: mandar solos los errores de la app al sitio (sin URLs de addons ni keys; ver lib/diagnostics.ts). */
  sendReports: boolean
  /** v0.12.2: ya se prendieron una vez los subtítulos automáticos (antes venían apagados de fábrica). */
  autoSubsMigrated: boolean
  /** v0.14: tamaño de la interfaz en % (90, 100, 115 o 130). Ver lib/tv.ts (`UI_SCALES`). */
  uiScale: number
}

/** Ajustes de fábrica (los de "Restablecer ajustes"). */
export const DEFAULT_SETTINGS: Settings = {
  streamingServerUrl: '',
  subtitleLangs: ['spa', 'eng'],
  autoSubtitles: true,
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
  nativePlayer: true,
  tmdbKey: '',
  spoilerFree: true,
  spoilerUnstarted: false,
  spoilerDefaulted: false,
  langsChosen: false,
  askRatingAtEnd: true,
  posterRating: 'on',
  posterLabels: true,
  hoverTrailer: true,
  curatedRows: [],
  screensaverMinutes: 5,
  tvMode: 'auto',
  showAdvanced: false,
  onboardingDone: false,
  hintsSeen: false,
  sendReports: false,
  autoSubsMigrated: false,
  uiScale: 100,
}

export const settingsStore = new PersistedStore<Settings>('settings', DEFAULT_SETTINGS, { clean: cleanSettings })

/**
 * Marcas que no se tocan al restablecer: la key de TMDB es personal y las demás (asistente visto, guía del control,
 * modo sin spoilers y subtítulos ya dados de fábrica, idiomas ya elegidos) son avisos de "esto ya pasó". Con la casa se
 * sincronizan: volverlas a falso las subiría como cambio más nuevo y a los otros aparatos les reaparecería el asistente.
 */
const KEPT_ON_RESET = ['tmdbKey', 'onboardingDone', 'hintsSeen', 'spoilerDefaulted', 'langsChosen', 'autoSubsMigrated'] as const

/** "Restablecer ajustes" (uso-04): todo a los valores de fábrica menos `KEPT_ON_RESET`. No toca addons, historial ni sesión. */
export function resetSettings(): Settings {
  const before = settingsStore.get()
  const next: Settings = { ...DEFAULT_SETTINGS }
  for (const k of KEPT_ON_RESET) (next as unknown as Record<string, unknown>)[k] = before[k]
  settingsStore.set(next)
  return before
}

/**
 * v0.22.3: el modo sin spoilers viene prendido de fábrica. A las casas que ya lo tenían apagado se les prende una
 * sola vez: la marca `spoilerDefaulted` es de la casa, así un aparato que se actualiza más tarde no lo vuelve a
 * prender si alguien lo apagó. Con casas se llama después de bajar lo de la casa (`cloudSync.ts`).
 */
export function applyHouseDefaults() {
  if (!settingsStore.get().spoilerDefaulted) settingsStore.set((s) => ({ ...s, spoilerFree: true, spoilerDefaulted: true }))
}

// ---------- Copia de seguridad ----------

export function exportData() {
  // La key de TMDB es personal y no va en la copia (se comparte entre casas y se manda por chat).
  const { tmdbKey: _tmdbKey, ...settings } = settingsStore.get()
  const addons = addonsStore.get()
  return {
    // Identificador del formato, de cuando la app se llamaba Series-Pelis: no cambiarlo, así se importan las copias viejas.
    app: 'series-pelis',
    version: 1,
    exportedAt: new Date().toISOString(),
    addons: addons.map((a) => a.transportUrl),
    // Los manifests van también: si al restaurar un addon no responde, se instala igual con esto
    // (auditoría #10) y el manifest se actualiza solo en el próximo arranque.
    addonManifests: Object.fromEntries(addons.map((a) => [a.transportUrl, a.manifest])),
    progress: progressStore.get(),
    watchlist: watchlistStore.get(),
    settings,
    trackPrefs: trackPrefsStore.get(),
    ratings: ratingsStore.get(),
    notInterested: notInterestedStore.get(),
    diary: diaryStore.get().entries,
    goals: goalsStore.get(),
    recentSearches: recentSearchesStore.get(),
    disabledAddons: addons.filter((a) => a.disabled).map((a) => a.transportUrl),
    catalogPrefs: catalogPrefsStore.get(),
  }
}

/** Un bloque `{ id: {...}, ... }` de la copia: solo las entradas que son objetos. Si el bloque no es un objeto, nada. */
function plainRecord<T>(v: unknown): Record<string, T> | undefined {
  if (!isPlain(v)) return undefined
  const out: Record<string, T> = {}
  for (const [k, e] of Object.entries(v)) if (isPlain(e)) out[k] = e as T
  return out
}

const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Entradas de progreso de una copia, con los campos que usa la mezcla (las rotas se descartan). */
function progressEntries(record: Record<string, WatchEntry>): WatchEntry[] {
  const out: WatchEntry[] = []
  for (const [key, e] of Object.entries(record)) {
    const videoId = typeof e.videoId === 'string' && e.videoId ? e.videoId : key
    if (typeof e.metaId !== 'string' || !e.metaId) continue
    const updatedAt = num(e.updatedAt) ?? 0
    out.push({
      ...e,
      videoId,
      position: num(e.position) ?? 0,
      duration: num(e.duration) ?? 0,
      watched: e.watched === true,
      updatedAt,
      firstWatchedAt: num(e.firstWatchedAt) ?? updatedAt,
    })
  }
  return out
}

/**
 * Suma progreso de otro lado (una copia o la cuenta de Stremio) sin pisar lo más nuevo de acá
 * (auditoría #3): por cada video gana el de `updatedAt` más reciente, y "visto" no se pierde.
 * Lo terminado que llega va también al diario (auditoría #8), así Diario, Metas y "Tu año" lo cuentan.
 * Devuelve cuántas entradas cambiaron.
 */
export function importProgress(entries: WatchEntry[]): number {
  const { result, changed } = mergeProgress(progressStore.get(), entries)
  if (changed === 0) return 0
  progressStore.set(result)
  const touched: Record<string, WatchEntry> = {}
  for (const e of entries) if (result[e.videoId] === e || result[e.videoId]?.updatedAt === e.updatedAt) touched[e.videoId] = result[e.videoId]
  diaryStore.set((d) => {
    const missing = missingFromProgress(d.entries, touched)
    return Object.keys(missing).length ? { ...d, v: 1, entries: { ...d.entries, ...missing } } : d
  })
  return changed
}

/** Por cada id queda la entrada con el campo `at` más nuevo (puntajes, idiomas elegidos, "Ya no me interesa"). */
export function newestByAt<T extends { at?: number }>(current: Record<string, T>, incoming: Record<string, T>): Record<string, T> {
  let out = current
  for (const [id, e] of Object.entries(incoming)) {
    const cur = current[id]
    if (cur && (num(cur.at) ?? 0) >= (num(e.at) ?? 0)) continue
    if (out === current) out = { ...current }
    out[id] = e
  }
  return out
}

export interface ImportReport {
  /** Addons que no respondieron y no se pudieron agregar (copias viejas, sin los manifests). */
  failedAddons: string[]
  /** Addons que no respondieron pero se agregaron con el manifest de la copia. */
  offlineAddons: string[]
}

/**
 * Importa una copia y la mezcla con lo de acá. Lo que no tenga la forma esperada (por ejemplo,
 * `progress` como texto) se ignora.
 */
export async function importData(raw: unknown): Promise<ImportReport> {
  if (!isPlain(raw) || raw.app !== 'series-pelis') throw new Error('El archivo no es una copia de Flix')
  const data = raw as Partial<Record<keyof ReturnType<typeof exportData>, unknown>>
  const progress = plainRecord<WatchEntry>(data.progress)
  const watchlist = plainRecord<ListItem>(data.watchlist)
  const trackPrefs = plainRecord<TrackPref>(data.trackPrefs)
  const ratings = plainRecord<RatingEntry>(data.ratings)
  const notInterested = plainRecord<NotInterestedEntry>(data.notInterested)
  const diary = plainRecord<DiaryEntry>(data.diary)
  if (diary) diaryStore.set((d) => ({ v: 1, entries: { ...diary, ...d.entries } }))
  // Después del diario: lo terminado que el diario de la copia no tenía se anota (copias viejas sin diario).
  if (progress) importProgress(progressEntries(progress))
  if (watchlist) watchlistStore.set((all) => mergeWatchlist(all, Object.values(watchlist).filter((it) => typeof it.id === 'string')).result)
  if (isPlain(data.settings)) {
    // La key de TMDB de otra persona no se pisa con la copia (las copias nuevas ya no la traen).
    // Cada campo se revisa contra su tipo y sus valores (uso-01): lo mal formado se descarta y queda lo de acá.
    const { tmdbKey: _tmdbKey, ...settings } = data.settings
    settingsStore.set((cur) => cleanSettings(settings, cur))
  }
  if (trackPrefs) trackPrefsStore.set((all) => newestByAt(all, trackPrefs))
  if (ratings) ratingsStore.set((all) => newestByAt(all, ratings))
  if (notInterested) notInterestedStore.set((all) => newestByAt(all, notInterested))
  if (isPlain(data.goals)) {
    const goals = data.goals
    const byYear = plainRecord<GoalsState['byYear'][string]>(goals.byYear) ?? {}
    goalsStore.set((g) => ({ byYear: { ...g.byYear, ...byYear }, seen: [...new Set([...g.seen, ...stringList(goals.seen)])] }))
  }
  if (Array.isArray(data.recentSearches)) recentSearchesStore.set(stringList(data.recentSearches).slice(0, 10))
  const report: ImportReport = { failedAddons: [], offlineAddons: [] }
  const manifests = isPlain(data.addonManifests) ? data.addonManifests : {}
  const installed = new Set(addonsStore.get().map((a) => addonKey(a.transportUrl)))
  for (const url of stringList(data.addons)) {
    if (installed.has(addonKey(url))) continue
    try {
      await installAddon(url)
    } catch {
      // No responde ahora (rate limit, caído): con el manifest de la copia se instala igual.
      let manifest: Manifest | undefined
      try {
        manifest = cleanManifest(manifests[url])
      } catch {
        manifest = undefined
      }
      if (manifest) {
        addInstalledAddons([{ transportUrl: url, manifest }])
        report.offlineAddons.push(url)
      } else report.failedAddons.push(url)
    }
  }
  stringList(data.disabledAddons).forEach((url) => setAddonEnabled(url, false))
  if (isPlain(data.catalogPrefs)) catalogPrefsStore.set(normalizePrefs(data.catalogPrefs as Partial<CatalogPrefs>))
  return report
}

// ---------- Arranque ----------

/** Listas curadas que ya no existen (las de IMDb, v0.13.0). */
const isRemovedList = (id: string) => id.startsWith('top-imdb-')

// ---------- Perfiles (v0.18) ----------

/** Los perfiles de la casa (se sincronizan con la casa). El principal no hace falta que esté: ver `listProfiles`. */
export const profilesStore = new PersistedStore<Record<string, Profile>>('profiles', {})

/** Borra de este aparato los datos de un perfil (el principal nunca se borra así). */
export async function forgetProfileData(id: string) {
  if (id === MAIN_PROFILE) return
  try {
    await delMany(
      PROFILE_STORES.map((k) => profileStorageKey(k, id)),
      idb,
    )
  } catch {
    // Nada que borrar.
  }
}

export async function hydrateStores() {
  // Primero los perfiles: si el de este aparato ya no existe (lo borraron), se vuelve al principal.
  await profilesStore.hydrate()
  const savedProfiles = profilesStore.get()
  const entries = Object.entries(isPlain(savedProfiles) ? savedProfiles : {})
  const profiles: Record<string, Profile> = {}
  for (const [id, raw] of entries) {
    const p = cleanProfile(id, raw)
    if (p) profiles[id] = p
  }
  if (JSON.stringify(profiles) !== JSON.stringify(savedProfiles)) profilesStore.set(profiles)
  const active = activeProfileId()
  if (active !== MAIN_PROFILE && !profiles[active]) setActiveProfileId(MAIN_PROFILE)
  await Promise.all([
    addonsStore.hydrate(),
    progressStore.hydrate(),
    watchlistStore.hydrate(),
    settingsStore.hydrate(),
    lastSourceStore.hydrate(),
    trackPrefsStore.hydrate(),
    ratingsStore.hydrate(),
    notInterestedStore.hydrate(),
    diaryStore.hydrate(),
    goalsStore.hydrate(),
    recentSearchesStore.hydrate(),
    catalogPrefsStore.hydrate(),
  ])
  // La primera vez el diario se arma con lo que ya estaba marcado como visto.
  if (diaryStore.get().v === 0) diaryStore.set({ v: 1, entries: rebuildFromProgress(progressStore.get()) })
  if (addonsStore.get().length === 0) addonsStore.set([CINEMETA_ADDON])
  // Addons guardados antes de validar los manifests (auditoría #14): uno sin nombre rompía Ajustes entero.
  const stored = addonsStore.get()
  const broken = (a: InstalledAddon) =>
    !isPlain(a?.manifest) || typeof a.manifest.name !== 'string' || !a.manifest.name.trim() || !Array.isArray(a.manifest.resources) || !Array.isArray(a.manifest.catalogs) || !Array.isArray(a.manifest.types)
  if (stored.some(broken)) {
    addonsStore.set(
      stored.flatMap((a) => {
        if (!broken(a)) return [a]
        try {
          return [{ ...a, manifest: cleanManifest(a.manifest) }]
        } catch {
          return []
        }
      }),
    )
  }
  // v0.12.2: los subtítulos en el idioma preferido vienen prendidos. A quien ya tenía la app se le prenden una
  // sola vez (casi nadie los había tocado: venían apagados); si después los apaga, queda apagado.
  if (!settingsStore.get().autoSubsMigrated) settingsStore.set((s) => ({ ...s, autoSubtitles: true, autoSubsMigrated: true }))
  // v0.13.0: se sacaron las listas "Mejor puntaje IMDb"; si estaban como filas de Inicio, se borran.
  const rows = settingsStore.get().curatedRows ?? []
  if (rows.some(isRemovedList)) settingsStore.set((s) => ({ ...s, curatedRows: rows.filter((id) => !isRemovedList(id)) }))
  // No bloquea el arranque.
  setTimeout(() => refreshManifests().catch(() => {}), 2000)
  // La caché de Cinemeta del service worker se sacó en la v0.14 (auditoría #6): se libera su lugar.
  setTimeout(() => void dropLegacySwCaches().catch(() => {}), 5000)
}

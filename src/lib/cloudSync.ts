import { useSyncExternalStore } from 'react'
import { clear, createStore, del, get, set } from 'idb-keyval'
import { CINEMETA_ADDON, cleanManifest } from './addons'
import { getAuth, reportUnauthorized, subscribeAuth, type AuthState } from './auth'
import {
  addonsStore,
  diaryStore,
  forgetAddonData,
  goalsStore,
  notInterestedStore,
  profilesStore,
  progressStore,
  ratingsStore,
  settingsStore,
  trackPrefsStore,
  watchlistStore,
  type Settings,
} from './store'
import { applyItems, capture, emptyState, enforceReadOnly, fieldsAdapter, markSent, outgoing, pendingCount, recordAdapter, splitState, type ServerItem, type SyncAdapter, type SyncScope, type SyncState } from './syncCore'
import { cleanProfile, MAIN_PROFILE, PROFILE_STORES, type Profile } from './profileModel'
import { activeProfileId } from './profiles'
import type { DiaryEntry, DiaryState } from './diary'
import type { GoalsState, YearGoal } from './goals'
import type { InstalledAddon } from './types'

// Sincronización con la casa (v0.17): sube y baja los cambios de /api/sync. La mezcla está en syncCore.ts.
//
// - Addons: iguales en todas las casas; solo el admin los cambia (los demás los reciben).
// - Ajustes generales e idioma por título: iguales en toda la casa.
// - La lista de perfiles (v0.18): de la casa.
// - Historial, seguir viendo, mi lista, estrellas, "no me interesa", diario y metas: del perfil activo
//   de este aparato. Lo de la casa y lo del perfil se bajan por separado, cada uno con su cursor.
// Lo físico (modo TV, tamaño de la interfaz, protector, reproductor externo, servidor de Stremio,
// búsquedas recientes) y la key propia de TMDB quedan en cada aparato.

/** Ajustes que comparte toda la casa. */
export const HOUSE_SETTINGS = [
  'subtitleLangs',
  'autoSubtitles',
  'audioLangs',
  'subtitleStyle',
  'hideSdh',
  'autoplayNext',
  'skipSegments',
  'spoilerFree',
  'spoilerUnstarted',
  'sourceRules',
] as const satisfies readonly (keyof Settings)[]

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Los addons van en una sola fila (`list`): el orden importa y se cambia entero. */
const addonsAdapter: SyncAdapter<InstalledAddon[]> = {
  scope: 'global',
  name: 'addons',
  get: addonsStore.get,
  set: (fn) => addonsStore.set(fn),
  subscribe: addonsStore.subscribe,
  toItems: (list) => ({ list }),
  apply: (list, changes) => {
    const raw = changes.list
    if (!Array.isArray(raw)) return list
    const next = raw.flatMap((a): InstalledAddon[] => {
      if (!isPlain(a) || typeof a.transportUrl !== 'string' || !/^https?:\/\//.test(a.transportUrl)) return []
      try {
        return [{ transportUrl: a.transportUrl, manifest: cleanManifest(a.manifest), ...(a.disabled === true ? { disabled: true } : {}) }]
      } catch {
        return []
      }
    })
    return next.length ? next : [CINEMETA_ADDON]
  },
}

const diaryAdapter: SyncAdapter<DiaryState> = {
  scope: 'profile',
  name: 'diary',
  get: diaryStore.get,
  set: (fn) => diaryStore.set(fn),
  subscribe: diaryStore.subscribe,
  toItems: (d) => d.entries,
  apply: (d, changes) => {
    const entries = { ...d.entries }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete entries[k]
      else if (isPlain(v) && typeof v.videoId === 'string' && typeof v.watchedAt === 'number') entries[k] = v as unknown as DiaryEntry
    }
    return { ...d, v: Math.max(d.v, 1), entries }
  },
  time: (v) => (isPlain(v) && typeof v.watchedAt === 'number' ? v.watchedAt : undefined),
}

/** Metas: una fila por año (`y:2026`) y otra con los logros ya vistos (`seen`). */
const goalsAdapter: SyncAdapter<GoalsState> = {
  scope: 'profile',
  name: 'goals',
  get: goalsStore.get,
  set: (fn) => goalsStore.set(fn),
  subscribe: goalsStore.subscribe,
  toItems: (g) => ({ ...Object.fromEntries(Object.entries(g.byYear).map(([y, goal]) => [`y:${y}`, goal])), seen: g.seen }),
  apply: (g, changes) => {
    const byYear = { ...g.byYear }
    let seen = g.seen
    for (const [k, v] of Object.entries(changes)) {
      if (k === 'seen') {
        if (Array.isArray(v)) seen = v.filter((x): x is string => typeof x === 'string')
      } else if (k.startsWith('y:')) {
        const year = k.slice(2)
        if (v === null) delete byYear[year]
        else if (isPlain(v)) byYear[year] = v as unknown as YearGoal
      }
    }
    return { byYear, seen }
  },
}

/** La lista de perfiles: cada uno es una fila. El principal nunca se borra (solo se le cambia el nombre o el color). */
const profilesAdapter: SyncAdapter<Record<string, Profile>> = {
  scope: 'house',
  name: 'profiles',
  get: profilesStore.get,
  set: (fn) => profilesStore.set(fn),
  subscribe: profilesStore.subscribe,
  toItems: (s) => s,
  apply: (s, changes) => {
    const out = { ...s }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) {
        if (k !== MAIN_PROFILE) delete out[k]
        continue
      }
      const p = cleanProfile(k, v)
      if (p) out[k] = p
    }
    return out
  },
  time: (v) => (isPlain(v) && typeof v.at === 'number' ? v.at : undefined),
}

export const ADAPTERS: SyncAdapter[] = [
  addonsAdapter,
  fieldsAdapter('house', 'settings', settingsStore, HOUSE_SETTINGS),
  recordAdapter('house', 'trackPrefs', trackPrefsStore, 'at'),
  profilesAdapter,
  recordAdapter('profile', 'progress', progressStore, 'updatedAt'),
  recordAdapter('profile', 'watchlist', watchlistStore, 'addedAt'),
  recordAdapter('profile', 'ratings', ratingsStore, 'at'),
  recordAdapter('profile', 'notInterested', notInterestedStore, 'at'),
  diaryAdapter,
  goalsAdapter,
] as SyncAdapter[]

/** Lo de todos (addons) y lo de la casa: un estado. Lo del perfil activo: otro. */
const SHARED_ADAPTERS = ADAPTERS.filter((a) => a.scope !== 'profile')
const PROFILE_ADAPTERS = ADAPTERS.filter((a) => a.scope === 'profile')

// ---------- Estado visible (Ajustes → Casa) ----------

export interface SyncStatus {
  phase: 'off' | 'syncing' | 'ok' | 'error'
  lastSync?: number
  pending: number
  error?: string
}

let status: SyncStatus = { phase: 'off', pending: 0 }
const statusListeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  statusListeners.forEach((l) => l())
}

const subscribeStatus = (l: () => void) => {
  statusListeners.add(l)
  return () => {
    statusListeners.delete(l)
  }
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, () => status, () => status)
}

// ---------- Motor ----------

const idb = createStore('series-pelis-sync', 'kv')
/** Lo de la casa (en la v0.17 era todo). */
const STATE_KEY = 'state'
const profileStateKey = (profile: string) => `profile:${profile}`
const API = '/api/sync'
const CAPTURE_DELAY = 1500
const PUSH_DELAY = 20_000
const PUSH_MAX_WAIT = 90_000
const PULL_EVERY = 2 * 60_000
const FOCUS_PULL_GAP = 30_000
/** `keepalive` (al cerrar la pestaña) solo acepta cuerpos chicos. */
const KEEPALIVE_MAX = 60_000

class Unauthorized extends Error {}

async function readState(key: string): Promise<SyncState | undefined> {
  try {
    return await get<SyncState>(key, idb)
  } catch {
    // IndexedDB bloqueado: se empieza de cero (mezclar de nuevo no pierde nada).
    return undefined
  }
}

const validState = (st: SyncState | undefined, house: string): st is SyncState => !!st && st.house === house && isPlain(st.shadow) && isPlain(st.pending)

/**
 * El estado de la casa y el del perfil. Uno de la v0.17 (todo junto) se parte: lo del perfil pasa al del
 * principal, con el mismo cursor, así no se vuelve a bajar ni a subir nada.
 */
async function loadStates(house: string, profile: string): Promise<[SyncState, SyncState]> {
  const shared = await readState(STATE_KEY)
  let prof = await readState(profileStateKey(profile))
  if (validState(shared, house) && !shared.split) {
    const main = splitState(shared, PROFILE_STORES)
    if (profile === MAIN_PROFILE) prof = main
    else await set(profileStateKey(MAIN_PROFILE), main, idb).catch(() => {})
  }
  return [validState(shared, house) ? shared : { ...emptyState(house), split: true }, validState(prof, house) ? prof : emptyState(house)]
}

/** Al salir de la casa se olvida lo sincronizado (los datos de este aparato quedan). */
export async function forgetSyncState() {
  try {
    await clear(idb)
  } catch {
    // Nada que borrar.
  }
}

/** Un perfil borrado: se olvida lo que se sabía de él. */
export async function forgetProfileSync(profile: string) {
  try {
    await del(profileStateKey(profile), idb)
  } catch {
    // Nada que borrar.
  }
}

interface Engine {
  house: string
  isAdmin: boolean
  /** Sube lo pendiente ya (antes de salir de la casa o de cambiar de perfil). */
  flush(): Promise<void>
  stop(): void
}

interface Part {
  /** Dónde se guarda su estado en IndexedDB. */
  key: string
  adapters: SyncAdapter[]
  /** Qué baja (`part`, y el perfil). */
  query: Record<string, string>
  state: SyncState
}

function startEngine(house: string, isAdmin: boolean, profile: string): Engine {
  let stopped = false
  let parts: Part[] | undefined
  let busy: Promise<void> | undefined
  let again = false
  let lastPull = 0
  let firstPending = 0
  let captureTimer: ReturnType<typeof setTimeout> | undefined
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const cleanups: (() => void)[] = []
  const lockCtrl = typeof AbortController === 'function' ? new AbortController() : undefined
  let releaseLock: (() => void) | undefined

  const canPush = (scope: SyncScope) => scope !== 'global' || isAdmin
  const pending = () => (parts ? parts.reduce((n, p) => n + pendingCount(p.state), 0) : 0)
  const saveNow = () => parts?.forEach((p) => void set(p.key, p.state, idb).catch(() => {}))

  async function load() {
    const [shared, prof] = await loadStates(house, profile)
    parts = [
      { key: STATE_KEY, adapters: SHARED_ADAPTERS, query: { part: 'shared' }, state: shared },
      { key: profileStateKey(profile), adapters: PROFILE_ADAPTERS, query: { part: 'profile', profile }, state: prof },
    ]
  }

  const save = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!stopped) saveNow()
    }, 1000)
  }

  const runCapture = () => {
    clearTimeout(captureTimer)
    captureTimer = undefined
    if (!parts || stopped) return
    let changed = 0
    for (const p of parts) changed += capture(p.state, p.adapters, Date.now(), canPush)
    if (changed > 0) {
      save()
      schedulePush()
    }
    setStatus({ pending: pending() })
  }

  const scheduleCapture = () => {
    if (!captureTimer) captureTimer = setTimeout(runCapture, CAPTURE_DELAY)
  }

  function schedulePush() {
    if (!parts?.some((p) => p.state.synced && pendingCount(p.state) > 0)) return
    const now = Date.now()
    if (!firstPending) firstPending = now
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void run(false), Math.max(0, Math.min(PUSH_DELAY, firstPending + PUSH_MAX_WAIT - now)))
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } })
    if (res.status === 401) throw new Unauthorized()
    if (!res.ok) throw new Error(`El sitio respondió ${res.status}`)
    return res
  }

  async function pull(part: Part) {
    const s = part.state
    let first = true
    for (;;) {
      const params = new URLSearchParams(part.query)
      if (s.cursor) params.set('since', s.cursor)
      if (first && s.cursor) params.set('overlap', '1')
      first = false
      const res = await request(`${API}?${params}`)
      const body = (await res.json()) as { items: ServerItem[]; next: string; more: boolean }
      if (stopped) return
      // Lo que se cambió acá mientras tanto queda pendiente antes de aplicar lo del servidor.
      capture(s, part.adapters, Date.now(), canPush)
      applyItems(s, part.adapters, body.items)
      s.cursor = body.next
      save()
      if (!body.more) break
    }
    enforceReadOnly(s, part.adapters, canPush)
    if (!s.synced) {
      s.synced = true
      save()
    }
  }

  async function push(keepalive = false) {
    for (const part of parts ?? []) {
      const s = part.state
      if (!s.synced) continue
      for (const batch of outgoing(s, part.adapters)) {
        const body = JSON.stringify({ items: batch.map(({ ref: _ref, ...o }) => o) })
        await request(`${API}?${new URLSearchParams({ profile })}`, { method: 'POST', body, keepalive: keepalive && body.length < KEEPALIVE_MAX })
        markSent(s, batch)
        save()
        if (stopped) return
      }
    }
    firstPending = 0
  }

  /** Una vuelta: anotar cambios, bajar (si toca) y subir. Nunca dos a la vez. */
  async function run(withPull: boolean): Promise<void> {
    if (stopped) return
    if (busy) {
      again = true
      return busy
    }
    busy = (async () => {
      setStatus({ phase: 'syncing' })
      try {
        if (!parts) await load()
        runCapture()
        const ps = parts!
        if (withPull || ps.some((p) => !p.state.synced)) {
          for (const p of ps) await pull(p)
          lastPull = Date.now()
        }
        await push()
        setStatus({ phase: 'ok', lastSync: Date.now(), error: undefined, pending: pending() })
      } catch (err) {
        if (err instanceof Unauthorized) reportUnauthorized()
        setStatus({ phase: 'error', error: err instanceof Unauthorized ? 'La sesión se cerró' : 'No se pudo sincronizar. Se reintenta solo.', pending: pending() })
      } finally {
        busy = undefined
      }
      if (again && !stopped) {
        again = false
        await run(false)
      }
    })()
    return busy
  }

  /** Al irse (pestaña oculta o cerrada): se sube lo pendiente sin esperar. */
  const flush = () => {
    if (!parts || stopped) return
    runCapture()
    if (parts.some((p) => p.state.synced && pendingCount(p.state) > 0) && !busy) void push(true).catch(() => {})
  }

  const begin = () => {
    if (stopped) return
    for (const a of ADAPTERS) cleanups.push(a.subscribe(scheduleCapture))
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
      else if (Date.now() - lastPull > FOCUS_PULL_GAP) void run(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    const onOnline = () => void run(true)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run(true)
    }, PULL_EVERY)
    cleanups.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('pagehide', flush),
      () => window.removeEventListener('online', onOnline),
      () => clearInterval(timer),
    )
    void run(true)
  }

  // Con varias pestañas abiertas sincroniza una sola (las demás ven los cambios por IndexedDB).
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (locks?.request && lockCtrl) {
    locks
      .request('sp-cloud-sync', { signal: lockCtrl.signal }, () => {
        begin()
        return new Promise<void>((resolve) => (releaseLock = resolve))
      })
      .catch(() => {})
  } else begin()

  return {
    house,
    isAdmin,
    flush: () => (stopped || !parts ? Promise.resolve() : run(false)),
    stop() {
      if (stopped) return
      flush()
      stopped = true
      cleanups.forEach((c) => c())
      clearTimeout(captureTimer)
      clearTimeout(pushTimer)
      clearTimeout(saveTimer)
      saveNow()
      lockCtrl?.abort()
      releaseLock?.()
      setStatus({ phase: 'off', pending: 0 })
    },
  }
}

let engine: Engine | undefined

/**
 * Un aparato que no es del admin y sale de la casa (o lo sacan desde otro) se queda sin los addons: sus URLs
 * llevan la key del debrid. Solo al pasar de "adentro" a "afuera": lo que había antes de entrar por primera
 * vez (por ejemplo, en la PC del admin) no se toca.
 */
export function shouldForgetAddons(prev: AuthState | undefined, next: AuthState): boolean {
  return prev?.status === 'in' && !prev.house.isAdmin && next.status === 'out'
}

let lastIn: AuthState | undefined

function onAuth(s: AuthState) {
  if (halted) return
  if (s.status === 'in') {
    lastIn = s
    if (engine && engine.house === s.house.id && engine.isAdmin === s.house.isAdmin) return
    engine?.stop()
    engine = startEngine(s.house.id, s.house.isAdmin, activeProfileId())
    return
  }
  if (s.status === 'loading') return
  // Primero se frena el motor: así el borrado no se anota como un cambio para subir.
  engine?.stop()
  engine = undefined
  const forget = shouldForgetAddons(lastIn, s)
  lastIn = undefined
  if (s.status === 'out') void forgetSyncState()
  if (forget) void forgetAddonData()
}

/** Sube lo pendiente antes de salir (con un tope: sin conexión no frena el "Salir"). */
export async function flushCloudSync(timeoutMs = 5000) {
  if (!engine) return
  await Promise.race([engine.flush().catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))])
}

/** Frena la sincronización hasta recargar (al cambiar de perfil: así no se guarda nada a medias). */
export function stopCloudSync() {
  engine?.stop()
  engine = undefined
  halted = true
}

let halted = false

/** Arranca la sincronización cuando hay sesión y la frena al salir. Se llama una vez al abrir la app. */
export function initCloudSync() {
  onAuth(getAuth())
  subscribeAuth(() => onAuth(getAuth()))
}

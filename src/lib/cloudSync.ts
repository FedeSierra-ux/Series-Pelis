import { useSyncExternalStore } from 'react'
import { createStore, del, get, set } from 'idb-keyval'
import { CINEMETA_ADDON, cleanManifest } from './addons'
import { getAuth, reportUnauthorized, subscribeAuth, type AuthState } from './auth'
import {
  addonsStore,
  diaryStore,
  goalsStore,
  notInterestedStore,
  progressStore,
  ratingsStore,
  settingsStore,
  trackPrefsStore,
  watchlistStore,
  type Settings,
} from './store'
import { applyItems, capture, emptyState, enforceReadOnly, fieldsAdapter, markSent, outgoing, pendingCount, recordAdapter, type ServerItem, type SyncAdapter, type SyncScope, type SyncState } from './syncCore'
import type { DiaryEntry, DiaryState } from './diary'
import type { GoalsState, YearGoal } from './goals'
import type { InstalledAddon } from './types'

// Sincronización con la casa (v0.17): sube y baja los cambios de /api/sync. La mezcla está en syncCore.ts.
//
// - Addons: iguales en todas las casas; solo el admin los cambia (los demás los reciben).
// - Ajustes generales e idioma por título: iguales en toda la casa.
// - Historial, seguir viendo, mi lista, estrellas, "no me interesa", diario y metas: del perfil
//   (en la v0.17, uno por casa).
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

export const ADAPTERS: SyncAdapter[] = [
  addonsAdapter,
  fieldsAdapter('house', 'settings', settingsStore, HOUSE_SETTINGS),
  recordAdapter('house', 'trackPrefs', trackPrefsStore, 'at'),
  recordAdapter('profile', 'progress', progressStore, 'updatedAt'),
  recordAdapter('profile', 'watchlist', watchlistStore, 'addedAt'),
  recordAdapter('profile', 'ratings', ratingsStore, 'at'),
  recordAdapter('profile', 'notInterested', notInterestedStore, 'at'),
  diaryAdapter,
  goalsAdapter,
] as SyncAdapter[]

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
const STATE_KEY = 'state'
const API = '/api/sync'
const CAPTURE_DELAY = 1500
const PUSH_DELAY = 20_000
const PUSH_MAX_WAIT = 90_000
const PULL_EVERY = 2 * 60_000
const FOCUS_PULL_GAP = 30_000
/** `keepalive` (al cerrar la pestaña) solo acepta cuerpos chicos. */
const KEEPALIVE_MAX = 60_000

class Unauthorized extends Error {}

async function loadState(house: string): Promise<SyncState> {
  try {
    const stored = await get<SyncState>(STATE_KEY, idb)
    if (stored && stored.house === house && isPlain(stored.shadow) && isPlain(stored.pending)) return stored
  } catch {
    // IndexedDB bloqueado: se empieza de cero (mezclar de nuevo no pierde nada).
  }
  return emptyState(house)
}

/** Al salir de la casa se olvida lo sincronizado (los datos de este aparato quedan). */
export async function forgetSyncState() {
  try {
    await del(STATE_KEY, idb)
  } catch {
    // Nada que borrar.
  }
}

interface Engine {
  house: string
  isAdmin: boolean
  /** Sube lo pendiente ya (antes de salir de la casa). */
  flush(): Promise<void>
  stop(): void
}

function startEngine(house: string, isAdmin: boolean): Engine {
  let stopped = false
  let state: SyncState | undefined
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

  const save = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (state && !stopped) set(STATE_KEY, state, idb).catch(() => {})
    }, 1000)
  }

  const runCapture = () => {
    clearTimeout(captureTimer)
    captureTimer = undefined
    if (!state || stopped) return
    if (capture(state, ADAPTERS, Date.now(), canPush) > 0) {
      save()
      schedulePush()
    }
    setStatus({ pending: pendingCount(state) })
  }

  const scheduleCapture = () => {
    if (!captureTimer) captureTimer = setTimeout(runCapture, CAPTURE_DELAY)
  }

  function schedulePush() {
    if (!state?.synced || pendingCount(state) === 0) return
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

  async function pull() {
    const s = state!
    let first = true
    for (;;) {
      const params = new URLSearchParams()
      if (s.cursor) params.set('since', s.cursor)
      if (first && s.cursor) params.set('overlap', '1')
      first = false
      const res = await request(`${API}?${params}`)
      const body = (await res.json()) as { items: ServerItem[]; next: string; more: boolean }
      if (stopped) return
      // Lo que se cambió acá mientras tanto queda pendiente antes de aplicar lo del servidor.
      capture(s, ADAPTERS, Date.now(), canPush)
      applyItems(s, ADAPTERS, body.items)
      s.cursor = body.next
      save()
      if (!body.more) break
    }
    enforceReadOnly(s, ADAPTERS, canPush)
    if (!s.synced) {
      s.synced = true
      save()
    }
    lastPull = Date.now()
  }

  async function push(keepalive = false) {
    const s = state!
    if (!s.synced) return
    for (const batch of outgoing(s, ADAPTERS)) {
      const body = JSON.stringify({ items: batch.map(({ ref: _ref, ...o }) => o) })
      await request(API, { method: 'POST', body, keepalive: keepalive && body.length < KEEPALIVE_MAX })
      markSent(s, batch)
      save()
      if (stopped) return
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
        if (!state) state = await loadState(house)
        runCapture()
        if (withPull || !state.synced) await pull()
        await push()
        setStatus({ phase: 'ok', lastSync: Date.now(), error: undefined, pending: pendingCount(state) })
      } catch (err) {
        if (err instanceof Unauthorized) reportUnauthorized()
        setStatus({ phase: 'error', error: err instanceof Unauthorized ? 'La sesión se cerró' : 'No se pudo sincronizar. Se reintenta solo.', pending: state ? pendingCount(state) : 0 })
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
    if (!state || stopped) return
    runCapture()
    if (state.synced && pendingCount(state) > 0 && !busy) void push(true).catch(() => {})
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
    flush: () => (stopped || !state ? Promise.resolve() : run(false)),
    stop() {
      if (stopped) return
      flush()
      stopped = true
      cleanups.forEach((c) => c())
      clearTimeout(captureTimer)
      clearTimeout(pushTimer)
      clearTimeout(saveTimer)
      if (state) void set(STATE_KEY, state, idb).catch(() => {})
      lockCtrl?.abort()
      releaseLock?.()
      setStatus({ phase: 'off', pending: 0 })
    },
  }
}

let engine: Engine | undefined

function onAuth(s: AuthState) {
  if (s.status === 'in') {
    if (engine && engine.house === s.house.id && engine.isAdmin === s.house.isAdmin) return
    engine?.stop()
    engine = startEngine(s.house.id, s.house.isAdmin)
    return
  }
  if (s.status === 'loading') return
  engine?.stop()
  engine = undefined
  if (s.status === 'out') void forgetSyncState()
}

/** Sube lo pendiente antes de salir (con un tope: sin conexión no frena el "Salir"). */
export async function flushCloudSync(timeoutMs = 5000) {
  if (!engine) return
  await Promise.race([engine.flush().catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))])
}

/** Arranca la sincronización cuando hay sesión y la frena al salir. Se llama una vez al abrir la app. */
export function initCloudSync() {
  onAuth(getAuth())
  subscribeAuth(() => onAuth(getAuth()))
}

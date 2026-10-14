import { createStore, get, set, del, delMany, clear, keys } from 'idb-keyval'
import { timeoutSignal } from './abort'

// Caché "stale-while-revalidate" en dos niveles: memoria (instantáneo) e IndexedDB
// (sobrevive a recargas). Así la app pinta enseguida con lo último que vio y
// refresca en segundo plano, que es lo que la hace sentir rápida.
//
// Las dos tienen tope (auditoría #5): la ficha de una serie larga pesa cientos de kB (Los Simpson,
// 642 kB) y al recorrer una fila en la TV se precargan muchas. Sin tope, la memoria de un Fire TV se
// llenaba y la base crecía hasta la cuota del navegador, que comparte con el progreso y los ajustes.

interface Entry<T> {
  data: T
  at: number
  /** Tamaño aproximado en caracteres de JSON (para el tope por peso). */
  size?: number
}

const idb = createStore('series-pelis-cache', 'responses')

// ---------- Memoria: LRU por cantidad y por peso ----------

export const MEMORY_MAX_ENTRIES = 250
/** ~15 M de caracteres de JSON: unas decenas de MB de heap como mucho. */
export const MEMORY_MAX_CHARS = 15_000_000
/** Para lo que no sabemos cuánto pesa (entradas viejas, guardadas antes del tope). */
const UNKNOWN_SIZE = 20_000

const memory = new Map<string, Entry<unknown>>()
let memoryChars = 0

/** Peso aproximado de un dato: el largo de su JSON (se calcula una vez, al bajarlo). */
export function approxSize(data: unknown): number {
  try {
    return JSON.stringify(data)?.length ?? 0
  } catch {
    return UNKNOWN_SIZE
  }
}

const sizeOf = (e: Entry<unknown>) => e.size ?? UNKNOWN_SIZE

function remember(key: string, entry: Entry<unknown>) {
  const old = memory.get(key)
  if (old) {
    memoryChars -= sizeOf(old)
    memory.delete(key)
  }
  // Un dato más grande que todo el tope no se guarda en memoria (igual queda en IndexedDB).
  if (sizeOf(entry) > MEMORY_MAX_CHARS) return
  memory.set(key, entry)
  memoryChars += sizeOf(entry)
  // El Map recuerda el orden de inserción: el primero es el que hace más que no se usa.
  for (const [k, e] of memory) {
    if (memory.size <= MEMORY_MAX_ENTRIES && memoryChars <= MEMORY_MAX_CHARS) break
    memory.delete(k)
    memoryChars -= sizeOf(e)
  }
}

/** Lee de memoria y lo marca como usado recién (va al final de la cola del LRU). */
function recall<T>(key: string): Entry<T> | undefined {
  const hit = memory.get(key)
  if (!hit) return undefined
  memory.delete(key)
  memory.set(key, hit)
  return hit as Entry<T>
}

function forget(key: string) {
  const old = memory.get(key)
  if (!old) return
  memoryChars -= sizeOf(old)
  memory.delete(key)
}

/** Para los tests: cuántas entradas y cuánto peso hay en memoria. */
export const memoryStats = () => ({ entries: memory.size, chars: memoryChars })

// ---------- IndexedDB: índice con fecha y peso, y desalojo ----------

export const IDB_MAX_ENTRIES = 600
/** ~40 M de caracteres de JSON en disco. */
export const IDB_MAX_CHARS = 40_000_000
export const IDB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const INDEX_KEY = '__index__'
const INDEX_SAVE_MS = 3000

type IndexEntry = { at: number; size: number }

/** Sin IndexedDB (modo privado viejo, Node) idb-keyval puede tirar el error sin promesa: se ignora igual. */
async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {
    // Es solo caché.
  }
}
let index: Map<string, IndexEntry> | undefined
let indexLoading: Promise<Map<string, IndexEntry>> | undefined
let indexTimer: ReturnType<typeof setTimeout> | undefined

function loadIndex(): Promise<Map<string, IndexEntry>> {
  if (index) return Promise.resolve(index)
  indexLoading ??= (async () => {
    const map = new Map<string, IndexEntry>()
    try {
      const stored = await get<Record<string, IndexEntry>>(INDEX_KEY, idb)
      if (stored && typeof stored === 'object') {
        for (const [k, v] of Object.entries(stored)) if (v && typeof v.at === 'number') map.set(k, { at: v.at, size: v.size || UNKNOWN_SIZE })
      } else {
        // Base de antes del índice: lo que haya cuenta como viejo (es lo primero que se desaloja).
        for (const k of await keys(idb)) if (k !== INDEX_KEY) map.set(String(k), { at: 0, size: UNKNOWN_SIZE })
      }
    } catch {
      // Sin IndexedDB (modo privado, tests): el índice queda vacío y no se desaloja nada.
    }
    index = map
    return map
  })()
  return indexLoading
}

function saveIndexSoon() {
  clearTimeout(indexTimer)
  indexTimer = setTimeout(() => {
    if (!index) return
    quiet(() => set(INDEX_KEY, Object.fromEntries(index!), idb))
  }, INDEX_SAVE_MS)
}

/**
 * Qué claves sacar para quedar dentro de los topes: las vencidas (más de 30 días) y, si sigue
 * pasado de cantidad o de peso, las más viejas. `factor` < 1 deja lugar de sobra (cuota llena).
 */
export function evictionPlan(entries: Map<string, IndexEntry>, now = Date.now(), factor = 1): string[] {
  const maxEntries = Math.floor(IDB_MAX_ENTRIES * factor)
  const maxChars = Math.floor(IDB_MAX_CHARS * factor)
  const sorted = [...entries].sort((a, b) => a[1].at - b[1].at)
  let count = sorted.length
  let chars = sorted.reduce((n, [, e]) => n + e.size, 0)
  const out: string[] = []
  for (const [k, e] of sorted) {
    const expired = now - e.at > IDB_MAX_AGE_MS
    if (!expired && count <= maxEntries && chars <= maxChars) break
    out.push(k)
    count--
    chars -= e.size
  }
  return out
}

async function prune(factor = 1) {
  const idx = await loadIndex()
  const doomed = evictionPlan(idx, Date.now(), factor)
  if (doomed.length === 0) return
  doomed.forEach((k) => idx.delete(k))
  saveIndexSoon()
  await quiet(() => delMany(doomed, idb))
}

export const isQuotaError = (err: unknown) =>
  !!err && typeof err === 'object' && /quota/i.test(`${(err as { name?: string }).name} ${(err as { message?: string }).message}`)

async function persistEntry(key: string, entry: Entry<unknown>) {
  try {
    await set(key, entry, idb)
  } catch (err) {
    if (!isQuotaError(err)) return
    // Cuota llena: se libera la mitad de la caché y se prueba una vez más. Si tampoco entra, no
    // importa: es solo caché (lo importante, el progreso, va en otra base; ver store.ts).
    try {
      await prune(0.5)
      await set(key, entry, idb)
    } catch {
      return
    }
  }
  try {
    const idx = await loadIndex()
    idx.set(key, { at: entry.at, size: sizeOf(entry) })
    saveIndexSoon()
    if (idx.size > IDB_MAX_ENTRIES || [...idx.values()].some((e) => entry.at - e.at > IDB_MAX_AGE_MS)) await prune()
    else {
      let chars = 0
      for (const e of idx.values()) chars += e.size
      if (chars > IDB_MAX_CHARS) await prune()
    }
  } catch {
    // El índice es una ayuda: si falla, la caché sigue andando.
  }
}

// ---------- Pedidos ----------

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} en ${url}`)
  }
}

/**
 * GET de un JSON con tiempo máximo (también para leer la respuesta) y una señal opcional para
 * cortarlo antes. Anda en navegadores sin `AbortSignal.timeout` (ver lib/abort.ts).
 */
export async function fetchJson<T>(url: string, timeoutMs = 15000, signal?: AbortSignal): Promise<T> {
  const t = timeoutSignal(timeoutMs, signal)
  try {
    const res = await fetch(url, { signal: t.signal })
    if (!res.ok) throw new HttpError(res.status, url)
    return (await res.json()) as T
  } finally {
    t.clear()
  }
}

/** Lo que haya en caché para `key`, sin importar la antigüedad. */
export function peekMemory<T>(key: string): Entry<T> | undefined {
  return recall<T>(key)
}

export async function peek<T>(key: string, persist = true): Promise<Entry<T> | undefined> {
  const hit = recall<T>(key)
  if (hit || !persist) return hit
  try {
    const stored = await get<Entry<T>>(key, idb)
    if (stored) remember(key, stored)
    return stored
  } catch {
    return undefined
  }
}

interface Pending {
  promise: Promise<unknown>
  ctrl: AbortController
  /** Interesados que pueden irse (pasaron una señal). Si alguno no pasó señal, nunca se corta. */
  users: number
  keep: boolean
}

const inflight = new Map<string, Pending>()

function abortError(): Error {
  try {
    return new DOMException('Pedido cancelado', 'AbortError')
  } catch {
    const err = new Error('Pedido cancelado')
    err.name = 'AbortError'
    return err
  }
}

/**
 * Ejecuta `loader` una sola vez aunque lo pidan varios componentes a la vez. Con `signal`, el pedido
 * se corta de verdad cuando todos los que lo esperaban se fueron (auditoría #15: antes seguía hasta
 * 20 s consultando al debrid de todas las casas aunque ya nadie mirara).
 */
export function load<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  persist = true,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError())
  let pending = inflight.get(key)
  if (!pending) {
    const ctrl = new AbortController()
    const entry: Pending = { promise: Promise.resolve(), ctrl, users: 0, keep: false }
    entry.promise = loader(ctrl.signal)
      .then((data) => {
        const stored: Entry<T> = { data, at: Date.now(), size: approxSize(data) }
        remember(key, stored)
        if (persist) void persistEntry(key, stored)
        return data
      })
      .finally(() => {
        if (inflight.get(key) === entry) inflight.delete(key)
      })
    // Si todos se fueron, el rechazo por corte no tiene a nadie esperando: que no salga como "sin manejar".
    entry.promise.catch(() => {})
    inflight.set(key, entry)
    pending = entry
  }
  const p = pending
  if (!signal) {
    p.keep = true
    return p.promise as Promise<T>
  }
  p.users++
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      p.users--
      reject(abortError())
      if (!p.keep && p.users <= 0) {
        // Ya nadie lo espera: se corta y se olvida (el próximo que lo pida arranca de cero).
        if (inflight.get(key) === p) inflight.delete(key)
        p.ctrl.abort()
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    ;(p.promise as Promise<T>).then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/** Devuelve el dato si está fresco; si está viejo o no está, lo vuelve a pedir. */
export async function cached<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  ttlMs: number,
  persist = true,
  signal?: AbortSignal,
): Promise<T> {
  const hit = await peek<T>(key, persist)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  try {
    return await load(key, loader, persist, signal)
  } catch (err) {
    // Sin red: mejor mostrar lo viejo que nada (salvo que el pedido se haya cancelado a propósito).
    if (hit && !signal?.aborted) return hit.data
    throw err
  }
}

export function isFresh(entry: Entry<unknown> | undefined, ttlMs: number): boolean {
  return !!entry && Date.now() - entry.at < ttlMs
}

export async function invalidate(key: string) {
  forget(key)
  if (index?.delete(key)) saveIndexSoon()
  await quiet(() => del(key, idb))
}

export async function clearCache() {
  memory.clear()
  memoryChars = 0
  clearTimeout(indexTimer)
  index = new Map()
  indexLoading = Promise.resolve(index)
  await quiet(() => clear(idb))
}

/** Cachés del service worker que ya no se usan (la de Cinemeta, hasta la v0.13): se borran para liberar espacio. */
export const LEGACY_SW_CACHES = ['cinemeta']

export async function dropLegacySwCaches() {
  if (typeof caches === 'undefined') return
  await Promise.all(LEGACY_SW_CACHES.map((name) => caches.delete(name).catch(() => false)))
}

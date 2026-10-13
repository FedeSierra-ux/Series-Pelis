import { createStore, get, set, del, clear } from 'idb-keyval'

// Caché "stale-while-revalidate" en dos niveles: memoria (instantáneo) e IndexedDB
// (sobrevive a recargas). Así la app pinta enseguida con lo último que vio y
// refresca en segundo plano, que es lo que la hace sentir rápida.

interface Entry<T> {
  data: T
  at: number
}

const idb = createStore('series-pelis-cache', 'responses')
const memory = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} en ${url}`)
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new HttpError(res.status, url)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Lo que haya en caché para `key`, sin importar la antigüedad. */
export function peekMemory<T>(key: string): Entry<T> | undefined {
  return memory.get(key) as Entry<T> | undefined
}

export async function peek<T>(key: string, persist = true): Promise<Entry<T> | undefined> {
  const hit = memory.get(key) as Entry<T> | undefined
  if (hit || !persist) return hit
  try {
    const stored = await get<Entry<T>>(key, idb)
    if (stored) memory.set(key, stored)
    return stored
  } catch {
    return undefined
  }
}

/** Ejecuta `loader` una sola vez aunque lo pidan varios componentes a la vez. */
export function load<T>(key: string, loader: () => Promise<T>, persist = true): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending
  const p = loader()
    .then((data) => {
      const entry = { data, at: Date.now() }
      memory.set(key, entry)
      if (persist) set(key, entry, idb).catch(() => {})
      return data
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Devuelve el dato si está fresco; si está viejo o no está, lo vuelve a pedir. */
export async function cached<T>(key: string, loader: () => Promise<T>, ttlMs: number, persist = true): Promise<T> {
  const hit = await peek<T>(key, persist)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  try {
    return await load(key, loader, persist)
  } catch (err) {
    // Sin red: mejor mostrar lo viejo que nada.
    if (hit) return hit.data
    throw err
  }
}

export function isFresh(entry: Entry<unknown> | undefined, ttlMs: number): boolean {
  return !!entry && Date.now() - entry.at < ttlMs
}

export async function invalidate(key: string) {
  memory.delete(key)
  await del(key, idb).catch(() => {})
}

export async function clearCache() {
  memory.clear()
  await clear(idb).catch(() => {})
}

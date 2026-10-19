import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { HttpError } from './cache'
import { baseImdbId, isFresh, peekTitleEntry, subscribeAnyTitle, subscribeTitle, titlesVersion } from './localTitlesStore'
import { fetchFind, hasTmdb, useTmdbKey } from './tmdb'

// v0.28: nombre en español al mostrar (el guardado sigue siendo el original). Se pide solo lo que se ve: las
// tarjetas avisan al acercarse a la pantalla (`useNearOnce`) y una cola de 4 pedidos a la vez va llenando el mapa.
// El sitio limita los pedidos a TMDB por IP (300 por minuto, compartido por toda la casa): con un 429 la cola
// espera un rato. Sin TMDB no se pide nada y queda el nombre de Cinemeta.

export { localTitle, loadLocalTitles } from './localTitlesStore'

/** Pedidos a la vez como mucho. */
export const QUEUE_CONCURRENCY = 4
/** Pausa de la cola después de un 429. */
export const RATE_LIMIT_PAUSE_MS = 30_000

const queue: { tt: string; type?: string }[] = []
const queued = new Set<string>()
/** Los que fallaron en esta sesión (no se reintentan hasta recargar). */
const failed = new Set<string>()
let active = 0
let pausedUntil = 0
let resumeTimer: ReturnType<typeof setTimeout> | undefined

function pump() {
  const wait = pausedUntil - Date.now()
  if (wait > 0) {
    resumeTimer ??= setTimeout(() => {
      resumeTimer = undefined
      pump()
    }, wait)
    return
  }
  while (active < QUEUE_CONCURRENCY && queue.length) {
    const job = queue.shift()!
    active++
    fetchFind(job.tt, job.type)
      .catch((err) => {
        if (err instanceof HttpError && err.status === 429) {
          pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS
          // Vuelve a la cola: no fue culpa del título.
          queue.push(job)
          return
        }
        failed.add(job.tt)
      })
      .finally(() => {
        active--
        if (!queue.some((j) => j.tt === job.tt)) queued.delete(job.tt)
        pump()
      })
  }
}

/** Pide el nombre en español de un título si no se sabe (o venció). Ids que no son de IMDb: nada. */
export function requestTitle(id: string | undefined, type?: string): void {
  const tt = baseImdbId(id)
  if (!tt || !hasTmdb() || queued.has(tt) || failed.has(tt) || isFresh(peekTitleEntry(tt))) return
  queued.add(tt)
  queue.push({ tt, type })
  pump()
}

export function requestTitles(items: { id?: string; metaId?: string; type?: string }[]): void {
  for (const it of items) requestTitle(it.metaId ?? it.id, it.type)
}

/**
 * Nombre para mostrar: el español si se sabe, si no `fallback`. Con `enabled` (de fábrica sí) lo pide si falta;
 * las tarjetas lo prenden recién cerca de la pantalla. Solo redibuja cuando cambia el nombre de este título.
 */
export function useLocalTitle(id: string | undefined, fallback: string, opts: { type?: string; enabled?: boolean } = {}): string {
  const key = useTmdbKey()
  const enabled = opts.enabled ?? true
  const subscribe = useCallback((cb: () => void) => (id ? subscribeTitle(id, cb) : () => {}), [id])
  const name = useSyncExternalStore(subscribe, () => (id ? peekTitleEntry(id)?.n : undefined))
  useEffect(() => {
    if (enabled && key && id) requestTitle(id, opts.type)
  }, [enabled, key, id, opts.type])
  return name || fallback
}

/** Nombre original que trajo TMDB (para "Título original"), si se sabe. */
export function useOriginalTitle(id: string | undefined): string | undefined {
  const subscribe = useCallback((cb: () => void) => (id ? subscribeTitle(id, cb) : () => {}), [id])
  return useSyncExternalStore(subscribe, () => (id ? peekTitleEntry(id)?.o : undefined))
}

/** Para listas que ordenan, filtran o arman texto con muchos nombres: cambia cuando llega cualquiera. */
export function useTitlesVersion(): number {
  return useSyncExternalStore(subscribeAnyTitle, titlesVersion)
}

/** Para los tests. */
export function resetTitleQueue(): void {
  queue.length = 0
  queued.clear()
  failed.clear()
  active = 0
  pausedUntil = 0
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = undefined
}

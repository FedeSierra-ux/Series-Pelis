import { useEffect, useState } from 'react'
import { getCatalog, getMeta, metaKey, resourceUrl } from './addons'
import { cached, peekMemory } from './cache'
import { addonsStore, useStore } from './store'
import { getDetailsByImdb, useTmdbKey, type TmdbDetails } from './tmdb'
import type { CatalogDef, InstalledAddon, Meta, MetaPreview } from './types'
import { errorText } from './errors'

export interface AsyncState<T> {
  data?: T
  error?: string
  loading: boolean
}

function useAsync<T>(cacheKey: string | undefined, run: (() => Promise<T>) | undefined, deps: unknown[]): AsyncState<T> {
  // Si ya está en memoria arrancamos con el dato: cero parpadeo al volver atrás.
  const initial = cacheKey ? peekMemory<T>(cacheKey)?.data : undefined
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: !initial && !!run })

  useEffect(() => {
    if (!run) {
      // Sin nada que pedir no quedan datos viejos (ej. la ficha anterior) ni un "cargando" eterno.
      setState((s) => (s.data === undefined && !s.loading && !s.error ? s : { loading: false }))
      return
    }
    let alive = true
    const mem = cacheKey ? peekMemory<T>(cacheKey)?.data : undefined
    setState({ data: mem, loading: !mem })
    run()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((err: unknown) => alive && setState((s) => ({ ...s, loading: false, error: errorText(err) })))
    return () => {
      alive = false
    }
  }, deps)

  return state
}

export function useAddons() {
  return useStore(addonsStore)
}

export function useMeta(type: string | undefined, id: string | undefined): AsyncState<Meta> {
  const addons = useAddons()
  return useAsync(
    type && id ? metaKey(type, id) : undefined,
    type && id ? () => getMeta(addons, type, id) : undefined,
    [type, id, addons],
  )
}

export function useCatalog(
  addon: InstalledAddon | undefined,
  catalog: CatalogDef | undefined,
  extra?: Record<string, string | undefined>,
): AsyncState<MetaPreview[]> {
  const extraKey = JSON.stringify(extra ?? {})
  const key = addon && catalog ? `catalog:${resourceUrl(addon, 'catalog', catalog.type, catalog.id, extra)}` : undefined
  return useAsync(key, addon && catalog ? () => getCatalog(addon, catalog, extra) : undefined, [key, extraKey])
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Series-Pelis` : 'Series-Pelis'
  }, [title])
}

/** Datos de TMDB de un título de IMDb. Sin key de TMDB devuelve `undefined` y no pide nada. */
export function useTmdbDetails(type: string | undefined, imdbId: string | undefined): AsyncState<TmdbDetails | undefined> {
  const key = useTmdbKey()
  const enabled = !!(key && type && imdbId?.startsWith('tt'))
  // Clave solo en memoria: al volver a una ficha ya vista arranca en español, sin pasar por el inglés.
  const cacheKey = enabled ? `tmdb-imdb:${type}:${imdbId}` : undefined
  const state = useAsync(
    cacheKey,
    enabled ? () => cached(cacheKey!, () => getDetailsByImdb(imdbId!, type!), 24 * 60 * 60 * 1000, false) : undefined,
    [type, imdbId, key],
  )
  return enabled ? state : { loading: false }
}

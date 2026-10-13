import { useEffect, useMemo, useState } from 'react'
import { browsableCatalogs, getCatalog, resourceUrl } from './addons'
import { cached, peekMemory } from './cache'
import { arrangeCatalogs, interleaveMetas, normalizePrefs, type CatalogPrefs, type CatalogRowDef, type CatalogSource } from './catalogPrefs'
import { useAddons } from './hooks'
import { catalogLabel } from './i18n'
import { catalogPrefsStore, useStore } from './store'
import type { MetaPreview } from './types'
import { errorText } from './errors'

// Filas de catálogos de Inicio y Descubrir, con las preferencias del gestor aplicadas.

export const defaultCatalogLabel = (s: CatalogSource) => catalogLabel(s.catalog.name, s.catalog.type, s.addon.manifest.name)

/** Todas las filas (también las ocultas) en el orden elegido. Los addons desactivados no aparecen. */
export function useCatalogRows(): CatalogRowDef[] {
  const addons = useAddons()
  const prefs = useStore(catalogPrefsStore)
  return useMemo(() => arrangeCatalogs(browsableCatalogs(addons), prefs, defaultCatalogLabel), [addons, prefs])
}

export function updateCatalogPrefs(fn: (prefs: CatalogPrefs) => CatalogPrefs) {
  catalogPrefsStore.set((p) => fn(normalizePrefs(p)))
}

export type Extra = Record<string, string | undefined>

const mergedKey = (sources: CatalogSource[], extra?: Extra) =>
  `merged:${sources.map((s) => resourceUrl(s.addon, 'catalog', s.catalog.type, s.catalog.id, extra)).join('+')}`

/** Pide los catálogos de una fila fusionada y los intercala. Falla solo si fallan todos. */
export async function getMergedCatalog(sources: CatalogSource[], extra?: Extra | ((s: CatalogSource) => Extra | null)): Promise<MetaPreview[]> {
  const results = await Promise.allSettled(
    sources.map((s) => {
      const e = typeof extra === 'function' ? extra(s) : extra
      return e === null ? Promise.resolve([]) : getCatalog(s.addon, s.catalog, e)
    }),
  )
  const ok = results.filter((r): r is PromiseFulfilledResult<MetaPreview[]> => r.status === 'fulfilled')
  if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason
  return interleaveMetas(results.map((r) => (r.status === 'fulfilled' ? r.value : [])))
}

/** Catálogo intercalado de una fila fusionada (para Inicio). */
export function useMergedCatalog(sources: CatalogSource[] | undefined): { data?: MetaPreview[]; loading: boolean; error?: string } {
  const key = sources ? mergedKey(sources) : undefined
  const [state, setState] = useState<{ data?: MetaPreview[]; loading: boolean; error?: string }>(() => {
    const data = key ? peekMemory<MetaPreview[]>(key)?.data : undefined
    return { data, loading: !data }
  })
  useEffect(() => {
    if (!sources || !key) return
    let alive = true
    const mem = peekMemory<MetaPreview[]>(key)?.data
    setState({ data: mem, loading: !mem })
    // Solo en memoria: cada catálogo ya queda en la caché persistente por su cuenta.
    cached(key, () => getMergedCatalog(sources), 10 * 60 * 1000, false)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((err: unknown) => alive && setState((s) => ({ ...s, loading: false, error: errorText(err) })))
    return () => {
      alive = false
    }
  }, [key])
  return state
}

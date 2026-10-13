import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { ErrorBox } from '../components/Status'
import { getCatalog } from '../lib/addons'
import { interleaveMetas, type CatalogRowDef, type CatalogSource } from '../lib/catalogPrefs'
import { useCatalogRows } from '../lib/catalogRows'
import { useAddons, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel, typeLabel } from '../lib/i18n'
import type { MetaPreview } from '../lib/types'

const genreOptions = (s: CatalogSource) => s.catalog.genres ?? s.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
const hasExtra = (s: CatalogSource, name: string) => !!s.catalog.extra?.some((e) => e.name === name) || !!s.catalog.extraSupported?.includes(name)
/** En una fila fusionada, con un género elegido solo se piden los catálogos que lo tienen. */
const acceptsGenre = (s: CatalogSource, genre: string) =>
  !genre || (hasExtra(s, 'genre') && (genreOptions(s).length === 0 || genreOptions(s).includes(genre)))

export function Discover() {
  const { type = 'movie' } = useParams()
  const [params, setParams] = useSearchParams()
  const addons = useAddons()
  useTitle(typeLabel(type))

  // Filas del gestor de catálogos: mismo orden, nombres y fusiones que en Inicio.
  const allRows = useCatalogRows()
  const typeRows = useMemo(() => allRows.filter((r) => r.type === type), [allRows, type])
  const options = useMemo(() => typeRows.filter((r) => !r.hidden), [typeRows])
  const rowParam = params.get('row')
  const selected: CatalogRowDef | undefined =
    (rowParam ? typeRows.find((r) => r.key === rowParam) : undefined) ??
    typeRows.find((r) => r.sources.some((s) => s.addon.transportUrl === params.get('addon') && s.catalog.id === params.get('catalog'))) ??
    options[0]
  const genre = params.get('genre') ?? ''
  const genres = useMemo(() => [...new Set(selected?.sources.flatMap(genreOptions) ?? [])], [selected])
  const supportsGenre = !!selected?.sources.some((s) => hasExtra(s, 'genre'))

  const [items, setItems] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const loadKey = `${selected?.sources.map((s) => `${s.addon.transportUrl}|${s.catalog.id}`).join('+')}|${type}|${genre}`
  const currentKey = useRef(loadKey)
  // Cuántos trajo cada catálogo de la fila (las fusionadas paginan cada uno por su lado).
  const progress = useRef<{ skip: number; done: boolean }[]>([])

  const loadPage = async (first: boolean) => {
    if (!selected) return
    const key = loadKey
    if (first) progress.current = selected.sources.map((s) => ({ skip: 0, done: !acceptsGenre(s, genre) }))
    const state = progress.current
    setLoading(true)
    setError(undefined)
    try {
      const results = await Promise.allSettled(
        selected.sources.map((s, i) =>
          state[i].done
            ? Promise.resolve(undefined)
            : getCatalog(s.addon, s.catalog, {
                genre: genre && hasExtra(s, 'genre') ? genre : undefined,
                skip: state[i].skip > 0 ? String(state[i].skip) : undefined,
              }),
        ),
      )
      if (currentKey.current !== key) return
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      const pages = results.map((r, i) => {
        if (state[i].done) return []
        const page = r.status === 'fulfilled' ? (r.value ?? []) : []
        state[i] = { skip: state[i].skip + page.length, done: r.status === 'rejected' || page.length === 0 || !hasExtra(selected.sources[i], 'skip') }
        return page
      })
      const page = interleaveMetas(pages)
      if (failed && page.length === 0 && first) throw failed.reason
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...page.filter((m) => !seen.has(m.id))]
      })
      if (state.every((x) => x.done)) setDone(true)
    } catch (err) {
      if (currentKey.current === key) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (currentKey.current === key) setLoading(false)
    }
  }

  useEffect(() => {
    currentKey.current = loadKey
    setItems([])
    setDone(false)
    loadPage(true)
  }, [loadKey])

  useEffect(() => {
    const el = sentinel.current
    if (!el || done || loading || items.length === 0) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadPage(false), {
      rootMargin: '800px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, done, loading, loadKey])

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{typeLabel(type)}</h1>
        <div className="filters">
          {options.length > 1 && (
            <select
              aria-label="Catálogo"
              value={selected?.key ?? ''}
              onChange={(e) => update({ row: e.target.value, addon: undefined, catalog: undefined, genre: undefined })}
            >
              {selected?.hidden && <option value={selected.key}>{selected.name}</option>}
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.renamed
                    ? o.name
                    : o.sources
                        .map((s) => catalogLabel(s.catalog.name, s.catalog.type, s.addon.manifest.name).split(' · ')[0] + (addons.length > 1 ? ` (${s.addon.manifest.name})` : ''))
                        .join(' + ')}
                </option>
              ))}
            </select>
          )}
          {supportsGenre && genres.length > 0 && (
            <select aria-label="Género" value={genre} onChange={(e) => update({ genre: e.target.value || undefined })}>
              <option value="">Todos los géneros</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {genreLabel(g)}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && items.length === 0 && <ErrorBox message={`No se pudo cargar el catálogo: ${error}`} onRetry={() => loadPage(true)} />}

      <div className="grid">
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={{ ...m, type: m.type ?? type }} eager={i < 12} />
        ))}
        {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <PosterSkeleton key={`s${i}`} />)}
      </div>
      {!done && <div ref={sentinel} className="sentinel" />}
      {!selected && <div className="empty">Ningún addon instalado tiene catálogos de {typeLabel(type).toLowerCase()}.</div>}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { ErrorBox } from '../components/Status'
import { offlineMessage } from '../lib/online'
import { browsableCatalogs, getCatalog } from '../lib/addons'
import { useAddons, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel, typeLabel } from '../lib/i18n'
import type { MetaPreview } from '../lib/types'

export function Discover() {
  const { type = 'movie' } = useParams()
  const [params, setParams] = useSearchParams()
  const addons = useAddons()
  useTitle(typeLabel(type))

  const options = useMemo(() => browsableCatalogs(addons).filter((c) => c.catalog.type === type), [addons, type])
  const selected =
    options.find((o) => o.addon.transportUrl === params.get('addon') && o.catalog.id === params.get('catalog')) ?? options[0]
  const genre = params.get('genre') ?? ''
  const genres =
    selected?.catalog.genres ?? selected?.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
  const supportsGenre = !!selected?.catalog.extra?.some((e) => e.name === 'genre') || !!selected?.catalog.extraSupported?.includes('genre')
  const supportsSkip = !!selected?.catalog.extra?.some((e) => e.name === 'skip') || !!selected?.catalog.extraSupported?.includes('skip')

  const [items, setItems] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const loadKey = `${selected?.addon.transportUrl}|${selected?.catalog.id}|${type}|${genre}`
  const currentKey = useRef(loadKey)

  const loadPage = async (skip: number) => {
    if (!selected) return
    const key = loadKey
    setLoading(true)
    setError(undefined)
    try {
      const page = await getCatalog(selected.addon, selected.catalog, {
        genre: genre || undefined,
        skip: skip > 0 ? String(skip) : undefined,
      })
      if (currentKey.current !== key) return
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...page.filter((m) => !seen.has(m.id))]
      })
      if (page.length === 0 || !supportsSkip) setDone(true)
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
    loadPage(0)
  }, [loadKey])

  useEffect(() => {
    const el = sentinel.current
    if (!el || done || loading || items.length === 0) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadPage(items.length), {
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
              value={selected ? `${selected.addon.transportUrl}|${selected.catalog.id}` : ''}
              onChange={(e) => {
                const [addon, catalog] = e.target.value.split('|')
                update({ addon, catalog, genre: undefined })
              }}
            >
              {options.map((o) => (
                <option key={`${o.addon.transportUrl}|${o.catalog.id}`} value={`${o.addon.transportUrl}|${o.catalog.id}`}>
                  {catalogLabel(o.catalog.name, o.catalog.type, o.addon.manifest.name).split(' · ')[0]}
                  {addons.length > 1 ? ` (${o.addon.manifest.name})` : ''}
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

      {error && items.length === 0 && <ErrorBox message={offlineMessage('este catálogo no está guardado') ?? `No se pudo cargar el catálogo: ${error}`} onRetry={() => loadPage(0)} />}

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

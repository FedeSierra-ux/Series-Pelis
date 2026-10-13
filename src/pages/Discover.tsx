import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { ErrorBox } from '../components/Status'
import { browsableCatalogs, getCatalog } from '../lib/addons'
import { getKeywordName, tmdbDiscover } from '../lib/discoverApi'
import {
  applyClientFilters,
  filtersToParams,
  hasClientFilters,
  needsTmdb,
  parseFilters,
  tmdbToCinemetaGenre,
  type DiscoverFilters,
} from '../lib/discoverFilters'
import { useAddons, useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { settingsStore, useStore } from '../lib/store'
import type { MetaPreview } from '../lib/types'
import { FilterBar } from './discover/FilterBar'
import { CuratedStrip } from './lists/CuratedStrip'

/** Con filtros del lado del cliente (catálogos de addons) se mira hasta esta cantidad de páginas. */
const MAX_CLIENT_PAGES = 20

export function Discover() {
  const { type = 'movie' } = useParams()
  const [params, setParams] = useSearchParams()
  const addons = useAddons()
  const tmdbOn = useStore(settingsStore).tmdbKey.trim().length > 0
  const filters = useMemo(() => parseFilters(params), [params])
  const [kwName, setKwName] = useState<string>()

  const options = useMemo(() => browsableCatalogs(addons).filter((c) => c.catalog.type === type), [addons, type])
  // Idioma, país, plataforma o palabra clave: solo TMDB tiene esos datos.
  const useTmdb = tmdbOn && (filters.src === 'tmdb' || needsTmdb(filters) || options.length === 0)
  const selected = useTmdb
    ? undefined
    : (options.find((o) => o.addon.transportUrl === filters.addon && o.catalog.id === filters.catalog) ?? options[0])
  const ignored = !tmdbOn && needsTmdb(filters)
  const effective: DiscoverFilters = useTmdb
    ? filters
    : { ...filters, src: undefined, lang: undefined, country: undefined, provider: undefined, keyword: undefined, kw: undefined }
  const supportsSkip = !!selected?.catalog.extra?.some((e) => e.name === 'skip') || !!selected?.catalog.extraSupported?.includes('skip')
  const catalogGenre = useTmdb ? undefined : tmdbToCinemetaGenre(effective.genre, type)
  const clientFiltering = !useTmdb && hasClientFilters(effective)
  const keywordLabel = filters.kw ?? kwName

  useTitle(keywordLabel && useTmdb ? `${typeLabel(type)} · ${keywordLabel}` : typeLabel(type))

  useEffect(() => {
    if (!useTmdb || !filters.keyword || filters.kw) return
    let alive = true
    getKeywordName(filters.keyword)
      .then((n) => alive && setKwName(n))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [useTmdb, filters.keyword, filters.kw])

  // Lo que cambia el pedido. Año, puntaje y orden de un catálogo de addon se aplican sobre lo cargado.
  const loadKey = useTmdb
    ? `tmdb|${type}|${filtersToParams({ ...effective, src: 'tmdb' }).toString()}`
    : `${selected?.addon.transportUrl}|${selected?.catalog.id}|${type}|${catalogGenre ?? ''}`

  const [raw, setRaw] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const currentKey = useRef(loadKey)
  const pages = useRef(0)
  const fetched = useRef(0)

  const loadPage = async () => {
    if (!useTmdb && !selected) return
    const key = loadKey
    setLoading(true)
    setError(undefined)
    try {
      let page: MetaPreview[]
      let last = false
      if (useTmdb) {
        const res = await tmdbDiscover(type, effective, pages.current + 1)
        page = res.items
        last = pages.current + 1 >= res.totalPages
      } else {
        const skip = fetched.current
        page = await getCatalog(selected!.addon, selected!.catalog, {
          genre: catalogGenre || undefined,
          skip: skip > 0 ? String(skip) : undefined,
        })
        page = page.map((m) => ({ ...m, type: m.type ?? type }))
        last = !supportsSkip || (clientFiltering && pages.current + 1 >= MAX_CLIENT_PAGES)
      }
      if (currentKey.current !== key) return
      pages.current += 1
      fetched.current += page.length
      setRaw((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...page.filter((m) => !seen.has(m.id))]
      })
      if (page.length === 0 || last) setDone(true)
    } catch (err) {
      if (currentKey.current === key) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (currentKey.current === key) setLoading(false)
    }
  }

  useEffect(() => {
    currentKey.current = loadKey
    pages.current = 0
    fetched.current = 0
    setRaw([])
    setDone(false)
    loadPage()
  }, [loadKey])

  // Con filtros del cliente se sigue pidiendo mientras el final de la grilla esté a la vista.
  const clientKey = clientFiltering ? filtersToParams(effective).toString() : ''
  useEffect(() => {
    const el = sentinel.current
    if (!el || done || loading || raw.length === 0 || error) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadPage(), {
      rootMargin: '800px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [raw.length, done, loading, loadKey, error, clientKey])

  const items = useMemo(() => (clientFiltering ? applyClientFilters(raw, effective) : raw), [raw, clientFiltering, clientKey])

  const apply = (next: DiscoverFilters) => setParams(filtersToParams(next), { replace: true })
  const emptyAfterFilters = done && !loading && raw.length > 0 && items.length === 0
  const noneAtAll = done && !loading && raw.length === 0 && !error

  return (
    <div className="page discover">
      <header className="page-header">
        <h1>
          {typeLabel(type)}
          {useTmdb && keywordLabel && <span className="discover-kw"> · “{keywordLabel}”</span>}
        </h1>
      </header>

      <FilterBar
        type={type}
        filters={filters}
        options={options}
        selected={selected}
        useTmdb={useTmdb}
        tmdbOn={tmdbOn}
        keywordLabel={keywordLabel}
        onChange={apply}
      />

      {ignored && (
        <p className="discover-note">
          Idioma, país, plataforma y palabras clave necesitan una key de TMDB (<Link to="/settings">Ajustes</Link>). Se muestran sin esos filtros.
        </p>
      )}
      {clientFiltering && (
        <p className="discover-note muted small">
          Este catálogo no sabe filtrar ni ordenar: se aplica sobre lo que se va cargando (hasta {MAX_CLIENT_PAGES} páginas).
          {tmdbOn ? ' Con “Explorar todo (TMDB)” el filtro es completo.' : ''}
        </p>
      )}

      <CuratedStrip type={type} tmdbOn={tmdbOn} />

      {error && raw.length === 0 && <ErrorBox message={`No se pudo cargar el catálogo: ${error}`} onRetry={() => loadPage()} />}

      <div className="grid">
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={m} eager={i < 12} />
        ))}
        {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <PosterSkeleton key={`s${i}`} />)}
      </div>
      {!done && <div ref={sentinel} className="sentinel" />}
      {(emptyAfterFilters || noneAtAll) && (
        <div className="empty">
          No hay títulos con estos filtros.{' '}
          <button type="button" className="btn btn-small" onClick={() => apply({ src: filters.src, addon: filters.addon, catalog: filters.catalog, sort: 'popularity' })}>
            Limpiar filtros
          </button>
        </div>
      )}
      {!useTmdb && !selected && (
        <div className="empty">Ningún addon instalado tiene catálogos de {typeLabel(type).toLowerCase()}.</div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FocusBillboard } from '../components/FocusBillboard'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { ErrorBox } from '../components/Status'
import { getCatalog } from '../lib/addons'
import { interleaveMetas, type CatalogRowDef, type CatalogSource } from '../lib/catalogPrefs'
import { useCatalogRows } from '../lib/catalogRows'
import { getKeywordName, tmdbDiscover } from '../lib/discoverApi'
import {
  applyClientFilters,
  clearAll,
  filtersToParams,
  hasClientFilters,
  needsTmdb,
  parseFilters,
  tmdbToCinemetaGenre,
  type DiscoverFilters,
} from '../lib/discoverFilters'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { offlineMessage } from '../lib/online'
import { useHiddenIds } from '../lib/ratings'
import { withoutHidden } from '../lib/recommend'
import { useTmdbKey } from '../lib/tmdb'
import type { MetaPreview } from '../lib/types'
import { FilterBar, type CatalogOption } from './discover/FilterBar'
import { BrowsePage } from './discover/BrowsePage'
import { isBrowseKind, wantsGrid } from '../lib/browseRows'
import { CuratedStrip } from './lists/CuratedStrip'
import { errorText } from '../lib/errors'

/** Con filtros del lado del cliente (catálogos de addons) se mira hasta esta cantidad de páginas. */
const MAX_CLIENT_PAGES = 20
/** Tope general de páginas por catálogo: algunos addons dicen paginar y devuelven siempre lo mismo. */
const MAX_PAGES = 40

const hasExtra = (s: CatalogSource, name: string) => !!s.catalog.extra?.some((e) => e.name === name) || !!s.catalog.extraSupported?.includes(name)

const genresOf = (s: CatalogSource) => s.catalog.genres ?? s.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []

/**
 * Fila del gestor de catálogos → opción del selector. En una fila fusionada el "catálogo" de la
 * opción junta los géneros de todas sus fuentes (la barra de filtros los saca de ahí).
 */
function toOption(r: CatalogRowDef): CatalogOption {
  const first = r.sources[0]
  const withGenre = r.sources.filter((x) => hasExtra(x, 'genre'))
  const catalog =
    r.merged && withGenre.length > 0
      ? {
          ...first.catalog,
          genres: [...new Set(withGenre.flatMap(genresOf))],
          extraSupported: [...new Set([...(first.catalog.extraSupported ?? []), 'genre'])],
        }
      : first.catalog
  return { addon: first.addon, catalog, label: r.merged || r.renamed ? r.name : undefined, rowKey: r.merged ? r.key : undefined }
}

/**
 * Películas y Series sin filtros: la página de filas (v0.15, U11). Con filtros, `?all=1` o cualquier
 * otro tipo de catálogo: la grilla con filtros de siempre.
 */
export function Discover() {
  const { type = 'movie' } = useParams()
  const [params] = useSearchParams()
  if (isBrowseKind(type) && !wantsGrid(params)) return <BrowsePage key={type} kind={type} />
  return <DiscoverGrid key={type} />
}

function DiscoverGrid() {
  const { type = 'movie' } = useParams()
  const [params, setParams] = useSearchParams()
  const tmdbKey = useTmdbKey()
  const tmdbOn = tmdbKey.length > 0
  const filters = useMemo(() => parseFilters(params), [params])
  const [kwName, setKwName] = useState<string>()

  // Filas del gestor de catálogos: mismo orden, nombres, ocultas y fusiones que en Inicio.
  const allRows = useCatalogRows()
  const typeRows = useMemo(() => allRows.filter((r) => r.type === type), [allRows, type])
  const options = useMemo(() => typeRows.filter((r) => !r.hidden).map(toOption), [typeRows])
  // Idioma, país, plataforma o palabra clave: solo TMDB tiene esos datos.
  const useTmdb = tmdbOn && (filters.src === 'tmdb' || needsTmdb(filters) || options.length === 0)
  const selectedRow: CatalogRowDef | undefined = useTmdb
    ? undefined
    : ((filters.row ? typeRows.find((r) => r.key === filters.row) : undefined) ??
      typeRows.find((r) => !r.merged && r.sources[0].addon.transportUrl === filters.addon && r.sources[0].catalog.id === filters.catalog) ??
      typeRows.find((r) => !r.hidden))
  const selected = selectedRow && toOption(selectedRow)
  const sources = selectedRow?.sources ?? []
  const ignored = !tmdbOn && needsTmdb(filters)
  const effective: DiscoverFilters = useTmdb
    ? filters
    : { ...filters, src: undefined, lang: undefined, country: undefined, provider: undefined, keyword: undefined, kw: undefined }
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
    : `${sources.map((x) => `${x.addon.transportUrl}|${x.catalog.id}`).join('+')}|${type}|${catalogGenre ?? ''}`

  const [raw, setRaw] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const currentKey = useRef(loadKey)
  const pages = useRef(0)
  // Cuántos trajo cada catálogo de la fila (las fusionadas paginan cada uno por su lado).
  const progress = useRef<{ skip: number; done: boolean }[]>([])
  // Ids ya mostrados: una página que no trae ninguno nuevo termina esa fuente (addons que ignoran `skip`).
  const seenIds = useRef(new Set<string>())

  const loadPage = async () => {
    if (!useTmdb && sources.length === 0) return
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
        // Con un género elegido, en una fila fusionada solo se piden los catálogos que lo tienen.
        if (pages.current === 0) {
          progress.current = sources.map((x) => ({
            skip: 0,
            done: !!catalogGenre && (!hasExtra(x, 'genre') || (genresOf(x).length > 0 && !genresOf(x).includes(catalogGenre))),
          }))
        }
        const state = progress.current
        const results = await Promise.allSettled(
          sources.map((x, i) =>
            state[i].done
              ? Promise.resolve([])
              : getCatalog(x.addon, x.catalog, {
                  genre: catalogGenre || undefined,
                  skip: state[i].skip > 0 ? String(state[i].skip) : undefined,
                }),
          ),
        )
        if (currentKey.current !== key) return
        const lists = results.map((r, i) => {
          if (state[i].done) return []
          const got = r.status === 'fulfilled' ? r.value : []
          // Si la página repite lo que ya vimos, el addon no pagina de verdad: no se le pide más.
          const repeated = got.length > 0 && got.every((m) => seenIds.current.has(m.id))
          state[i] = {
            skip: state[i].skip + got.length,
            done: r.status === 'rejected' || got.length === 0 || repeated || !hasExtra(sources[i], 'skip'),
          }
          return repeated ? [] : got
        })
        const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        page = interleaveMetas(lists).map((m) => ({ ...m, type: m.type ?? type }))
        if (failed && page.length === 0 && pages.current === 0) throw failed.reason
        last = state.every((x) => x.done) || pages.current + 1 >= (clientFiltering ? MAX_CLIENT_PAGES : MAX_PAGES)
      }
      if (currentKey.current !== key) return
      pages.current += 1
      const fresh = page.filter((m) => !seenIds.current.has(m.id))
      fresh.forEach((m) => seenIds.current.add(m.id))
      if (fresh.length > 0) setRaw((prev) => [...prev, ...fresh])
      // Una página sin nada nuevo no cambia la grilla: si no se marca el final, se pediría otra vez sin parar.
      if (page.length === 0 || fresh.length === 0 || last) setDone(true)
    } catch (err) {
      if (currentKey.current === key) setError(errorText(err))
    } finally {
      if (currentKey.current === key) setLoading(false)
    }
  }

  useEffect(() => {
    currentKey.current = loadKey
    pages.current = 0
    seenIds.current = new Set()
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

  // "Ya no me interesa" se respeta acá igual que en Inicio y Buscar.
  const hidden = useHiddenIds()
  const items = useMemo(
    () => withoutHidden(clientFiltering ? applyClientFilters(raw, effective) : raw, hidden),
    [raw, clientFiltering, clientKey, hidden],
  )

  // `all=1` mantiene la grilla aunque se saquen todos los filtros (sin nada, Películas y Series muestran las filas).
  const apply = (next: DiscoverFilters) => {
    const p = filtersToParams(next)
    if (isBrowseKind(type)) p.set('all', '1')
    setParams(p, { replace: true })
  }
  const emptyAfterFilters = done && !loading && raw.length > 0 && items.length === 0
  const noneAtAll = done && !loading && raw.length === 0 && !error

  return (
    <div className="page discover">
      {/* Modo TV: el fondo de arriba sigue al póster enfocado (U30). */}
      <FocusBillboard />
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

      {error && raw.length === 0 && <ErrorBox message={offlineMessage('este catálogo no está guardado') ?? `No se pudo cargar el catálogo: ${error}`} onRetry={() => loadPage()} />}

      <div className="grid">
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={m} eager={i < 12} hideTop10Label />
        ))}
        {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <PosterSkeleton key={`s${i}`} />)}
      </div>
      {!done && <div ref={sentinel} className="sentinel" />}
      {(emptyAfterFilters || noneAtAll) && (
        <div className="empty">
          No hay títulos con estos filtros.{' '}
          <button type="button" className="btn btn-small" onClick={() => apply(clearAll(filters))}>
            Limpiar filtros
          </button>
        </div>
      )}
      {!useTmdb && !selectedRow && (
        <div className="empty">Ningún addon instalado tiene catálogos de {typeLabel(type).toLowerCase()}.</div>
      )}
    </div>
  )
}

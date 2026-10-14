import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Picker, type PickerOption } from '../../components/Picker'
import { getProviders, type ProviderOption } from '../../lib/discoverApi'
import {
  cinemetaToTmdbGenre,
  clearPanel,
  COUNTRIES,
  LANGUAGES,
  panelFilters,
  ratingLabel,
  SORTS,
  TMDB_GENRES,
  tmdbKind,
  tmdbToCinemetaGenre,
  withoutFilter,
  yearsLabel,
  type DiscoverFilters,
  type PanelFilter,
  type SortKey,
} from '../../lib/discoverFilters'
import { catalogLabel, genreLabel } from '../../lib/i18n'
import type { CatalogDef, InstalledAddon } from '../../lib/types'
import { FilterIcon } from './FilterIcons'
import { FilterPanel } from './FilterPanel'
import './filters.css'

// Barra de filtros de Descubrir: pegada arriba al bajar, con lo que más se usa a mano (catálogo,
// géneros como chips y orden) y un botón "Filtros" que abre el panel con todo (en el celular la
// barra deja solo "Filtros" y los géneros; catálogo y orden quedan en el panel). Lo puesto se ve
// abajo como chips removibles.
// Todo cambio va a la URL (Discover lo lee de ahí), así que al volver atrás desde una ficha los
// filtros siguen puestos.

/** Un catálogo para elegir. Las filas fusionadas del gestor traen `rowKey` y su primer catálogo. */
export interface CatalogOption {
  addon: InstalledAddon
  catalog: CatalogDef
  /** Nombre propio (renombrado o fila fusionada). */
  label?: string
  rowKey?: string
}

interface Props {
  type: string
  filters: DiscoverFilters
  options: CatalogOption[]
  selected?: CatalogOption
  useTmdb: boolean
  tmdbOn: boolean
  keywordLabel?: string
  onChange: (next: DiscoverFilters) => void
}

const TMDB_VALUE = 'tmdb'
const catalogValue = (o: CatalogOption) => o.rowKey ?? `${o.addon.transportUrl}|${o.catalog.id}`

export function FilterBar({ type, filters, options, selected, useTmdb, tmdbOn, keywordLabel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [stuck, setStuck] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const activeRow = useRef<HTMLDivElement>(null)
  /** Después de sacar un chip, a cuál pasar el foco (si no, quedaría en <body>). */
  const refocus = useRef<number | null>(null)

  // Lo que solo sabe TMDB no cuenta (ni se muestra) cuando se mira un catálogo de addon.
  const effective: DiscoverFilters = useTmdb ? filters : { ...filters, lang: undefined, country: undefined, provider: undefined, keyword: undefined, kw: undefined }
  const active = panelFilters(effective)
  const ratingSource = useTmdb ? 'TMDB' : 'IMDb'

  // Las plataformas se piden al abrir el panel o si la URL ya trae una (para el nombre del chip).
  const needProviders = tmdbOn && (open || !!filters.provider)
  useEffect(() => {
    if (!needProviders) return
    let alive = true
    getProviders(type)
      .then((list) => alive && setProviders(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [needProviders, type])

  // Sombra cuando la barra queda pegada arriba (el centinela invisible de arriba salió de la vista).
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const i = refocus.current
    if (i === null) return
    refocus.current = null
    const chips = activeRow.current?.querySelectorAll<HTMLElement>('.fb-active-chip')
    const target = chips && chips.length > 0 ? chips[Math.min(i, chips.length - 1)] : moreBtn.current
    target?.focus({ preventScroll: true })
  }, [active.join()])

  /** Pasar a TMDB conservando el género (Cinemeta usa nombres en inglés, TMDB ids). */
  const toTmdb = (patch: Partial<DiscoverFilters>): DiscoverFilters => ({
    ...filters,
    src: 'tmdb',
    addon: undefined,
    catalog: undefined,
    row: undefined,
    genre: cinemetaToTmdbGenre(filters.genre, type),
    ...patch,
  })

  const multiAddon = new Set(options.map((x) => x.addon.transportUrl)).size > 1
  const catalogOptions: PickerOption[] = [
    ...(tmdbOn ? [{ value: TMDB_VALUE, label: 'Explorar todo (TMDB)' }] : []),
    ...options.map((o) => ({
      value: catalogValue(o),
      label: o.label ?? catalogLabel(o.catalog.name, o.catalog.type, o.addon.manifest.name).split(' · ')[0] + (multiAddon ? ` (${o.addon.manifest.name})` : ''),
    })),
  ]

  const pickCatalog = (value: string) => {
    if (value === TMDB_VALUE) return onChange(toTmdb({}))
    const o = options.find((x) => catalogValue(x) === value)
    if (!o) return
    const genres = o.catalog.genres ?? o.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
    const genre = tmdbToCinemetaGenre(filters.genre, type)
    // Lo que solo sabe TMDB se cae; año, puntaje y orden siguen (se aplican del lado del cliente).
    onChange({
      ...filters,
      src: undefined,
      addon: o.rowKey ? undefined : o.addon.transportUrl,
      catalog: o.rowKey ? undefined : o.catalog.id,
      row: o.rowKey,
      genre: genre && genres.includes(genre) ? genre : undefined,
      lang: undefined,
      country: undefined,
      provider: undefined,
      keyword: undefined,
      kw: undefined,
    })
  }

  const genreOptions: PickerOption[] = useMemo(() => {
    if (useTmdb) return [{ value: '', label: 'Todos' }, ...TMDB_GENRES[tmdbKind(type)].map((g) => ({ value: String(g.id), label: g.name }))]
    const supports = !!selected?.catalog.extra?.some((e) => e.name === 'genre') || !!selected?.catalog.extraSupported?.includes('genre')
    const list = selected?.catalog.genres ?? selected?.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
    if (!supports || list.length === 0) return []
    return [{ value: '', label: 'Todos' }, ...list.map((g) => ({ value: g, label: genreLabel(g) }))]
  }, [useTmdb, type, selected])
  const genreValue = useTmdb ? (cinemetaToTmdbGenre(filters.genre, type) ?? '') : (tmdbToCinemetaGenre(filters.genre, type) ?? '')

  const chipLabel = (k: PanelFilter): string => {
    switch (k) {
      case 'years':
        return yearsLabel(effective.from, effective.to)
      case 'rating':
        return `${ratingSource} ${ratingLabel(effective.rating ?? 0)}`
      case 'lang':
        return `Idioma: ${LANGUAGES.find((l) => l.code === effective.lang)?.name ?? effective.lang}`
      case 'country':
        return `País: ${COUNTRIES.find((c) => c.code === effective.country)?.name ?? effective.country}`
      case 'provider':
        return providers.find((p) => p.id === effective.provider)?.name ?? `Plataforma ${effective.provider}`
      case 'keyword':
        return keywordLabel ?? `#${effective.keyword}`
      case 'sort':
        return `Orden: ${SORTS.find((x) => x.value === effective.sort)?.label ?? effective.sort}`
    }
  }

  const removeChip = (k: PanelFilter, i: number) => {
    refocus.current = i
    onChange(withoutFilter(filters, k))
  }

  const closePanel = () => {
    setOpen(false)
    // El foco vuelve al botón "Filtros" (el panel saca el `inert` de la página al desmontarse).
    requestAnimationFrame(() => moreBtn.current?.focus({ preventScroll: true }))
  }

  const providerLogo = (id?: number) => providers.find((p) => p.id === id)?.logo

  return (
    <>
      <div ref={sentinel} className="fb-sentinel" aria-hidden />
      <div className={`fb${stuck ? ' is-stuck' : ''}`}>
        <div className={`fb-main${catalogOptions.length > 1 ? '' : ' no-catalog'}${genreOptions.length > 0 ? '' : ' no-genres'}`}>
          {catalogOptions.length > 1 && (
            <Picker
              label="Catálogo"
              className="fb-picker fb-catalog"
              icon={<FilterIcon name="grid" size={18} />}
              value={useTmdb ? TMDB_VALUE : selected ? catalogValue(selected) : ''}
              options={catalogOptions}
              onChange={pickCatalog}
            />
          )}
          {genreOptions.length > 0 && (
            <GenreChips options={genreOptions} value={genreValue} onPick={(v) => onChange({ ...filters, genre: v || undefined })} />
          )}
          <Picker
            label="Ordenar"
            className={`fb-picker fb-sort${filters.sort !== 'popularity' ? ' fb-on' : ''}`}
            icon={<FilterIcon name="sort" size={18} />}
            value={filters.sort}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => onChange({ ...filters, sort: v as SortKey })}
          />
          <button
            ref={moreBtn}
            type="button"
            className={`fb-more${active.length > 0 ? ' fb-on' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={active.length > 0 ? `Filtros, ${active.length} ${active.length === 1 ? 'activo' : 'activos'}` : 'Filtros'}
            onClick={() => setOpen(true)}
          >
            <FilterIcon name="sliders" size={18} />
            <span className="fb-more-text">Filtros</span>
            {active.length > 0 && <span className="fb-badge">{active.length}</span>}
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <div ref={activeRow} className="fb-active" role="group" aria-label="Filtros activos">
          {active.map((k, i) => (
            <button
              key={k}
              type="button"
              className="fb-active-chip"
              aria-label={`Quitar ${chipLabel(k)}`}
              onClick={() => removeChip(k, i)}
            >
              {k === 'provider' && providerLogo(effective.provider) ? (
                <img src={providerLogo(effective.provider)} alt="" />
              ) : k === 'keyword' ? (
                <FilterIcon name="tag" size={16} />
              ) : k === 'rating' ? (
                <FilterIcon name="star" size={16} />
              ) : k === 'sort' ? (
                <FilterIcon name="sort" size={16} />
              ) : null}
              <span>{chipLabel(k)}</span>
              <FilterIcon name="close" size={16} />
            </button>
          ))}
          <button
            type="button"
            className="fb-clear"
            onClick={() => {
              refocus.current = 0
              onChange(clearPanel(filters))
            }}
          >
            Limpiar todo
          </button>
        </div>
      )}

      {open && (
        <FilterPanel
          filters={filters}
          useTmdb={useTmdb}
          tmdbOn={tmdbOn}
          providers={providers}
          ratingSource={ratingSource}
          count={active.length}
          catalog={
            catalogOptions.length > 1
              ? { options: catalogOptions, value: useTmdb ? TMDB_VALUE : selected ? catalogValue(selected) : '', onPick: pickCatalog }
              : undefined
          }
          onChange={onChange}
          toTmdb={toTmdb}
          onClose={closePanel}
        />
      )}
    </>
  )
}

/**
 * Géneros como chips en una fila que se desliza de costado. En PC aparecen flechas cuando hay
 * más de los que entran; con teclado o control remoto se recorre con ←/→ (la navegación espacial
 * centra el chip).
 */
function GenreChips({ options, value, onPick }: { options: PickerOption[]; value: string; onPick: (v: string) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = () => {
    const el = track.current
    if (!el) return
    const start = el.scrollLeft > 2
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }

  // El género elegido a la vista al entrar (ej. al volver de una ficha con "Western" puesto). Se
  // corre lo justo para que entre (en el celular desliza toda la barra: orden y catálogo siguen
  // cerca) y nunca se mueve la página.
  useLayoutEffect(() => {
    const chip = track.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (chip && chip.dataset.value) {
      for (let el: HTMLElement | null = track.current; el && !el.classList.contains('fb'); el = el.parentElement) {
        if (el.scrollWidth <= el.clientWidth + 1) continue
        const r = chip.getBoundingClientRect()
        const s = el.getBoundingClientRect()
        const room = 56
        if (r.right > s.right - room) el.scrollLeft += r.right - s.right + room
        else if (r.left < s.left + room) el.scrollLeft -= s.left + room - r.left
        break
      }
    }
    measure()
  }, [options])

  useEffect(() => {
    const el = track.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasValue = options.some((o) => o.value === value)

  const page = (dir: 1 | -1) => {
    const el = track.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="fb-genres" data-start={edges.start || undefined} data-end={edges.end || undefined}>
      {/* Solo para el mouse: con teclado o control remoto se llega a los chips directo. No son
          <button> a propósito: así ni Tab ni la navegación espacial las toman. */}
      <div className="fb-scroll fb-scroll-prev" aria-hidden onClick={() => page(-1)}>
        <FilterIcon name="prev" size={18} />
      </div>
      <div ref={track} className="fb-genres-track" role="group" aria-label="Género" onScroll={measure}>
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className="fb-chip"
            data-value={o.value}
            aria-pressed={o.value === value}
            // Una sola parada de Tab (el elegido): entre géneros se pasa con ←/→, así Tab no
            // recorre veinte chips para llegar a "Ordenar" y "Filtros".
            tabIndex={o.value === value || (!hasValue && i === 0) ? 0 : -1}
            onClick={() => o.value !== value && onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="fb-scroll fb-scroll-next" aria-hidden onClick={() => page(1)}>
        <FilterIcon name="next" size={18} />
      </div>
    </div>
  )
}

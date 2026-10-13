import { useEffect, useMemo, useState } from 'react'
import { Picker, type PickerOption } from '../../components/Picker'
import { getProviders, type ProviderOption } from '../../lib/discoverApi'
import {
  activeCount,
  cinemetaToTmdbGenre,
  clearAdvanced,
  COUNTRIES,
  LANGUAGES,
  RATINGS,
  SORTS,
  TMDB_GENRES,
  tmdbKind,
  tmdbToCinemetaGenre,
  yearOptions,
  type DiscoverFilters,
  type SortKey,
} from '../../lib/discoverFilters'
import { catalogLabel, genreLabel } from '../../lib/i18n'
import type { CatalogDef, InstalledAddon } from '../../lib/types'

// Barra de filtros de Descubrir. Todo cambio va a la URL (Discover lo lee de ahí), así que
// al volver atrás desde una ficha los filtros siguen puestos.

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
  const count = activeCount(useTmdb ? filters : { ...filters, lang: undefined, country: undefined, provider: undefined, keyword: undefined })
  const [open, setOpen] = useState(count > 0)
  const [providers, setProviders] = useState<ProviderOption[]>([])

  useEffect(() => {
    if (!tmdbOn || !open) return
    let alive = true
    getProviders(type)
      .then((list) => alive && setProviders(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tmdbOn, open, type])

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

  const catalogOptions: PickerOption[] = [
    ...(tmdbOn ? [{ value: TMDB_VALUE, label: 'Explorar todo (TMDB)' }] : []),
    ...options.map((o) => ({
      value: catalogValue(o),
      label:
        o.label ??
        catalogLabel(o.catalog.name, o.catalog.type, o.addon.manifest.name).split(' · ')[0] +
        (new Set(options.map((x) => x.addon.transportUrl)).size > 1 ? ` (${o.addon.manifest.name})` : ''),
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
    if (useTmdb)
      return [{ value: '', label: 'Todos' }, ...TMDB_GENRES[tmdbKind(type)].map((g) => ({ value: String(g.id), label: g.name }))]
    const supports = !!selected?.catalog.extra?.some((e) => e.name === 'genre') || !!selected?.catalog.extraSupported?.includes('genre')
    const list = selected?.catalog.genres ?? selected?.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
    if (!supports || list.length === 0) return []
    return [{ value: '', label: 'Todos' }, ...list.map((g) => ({ value: g, label: genreLabel(g) }))]
  }, [useTmdb, type, selected])
  const genreValue = useTmdb ? (cinemetaToTmdbGenre(filters.genre, type) ?? '') : (tmdbToCinemetaGenre(filters.genre, type) ?? '')

  const years = useMemo(() => yearOptions().map((y) => ({ value: String(y), label: String(y) })), [])
  const anyYear = { value: '', label: 'Cualquiera' }
  const ratingSource = useTmdb ? 'TMDB' : 'IMDb'

  return (
    <div className="discover-filters">
      <div className="filters">
        {catalogOptions.length > 1 && (
          <Picker
            label="Catálogo"
            value={useTmdb ? TMDB_VALUE : selected ? catalogValue(selected) : ''}
            options={catalogOptions}
            onChange={pickCatalog}
          />
        )}
        {genreOptions.length > 0 && (
          <Picker label="Género" value={genreValue} options={genreOptions} onChange={(v) => onChange({ ...filters, genre: v || undefined })} />
        )}
        <button
          type="button"
          className={`btn btn-small filters-toggle${count > 0 ? ' is-set' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ⚙ Filtros{count > 0 ? ` (${count})` : ''} {open ? '▴' : '▾'}
        </button>
        {useTmdb && filters.keyword && (
          <button
            type="button"
            className="chip chip-removable"
            aria-label={`Quitar la palabra clave ${keywordLabel ?? ''}`}
            onClick={() => onChange({ ...filters, keyword: undefined, kw: undefined })}
          >
            🏷 {keywordLabel ?? `#${filters.keyword}`} ✕
          </button>
        )}
      </div>

      {open && (
        <div className="filters filters-panel">
          <Picker
            label="Desde"
            value={filters.from ? String(filters.from) : ''}
            options={[anyYear, ...years]}
            onChange={(v) => onChange({ ...filters, from: v ? Number(v) : undefined, to: v && filters.to && filters.to < Number(v) ? undefined : filters.to })}
          />
          <Picker
            label="Hasta"
            value={filters.to ? String(filters.to) : ''}
            options={[anyYear, ...years]}
            onChange={(v) => onChange({ ...filters, to: v ? Number(v) : undefined, from: v && filters.from && filters.from > Number(v) ? undefined : filters.from })}
          />
          <Picker
            label={`Puntaje ${ratingSource}`}
            value={filters.rating ? String(filters.rating) : ''}
            options={[{ value: '', label: 'Cualquiera' }, ...RATINGS.map((r) => ({ value: String(r), label: `${r} o más` }))]}
            onChange={(v) => onChange({ ...filters, rating: v ? Number(v) : undefined })}
          />
          <Picker
            label="Orden"
            value={filters.sort}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => onChange({ ...filters, sort: v as SortKey })}
          />
          {tmdbOn ? (
            <>
              <Picker
                label="Idioma"
                value={useTmdb ? (filters.lang ?? '') : ''}
                options={[{ value: '', label: 'Cualquiera' }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
                onChange={(v) => onChange(v ? toTmdb({ lang: v }) : { ...filters, lang: undefined })}
              />
              <Picker
                label="País"
                value={useTmdb ? (filters.country ?? '') : ''}
                options={[{ value: '', label: 'Cualquiera' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name }))]}
                onChange={(v) => onChange(v ? toTmdb({ country: v }) : { ...filters, country: undefined })}
              />
              <Picker
                label="Plataforma"
                value={useTmdb && filters.provider ? String(filters.provider) : ''}
                options={[
                  { value: '', label: 'Cualquiera' },
                  ...providers.map((p) => ({ value: String(p.id), label: p.name, icon: p.logo })),
                  // Si la plataforma de la URL todavía no cargó, que el botón no quede vacío.
                  ...(filters.provider && !providers.some((p) => p.id === filters.provider)
                    ? [{ value: String(filters.provider), label: `Plataforma ${filters.provider}` }]
                    : []),
                ]}
                onChange={(v) => onChange(v ? toTmdb({ provider: Number(v) }) : { ...filters, provider: undefined })}
              />
            </>
          ) : (
            <span className="muted small">Idioma, país y plataforma: con una key de TMDB.</span>
          )}
          {count > 0 && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange(clearAdvanced(filters))}>
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Picker, type PickerOption } from '../../components/Picker'
import type { ProviderOption } from '../../lib/discoverApi'
import {
  clearPanel,
  COUNTRIES,
  decades,
  LANGUAGES,
  RATINGS,
  ratingLabel,
  SORTS,
  yearOptions,
  type DiscoverFilters,
} from '../../lib/discoverFilters'
import { FilterIcon } from './FilterIcons'

// Panel "Filtros" de Descubrir: hoja desde abajo en el celular y panel lateral en PC/TV. Los
// cambios se aplican al instante (la grilla se actualiza atrás); "Ver resultados" solo cierra.
// Mientras está abierto, la página queda `inert` y la navegación espacial no sale del panel
// (`data-nav-scope`). Escape / Atrás lo cierra y el foco vuelve al botón "Filtros".

interface Props {
  filters: DiscoverFilters
  useTmdb: boolean
  tmdbOn: boolean
  providers: ProviderOption[]
  ratingSource: string
  count: number
  /** En PC el orden está en la barra ("Ordenar"): "Limpiar todo" no lo toca. */
  keepSort?: boolean
  /** El selector de catálogo de la barra (solo si hay más de uno para elegir). */
  catalog?: { options: PickerOption[]; value: string; onPick: (value: string) => void }
  onChange: (next: DiscoverFilters) => void
  /** Pasa a "Explorar todo (TMDB)" con el cambio: idioma, país y plataforma solo existen ahí. */
  toTmdb: (patch: Partial<DiscoverFilters>) => DiscoverFilters
  onClose: () => void
}

const CLOSE_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** Plataformas a la vista antes de "Ver todas" (vienen ordenadas por lo más visto en Argentina). */
const TOP_PROVIDERS = 12

/** Lo enfocable que se ve (las secciones solo del celular están ocultas en PC/TV). */
const focusables = (root: Element | null | undefined) =>
  Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0)

export function FilterPanel({ filters, useTmdb, tmdbOn, providers, ratingSource, count, keepSort, catalog, onChange, toTmdb, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [allProviders, setAllProviders] = useState(false)

  useEffect(() => {
    // La página de atrás no se puede enfocar ni la lee el lector de pantalla; tampoco se desplaza.
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const body = document.body
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    // Sin la barra de desplazamiento la página no "salta" hacia la derecha.
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    focusables(panel.current?.querySelector('.fb-panel-body'))[0]?.focus({ preventScroll: true })
    return () => {
      root?.removeAttribute('inert')
      body.style.overflow = prev.overflow
      body.style.paddingRight = prev.paddingRight
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (CLOSE_KEYS.has(e.key)) {
      // Antes de que la navegación espacial lo tome como "volver a la página anterior".
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab') {
      // Tab da la vuelta dentro del panel.
      const els = focusables(panel.current)
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) {
        e.preventDefault()
        els[els.length - 1].focus()
      } else if (!e.shiftKey && i === els.length - 1) {
        e.preventDefault()
        els[0].focus()
      }
    }
  }

  const years = useMemo(() => [{ value: '', label: 'Cualquiera' }, ...yearOptions().map((y) => ({ value: String(y), label: String(y) }))], [])
  const setYears = (from?: number, to?: number) => onChange({ ...filters, from, to })

  const shownProviders = useMemo(() => {
    const list = allProviders ? providers : providers.slice(0, TOP_PROVIDERS)
    // La elegida siempre a la vista, aunque esté más abajo en la lista.
    const chosen = providers.find((p) => p.id === filters.provider)
    return chosen && !list.includes(chosen) ? [...list, chosen] : list
  }, [providers, allProviders, filters.provider])
  const provider = useTmdb ? filters.provider : undefined

  return createPortal(
    <div className="fb-layer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="fb-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-nav-scope onKeyDown={onKeyDown}>
        <header className="fb-panel-head">
          <h2 id={titleId}>
            Filtros
            {count > 0 && <span className="fb-badge">{count}</span>}
          </h2>
          <button type="button" className="fb-icon-btn" aria-label="Cerrar filtros" onClick={onClose}>
            <FilterIcon name="close" />
          </button>
        </header>

        <div className="fb-panel-body">
          {catalog && (
            <Section title="Catálogo" mobileOnly>
              <Picker label="Catálogo" className="fb-wide" value={catalog.value} options={catalog.options} onChange={catalog.onPick} />
            </Section>
          )}

          <Section title="Ordenar por" mobileOnly>
            <ChipGroup label="Ordenar por">
              {SORTS.map((s) => (
                <Chip key={s.value} pressed={filters.sort === s.value} onClick={() => onChange({ ...filters, sort: s.value })}>
                  {s.label}
                </Chip>
              ))}
            </ChipGroup>
          </Section>

          <Section title="Año">
            <ChipGroup label="Año">
              <Chip pressed={!filters.from && !filters.to} onClick={() => setYears()}>
                Cualquiera
              </Chip>
              {decades().map((d) => {
                const on = filters.from === d.from && filters.to === d.to
                return (
                  <Chip key={d.label} pressed={on} onClick={() => (on ? setYears() : setYears(d.from, d.to))}>
                    {d.label}
                  </Chip>
                )
              })}
            </ChipGroup>
            <div className="fb-pair">
              <Picker
                label="Desde"
                value={filters.from ? String(filters.from) : ''}
                options={years}
                onChange={(v) => setYears(v ? Number(v) : undefined, v && filters.to && filters.to < Number(v) ? undefined : filters.to)}
              />
              <Picker
                label="Hasta"
                value={filters.to ? String(filters.to) : ''}
                options={years}
                onChange={(v) => setYears(v && filters.from && filters.from > Number(v) ? undefined : filters.from, v ? Number(v) : undefined)}
              />
            </div>
          </Section>

          <Section title={`Puntaje mínimo (${ratingSource})`}>
            <ChipGroup label={`Puntaje mínimo de ${ratingSource}`}>
              <Chip pressed={!filters.rating} onClick={() => onChange({ ...filters, rating: undefined })}>
                Cualquiera
              </Chip>
              {RATINGS.map((r) => (
                <Chip key={r} pressed={filters.rating === r} onClick={() => onChange({ ...filters, rating: filters.rating === r ? undefined : r })}>
                  <FilterIcon name="star" size={16} />
                  {ratingLabel(r)}
                </Chip>
              ))}
            </ChipGroup>
          </Section>

          {tmdbOn ? (
            <>
              <Section title="Idioma y país">
                <div className="fb-pair">
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
                </div>
              </Section>

              <Section title="Plataforma en Argentina">
                {providers.length === 0 ? (
                  <div className="fb-providers" aria-hidden>
                    {Array.from({ length: 8 }, (_, i) => (
                      <span key={i} className="fb-provider is-skeleton" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="fb-providers" role="group" aria-label="Plataforma">
                      {shownProviders.map((p) => {
                        const on = provider === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="fb-provider"
                            aria-pressed={on}
                            onClick={() => onChange(on ? { ...filters, provider: undefined } : toTmdb({ provider: p.id }))}
                          >
                            {p.logo ? <img src={p.logo} alt="" loading="lazy" /> : <span className="fb-provider-ph" aria-hidden />}
                            <span className="fb-provider-name">{p.name}</span>
                          </button>
                        )
                      })}
                    </div>
                    {providers.length > TOP_PROVIDERS && (
                      <button type="button" className="fb-link" aria-expanded={allProviders} onClick={() => setAllProviders((v) => !v)}>
                        {allProviders ? 'Ver menos' : `Ver todas (${providers.length})`}
                      </button>
                    )}
                  </>
                )}
              </Section>
              {!useTmdb && <p className="fb-hint">Idioma, país y plataforma se buscan con TMDB: al elegir uno pasás a “Explorar todo”.</p>}
            </>
          ) : (
            <p className="fb-hint">
              Idioma, país y plataforma necesitan una key de TMDB. Se carga en <Link to="/settings">Ajustes</Link>.
            </p>
          )}
        </div>

        <footer className="fb-panel-foot">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={count === 0}
            onClick={() => {
              onChange(keepSort ? { ...clearPanel(filters), sort: filters.sort } : clearPanel(filters))
              // El botón queda deshabilitado: el foco pasa a "Ver resultados" en vez de perderse.
              done.current?.focus()
            }}
          >
            Limpiar todo
          </button>
          <button ref={done} type="button" className="btn btn-primary" onClick={onClose}>
            Ver resultados
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/** `mobileOnly`: catálogo y orden, que en PC/TV ya están en la barra. */
function Section({ title, mobileOnly, children }: { title: string; mobileOnly?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section className={`fb-sec${mobileOnly ? ' fb-sec-mobile' : ''}`} aria-labelledby={id}>
      <h3 id={id} className="fb-sec-title">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fb-chips" role="group" aria-label={label}>
      {children}
    </div>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="fb-chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

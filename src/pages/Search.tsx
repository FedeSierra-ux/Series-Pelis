import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { KeyboardToggle } from '../components/OnScreenKeyboard'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { PeopleGrid, PeopleRow, PersonAvatar } from '../components/PeopleRow'
import { useVoiceSearch, VoiceButton, VoiceStatus } from '../components/VoiceSearch'
import { searchableCatalogs } from '../lib/addons'
import { findPerson, getTogether, searchCatalog, searchPeople, type TmdbPersonResult } from '../lib/discoverApi'
import { errorText } from '../lib/errors'
import { useAddons, useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { debounce, MIN_QUERY, normalizeQuery, parseTogether, pushRecent, removeRecent } from '../lib/searchHistory'
import {
  failedAddons,
  groupSources,
  parseTab,
  pickBestResult,
  SEARCH_TABS,
  searchOutcome,
  type SearchGroup,
  type SearchSource,
  type SearchTab,
} from '../lib/searchResults'
import { recentSearchesStore, useStore } from '../lib/store'
import { useTmdbKey } from '../lib/tmdb'
import { useTvMode } from '../lib/tv'
import { BestResult } from './search/BestResult'
import { SearchSuggestions } from './search/SearchSuggestions'
import './search/search-v14.css'

const DEBOUNCE_MS = 300
/** Esqueletos de la primera búsqueda: dos filas en PC, para que al llegar los pósters no empuje tanto lo de abajo. */
const SKELETONS = 12
/** En "Todo" cada grupo muestra hasta acá; el resto, en su pestaña. */
const ALL_TAB_MAX = 12

const saveRecent = (q: string) => recentSearchesStore.set((list) => pushRecent(list, q))

/** Lo primero que se enfoca debajo del campo (control remoto: ↓ o "Buscar" del teclado en pantalla). */
const FIRST_BELOW =
  '.search-tabs [aria-selected="true"], .recent-query, .search-trending-item, .search-genre-chip, .together-banner, .search-best a, .search-people a.cast-card, .search-group a.poster-card'
const FIRST_RESULT = '.search-best a, .people-grid a.cast-card, .search-people a.cast-card, .search-group a.poster-card'

interface PeopleState {
  people: TmdbPersonResult[]
  loading: boolean
  stale: boolean
  failed: boolean
}

/** Personas de TMDB que coinciden con la búsqueda (vacío sin key). */
function usePeople(query: string, enabled: boolean, retry: number): PeopleState {
  const [state, setState] = useState<{ q: string; people: TmdbPersonResult[]; loading: boolean; failed: boolean }>({
    q: '',
    people: [],
    loading: false,
    failed: false,
  })
  useEffect(() => {
    if (!enabled || query.length < MIN_QUERY) {
      // Con el campo vacío se olvida la anterior: la próxima búsqueda no arranca con caras de otra.
      setState({ q: '', people: [], loading: false, failed: false })
      return
    }
    let alive = true
    // Mientras busca quedan las personas de la búsqueda anterior: la fila no se cierra y se vuelve a abrir.
    setState((s) => ({ ...s, loading: true }))
    searchPeople(query)
      .then((people) => alive && setState({ q: query, people: people.slice(0, 15), loading: false, failed: false }))
      .catch(() => alive && setState({ q: query, people: [], loading: false, failed: true }))
    return () => {
      alive = false
    }
  }, [query, enabled, retry])
  if (!enabled || query.length < MIN_QUERY) return { people: [], loading: false, stale: false, failed: false }
  // Hasta que llega la respuesta (incluido el primer render de la búsqueda nueva) se muestra la anterior, atenuada.
  const stale = state.q !== query
  return { people: state.people, loading: stale || state.loading, stale, failed: !stale && state.failed }
}

interface TogetherHit {
  q: string
  a: TmdbPersonResult
  b: TmdbPersonResult
  count: number
}

/** "Darín y Francella": si las dos partes son personas con títulos en común, ofrecemos verlos. */
function useTogether(query: string, enabled: boolean) {
  const [hit, setHit] = useState<TogetherHit>()
  const pair = enabled ? parseTogether(query) : undefined
  const pairKey = pair?.join('|')
  useEffect(() => {
    if (!pair) return
    let alive = true
    Promise.all([findPerson(pair[0]), findPerson(pair[1])])
      .then(async ([a, b]) => {
        if (!a || !b || a.id === b.id) return
        const t = await getTogether(a.id, b.id)
        if (alive && t.items.length > 0) setHit({ q: query, a, b, count: t.items.length })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [pairKey])
  return hit && hit.q === query ? hit : undefined
}

/** Busca en todos los catálogos con búsqueda. Un error o un timeout queda marcado (no es "cero resultados"). */
function useCatalogSearch(query: string, retry: number): SearchSource[] {
  const addons = useAddons()
  const [sources, setSources] = useState<SearchSource[]>([])
  useEffect(() => {
    if (query.length < MIN_QUERY) {
      setSources([])
      return
    }
    // Cada letra nueva cancela los pedidos de la anterior.
    const ctrl = new AbortController()
    const targets = searchableCatalogs(addons).map(({ addon, catalog }) => ({
      addon,
      catalog,
      key: `${addon.transportUrl}|${catalog.type}|${catalog.id}`,
    }))
    // Cada catálogo conserva sus resultados anteriores (atenuados) hasta que llegan los nuevos: así la grilla
    // no vuelve a los esqueletos ni salta con cada letra.
    setSources((prev) =>
      targets.map(({ addon, catalog, key }) => ({
        key,
        type: catalog.type,
        addonName: addon.manifest.name,
        status: 'loading',
        items: prev.find((s) => s.key === key)?.items ?? [],
      })),
    )
    const settle = (key: string, patch: Partial<SearchSource>) => {
      if (!ctrl.signal.aborted) setSources((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
    }
    targets.forEach(({ addon, catalog, key }) => {
      searchCatalog(addon, catalog, query, ctrl.signal)
        .then((found) => settle(key, { status: 'done', error: undefined, items: found.map((m) => ({ ...m, type: m.type ?? catalog.type })) }))
        // Antes era `.catch(() => [])` y un addon caído decía "No encontramos nada" (auditoría, bug #2).
        .catch((err) => settle(key, { status: 'error', error: errorText(err), items: [] }))
    })
    return () => ctrl.abort()
  }, [query, addons, retry])
  return sources
}

export function Search() {
  useTitle('Buscar')
  const addons = useAddons()
  const recents = useStore(recentSearchesStore)
  const tmdbOn = useTmdbKey().length > 0
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [query, setQuery] = useState(() => normalizeQuery(params.get('q') ?? ''))
  const [tab, setTab] = useState<SearchTab>(() => parseTab(params.get('tab')))
  const [retry, setRetry] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const tv = useTvMode()
  const online = useOnline()
  // Resultados mientras escribís: se busca cuando dejás de tipear 300 ms (o ya, con Enter).
  const schedule = useMemo(() => debounce((v: string) => setQuery(normalizeQuery(v)), DEBOUNCE_MS), [])
  useEffect(
    () => () => {
      schedule.cancel()
    },
    [schedule],
  )

  const active = query.length >= MIN_QUERY
  const people = usePeople(query, tmdbOn, retry)
  const together = useTogether(query, tmdbOn)
  const sources = useCatalogSearch(query, retry)
  const groups = useMemo(() => groupSources(sources), [sources])
  // Sin ningún catálogo con búsqueda (ej. Cinemeta apagado) no hay dónde buscar: se avisa en vez de "no encontramos nada".
  const canSearch = useMemo(() => searchableCatalogs(addons).length > 0, [addons])
  const outcome = searchOutcome({
    active,
    sources,
    people: tmdbOn ? { count: people.people.length, loading: people.loading, failed: people.failed } : undefined,
  })
  const failed = failedAddons(sources)
  const best = useMemo(
    () => (active && groups.every((g) => !g.loading) ? pickBestResult(query, groups) : undefined),
    [active, groups, query],
  )
  const tabs = SEARCH_TABS.filter((t) => t.id !== 'people' || tmdbOn)
  const shownTab: SearchTab = tab === 'people' && !tmdbOn ? 'all' : tab

  // La búsqueda y la pestaña quedan en la URL: "Atrás" desde una ficha vuelve a lo mismo.
  useEffect(() => {
    const next: Record<string, string> = {}
    if (query) next.q = query
    if (query && shownTab !== 'all') next.tab = shownTab
    setParams(next, { replace: true })
  }, [query, shownTab])

  const change = (v: string) => {
    setText(v)
    schedule(v)
  }

  const runNow = (v: string) => {
    schedule.cancel()
    const q = normalizeQuery(v)
    setText(v)
    setQuery(q)
    if (q.length >= MIN_QUERY) saveRecent(q)
  }

  // F13: búsqueda por voz. Lo que vas diciendo aparece en el campo; al terminar, busca.
  const voice = useVoiceSearch(change, runNow)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    schedule.flush()
    const q = normalizeQuery(text)
    if (q.length >= MIN_QUERY) saveRecent(q)
    // Cierra el teclado en pantalla (celular / TV) y deja ver los resultados.
    input.current?.blur()
  }

  const pickRecent = (q: string) => {
    runNow(q)
    input.current?.focus({ preventScroll: true })
  }

  // Abrir un resultado cuenta como búsqueda "hecha": va a recientes.
  const onResultsClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a') && active) saveRecent(query)
  }

  const showRecents = !active && text.trim().length < MIN_QUERY
  const groupsFor = (t: SearchTab): SearchGroup[] => (t === 'all' ? groups : groups.filter((g) => g.type === t))
  const tabCount = (t: SearchTab): number | undefined => {
    if (t === 'all') return undefined
    if (t === 'people') return people.loading ? undefined : people.people.length
    const g = groups.find((x) => x.type === t)
    return !g || g.loading ? undefined : g.items.length
  }
  const tabEmpty =
    outcome === 'results' &&
    shownTab !== 'all' &&
    (shownTab === 'people' ? !people.loading && people.people.length === 0 : groupsFor(shownTab).every((g) => !g.loading && g.items.length === 0))

  const onTabsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Flechas entre pestañas como en cualquier lista de pestañas (en la TV, la navegación espacial hace lo mismo).
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const i = tabs.findIndex((t) => t.id === shownTab)
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    e.preventDefault()
    setTab(next.id)
    requestAnimationFrame(() => document.getElementById(`search-tab-${next.id}`)?.focus())
  }

  return (
    <div className="page search-page">
      <header className="page-header">
        <h1>Buscar</h1>
      </header>
      <form role="search" onSubmit={submit} className="search-form">
        <div className={`search-field${voice.supported ? ' has-voice' : ''}`}>
          <input
            ref={input}
            className="search-input"
            type="search"
            // En la TV el foco arranca en el teclado en pantalla (así no salta el teclado del sistema).
            autoFocus={!tv}
            placeholder={tmdbOn ? 'Película, serie, actor… o “Darín y Francella”' : 'Película, serie, actor...'}
            aria-label="Buscar"
            value={text}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              // Control remoto: ↓ va a lo primero de abajo (la pestaña, la búsqueda reciente o el primer resultado),
              // no a lo que quede más cerca del centro del campo.
              if (e.key !== 'ArrowDown') return
              const first = document.querySelector<HTMLElement>(FIRST_BELOW)
              if (!first) return
              e.preventDefault()
              first.focus({ preventScroll: true })
              first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
            }}
            enterKeyHint="search"
          />
          <VoiceButton voice={voice} />
        </div>
      </form>
      <VoiceStatus voice={voice} />
      <KeyboardToggle
        value={text}
        onChange={change}
        alwaysToggle
        openInTv
        doneLabel="Buscar"
        label="Teclado para buscar"
        onVoice={voice.supported ? voice.toggle : undefined}
        listening={voice.listening}
        onDone={() => {
          schedule.flush()
          const q = normalizeQuery(text)
          if (q.length >= MIN_QUERY) saveRecent(q)
          document.querySelector<HTMLElement>(FIRST_RESULT)?.focus()
        }}
      />
      {!online && <div className="empty muted">Sin conexión: la búsqueda necesita internet. Mientras tanto tenés Mi lista y lo que viste en Vos.</div>}

      {showRecents && recents.length > 0 && (
        <section className="recent-searches" aria-label="Búsquedas recientes">
          <header className="recent-header">
            <h2>Búsquedas recientes</h2>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => recentSearchesStore.set([])}>
              Borrar todo
            </button>
          </header>
          <ul className="recent-list">
            {recents.map((q) => (
              <li key={q} className="recent-item">
                <button type="button" className="recent-query" onClick={() => pickRecent(q)}>
                  <span aria-hidden>⟲</span> {q}
                </button>
                <button
                  type="button"
                  className="recent-remove"
                  aria-label={`Borrar “${q}” de recientes`}
                  title="Borrar"
                  onClick={(e) => {
                    // El foco pasa al vecino para no dejar al control remoto sin nada enfocado.
                    const li = e.currentTarget.closest('li')
                    const neighbor = (li?.nextElementSibling ?? li?.previousElementSibling)?.querySelector<HTMLElement>('.recent-remove')
                    recentSearchesStore.set((list) => removeRecent(list, q))
                    if (neighbor) requestAnimationFrame(() => neighbor.focus())
                    else input.current?.focus()
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showRecents && online && canSearch && <SearchSuggestions />}

      {active && canSearch && (
        <div className="search-tabs" role="tablist" aria-label="Tipo de resultado" onKeyDown={onTabsKey}>
          {tabs.map((t) => {
            const n = tabCount(t.id)
            return (
              <button
                key={t.id}
                id={`search-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={shownTab === t.id}
                aria-controls="search-results"
                tabIndex={shownTab === t.id ? 0 : -1}
                className={`search-tab${shownTab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {n !== undefined && <span className="search-tab-count">{n}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div id="search-results" role={active ? 'tabpanel' : undefined} aria-labelledby={active ? `search-tab-${shownTab}` : undefined} onClick={onResultsClick}>
        {shownTab === 'all' && together && (
          <Link className="together-banner" to={`/together?ids=${together.a.id},${together.b.id}`}>
            <span className="together-faces" aria-hidden>
              <PersonAvatar person={together.a} />
              <PersonAvatar person={together.b} />
            </span>
            <span>
              <strong>
                {together.a.name} y {together.b.name}
              </strong>
              <span className="muted"> · juntos en {together.count} {together.count === 1 ? 'título' : 'títulos'}</span>
            </span>
            <span aria-hidden>›</span>
          </Link>
        )}

        {shownTab === 'all' && best && <BestResult key={best.id} meta={best} />}

        {active && shownTab === 'all' && (people.loading || people.people.length > 0) && (
          <div className="search-people">
            <PeopleRow title="Personas" people={people.people} loading={people.loading} stale={people.stale} />
          </div>
        )}
        {active && shownTab === 'people' && (
          <PeopleGrid people={people.people} loading={people.loading} stale={people.stale} label={`Personas para “${query}”`} />
        )}

        {active &&
          shownTab !== 'people' &&
          groupsFor(shownTab)
            .filter((g) => g.loading || g.items.length > 0)
            .map((g) => {
              const items = shownTab === 'all' ? g.items.slice(0, ALL_TAB_MAX) : g.items
              const more = shownTab === 'all' && g.items.length > ALL_TAB_MAX && (g.type === 'movie' || g.type === 'series')
              return (
                <section key={g.type} className="search-group">
                  <header className="search-group-head">
                    <h2>{typeLabel(g.type)}</h2>
                    {more && (
                      <button type="button" className="row-more" onClick={() => setTab(g.type as SearchTab)}>
                        Ver las {g.items.length}
                      </button>
                    )}
                  </header>
                  <div className={g.stale ? 'grid is-stale' : 'grid'} aria-busy={g.loading}>
                    {g.loading && g.items.length === 0
                      ? Array.from({ length: SKELETONS }, (_, i) => <PosterSkeleton key={i} />)
                      : items.map((m) => <PosterCard key={m.id} meta={m} />)}
                  </div>
                </section>
              )
            })}

        {/* Algunos addons respondieron y otros no: se muestra lo que hay y se avisa que puede faltar. */}
        {outcome === 'results' && failed.length > 0 && !groups.some((g) => g.loading) && (
          <div className="search-partial" role="status">
            <span>
              {failed.join(', ')} no {failed.length === 1 ? 'respondió' : 'respondieron'}: puede que falten resultados.
            </span>
            <button type="button" className="btn btn-small" onClick={() => setRetry((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        )}

        {tabEmpty && (
          <EmptyState
            icon="search"
            title={`No hay ${SEARCH_TABS.find((t) => t.id === shownTab)?.label.toLowerCase()} para “${query}”`}
            text="Mirá en las otras pestañas."
            action={{ label: 'Ver todo', onClick: () => setTab('all') }}
          />
        )}
      </div>

      {!canSearch && (
        <EmptyState
          icon="search"
          title="Ningún addon activo permite buscar"
          text="Activá Cinemeta u otro addon con búsqueda en Ajustes."
          action={{ label: 'Ir a Ajustes', to: '/settings' }}
        />
      )}
      {canSearch && outcome === 'error' && (
        <EmptyState
          icon="search"
          title={online ? `No pudimos buscar “${query}”` : 'Sin conexión'}
          text={
            online
              ? `${failed.length ? `${failed.join(', ')}: ` : ''}${errorOf(sources) ?? 'El servicio de búsqueda no respondió.'}`
              : 'Revisá internet y probá de nuevo.'
          }
          action={{ label: 'Reintentar', onClick: () => setRetry((n) => n + 1) }}
        />
      )}
      {canSearch && outcome === 'empty' && online && (
        <EmptyState icon="search" title={`No encontramos nada para “${query}”`} text="Probá con otro nombre o con menos palabras." />
      )}
    </div>
  )
}

/** El primer error, ya en castellano ("Tardó demasiado en responder…"). */
const errorOf = (sources: readonly SearchSource[]) => sources.find((s) => s.status === 'error')?.error

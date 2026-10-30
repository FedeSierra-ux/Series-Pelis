import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { KeyboardToggle } from '../components/OnScreenKeyboard'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { PeopleGrid, PeopleRow, PersonAvatar } from '../components/PeopleRow'
import { useVoiceSearch, VoiceButton, VoiceStatus } from '../components/VoiceSearch'
import { searchableCatalogs } from '../lib/addons'
import { findPerson, getTogether, searchCatalog, searchPeople, searchTitlesTmdb, type TmdbPersonResult } from '../lib/discoverApi'
import { errorText } from '../lib/errors'
import { useAddons, useTitle } from '../lib/hooks'
import { requestTitles, useTitlesVersion } from '../lib/localTitles'
import { typeLabel } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { debounce, echoQuery, MIN_QUERY, normalizeQuery, parseTogether, pushRecent, removeRecent } from '../lib/searchHistory'
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
import { resultsAnnouncement } from './search/announce'
import { BestResult } from './search/BestResult'
import { SearchSuggestions } from './search/SearchSuggestions'
import './search/search-v14.css'

const DEBOUNCE_MS = 300
/** Esqueletos de la primera búsqueda: dos filas en PC, para que al llegar los pósters no empuje tanto lo de abajo. */
const SKELETONS = 12
/** En "Todo" cada grupo muestra hasta acá; el resto, en su pestaña. */
const ALL_TAB_MAX = 12

const saveRecent = (q: string) => recentSearchesStore.set((list) => pushRecent(list, q))

/** Cuánto esperar antes de anunciar los resultados a los lectores de pantalla (no leer a cada letra). */
const ANNOUNCE_MS = 600


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

/** Ítems del principio de cada catálogo cuyo nombre en español se pide ya (el resto, al acercarse a la pantalla). */
const NAMES_AHEAD = 10

/** Las dos fuentes de TMDB (v0.28): un solo pedido, repartido en Películas y Series. */
const TMDB_SOURCES = [
  { key: 'tmdb|movie', type: 'movie' },
  { key: 'tmdb|series', type: 'series' },
] as const

/**
 * Busca en todos los catálogos con búsqueda. Un error o un timeout queda marcado (no es "cero resultados").
 * v0.28: con TMDB, también ahí (en español), para encontrar por los dos nombres.
 */
function useCatalogSearch(query: string, retry: number, tmdbOn: boolean): SearchSource[] {
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
    // TMDB solo junto a algún addon con búsqueda: sin addons no hay de dónde sacar las fuentes.
    const withTmdb = tmdbOn && targets.length > 0
    // Cada catálogo conserva sus resultados anteriores (atenuados) hasta que llegan los nuevos: así la grilla
    // no vuelve a los esqueletos ni salta con cada letra.
    setSources((prev) => {
      const before = (key: string) => prev.find((s) => s.key === key)?.items ?? []
      const next: SearchSource[] = targets.map(({ addon, catalog, key }) => ({
        key,
        type: catalog.type,
        addonName: addon.manifest.name,
        status: 'loading',
        items: before(key),
      }))
      if (withTmdb) for (const { key, type } of TMDB_SOURCES) next.push({ key, type, addonName: 'TMDB', status: 'loading', tmdb: true, items: before(key) })
      return next
    })
    const settle = (key: string, patch: Partial<SearchSource>) => {
      if (!ctrl.signal.aborted) setSources((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
    }
    targets.forEach(({ addon, catalog, key }) => {
      searchCatalog(addon, catalog, query, ctrl.signal)
        .then((found) => settle(key, { status: 'done', error: undefined, items: found.map((m) => ({ ...m, type: m.type ?? catalog.type })) }))
        // Antes era `.catch(() => [])` y un addon caído decía "No encontramos nada" (auditoría, bug #2).
        .catch((err) => settle(key, { status: 'error', error: errorText(err), items: [] }))
    })
    if (withTmdb) {
      searchTitlesTmdb(query)
        .then((found) => {
          for (const { key, type } of TMDB_SOURCES) settle(key, { status: 'done', error: undefined, items: found.filter((m) => m.type === type) })
        })
        .catch((err) => {
          for (const { key } of TMDB_SOURCES) settle(key, { status: 'error', error: errorText(err), items: [] })
        })
    }
    return () => ctrl.abort()
  }, [query, addons, retry, tmdbOn])
  return sources
}

const NARROW = '(max-width: 760px)'

/** Pantalla de celular (el mismo corte que el CSS). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(NARROW).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(NARROW)
    const update = () => {
      setNarrow(mq.matches)
    }
    update()
    mq.addEventListener('change', update)
    return () => {
      mq.removeEventListener('change', update)
    }
  }, [])
  return narrow
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
  const navType = useNavigationType()
  const online = useOnline()
  // Al volver la conexión se busca de nuevo solo (no hace falta tocar "Reintentar").
  const wasOffline = useRef(!online)
  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    setRetry((n) => n + 1)
  }, [online])
  // Resultados mientras escribís: se busca cuando dejás de tipear 300 ms (o ya, con Enter).
  const schedule = useMemo(() => debounce((v: string) => setQuery(normalizeQuery(v)), DEBOUNCE_MS), [])
  useEffect(
    () => () => {
      schedule.cancel()
    },
    [schedule],
  )

  // Sin conexión no se muestran pestañas ni resultados (todo en 0): solo el aviso de abajo del campo.
  const active = online && query.length >= MIN_QUERY
  const people = usePeople(query, tmdbOn, retry)
  const together = useTogether(query, tmdbOn)
  const sources = useCatalogSearch(query, retry, tmdbOn)
  // Cuando llega un nombre en español (o el id de TMDB de un título) se vuelve a agrupar: así se juntan los
  // repetidos de los addons y de TMDB, y el mejor resultado mira también el nombre nuevo.
  const titlesVersion = useTitlesVersion()
  const groups = useMemo(() => groupSources(sources), [sources, titlesVersion])
  // Nombres en español de lo primero de cada addon: con el mismo pedido sale el id de TMDB, que junta repetidos.
  useEffect(() => {
    for (const s of sources) if (s.status === 'done' && !s.tmdb) requestTitles(s.items.slice(0, NAMES_AHEAD))
  }, [sources])
  // Sin ningún catálogo con búsqueda (ej. Cinemeta apagado) no hay dónde buscar: se avisa en vez de "no encontramos nada".
  const canSearch = useMemo(() => searchableCatalogs(addons).length > 0, [addons])
  const outcome = searchOutcome({
    active,
    sources,
    people: tmdbOn ? { count: people.people.length, loading: people.loading, failed: people.failed } : undefined,
  })
  const failed = failedAddons(sources)
  // Se espera también a las personas: si una se parece más que el mejor título, gana ella (v0.26, explorar-07).
  const best = useMemo(
    () => (active && groups.every((g) => !g.loading) && !people.loading ? pickBestResult(query, groups, people.people) : undefined),
    [active, groups, query, people.loading, people.people, titlesVersion],
  )
  const narrow = useNarrow()
  const tabs = SEARCH_TABS.filter((t) => t.id !== 'people' || tmdbOn)
  const shownTab: SearchTab = tab === 'people' && !tmdbOn ? 'all' : tab

  // La búsqueda y la pestaña quedan en la URL: "Atrás" desde una ficha vuelve a lo mismo. Solo si cambió algo: al
  // montar con `?q=` ya puesto, el REPLACE de más creaba otra entrada y cancelaba la memoria de foco que estaba
  // devolviendo el foco al resultado del que se salió (tv-07, pc-06).
  useEffect(() => {
    const next: Record<string, string> = {}
    if (query) next.q = query
    if (query && shownTab !== 'all') next.tab = shownTab
    if ((params.get('q') ?? undefined) === next.q && (params.get('tab') ?? undefined) === next.tab) return
    setParams(next, { replace: true })
  }, [query, shownTab])

  // a11y-05: una región viva (oculta) dice cuántos resultados hay cuando termina la búsqueda, con un pequeño
  // debounce para no leer a cada letra. El `aria-busy` de la grilla queda.
  const [announce, setAnnounce] = useState('')
  const settled = (outcome === 'results' || outcome === 'empty') && groups.every((g) => !g.loading) && !people.loading
  useEffect(() => {
    if (!settled) return
    const count = (t: string) => groups.filter((g) => g.type === t).reduce((n, g) => n + g.items.length, 0)
    const total = groups.reduce((n, g) => n + g.items.length, 0) + people.people.length
    const text = resultsAnnouncement({ query, movies: count('movie'), series: count('series'), people: people.people.length, total })
    const t = setTimeout(() => setAnnounce(text), ANNOUNCE_MS)
    return () => clearTimeout(t)
  }, [settled, query, groups, people.people])
  useEffect(() => {
    if (!active) setAnnounce('')
  }, [active])

  // Con el control remoto el campo de texto queda fuera de las flechas (tv-11): enfocarlo abría el teclado del
  // sistema de Android TV encima de la app. Se escribe con el teclado en pantalla.
  const focusField = () => {
    const key = tv ? document.querySelector<HTMLElement>('.osk button') : null
    ;(key ?? input.current)?.focus({ preventScroll: true })
  }

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
    focusField()
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
        <div className={`search-field${voice.supported && online ? ' has-voice' : ''}`}>
          <input
            ref={input}
            className="search-input"
            type="search"
            // En la TV el foco arranca en el teclado en pantalla (así no salta el teclado del sistema). Al volver
            // con "Atrás" a una búsqueda hecha (pc-06) tampoco: el foco vuelve al resultado del que se salió.
            autoFocus={!tv && !(navType === 'POP' && query.length > 0)}
            tabIndex={tv ? -1 : undefined}
            data-nav-skip={tv || undefined}
            // En el celular el largo se cortaba ("…o “Dar"): uno corto (v0.26, explorar-09).
            placeholder={narrow ? 'Peli, serie o actor' : tmdbOn ? 'Película, serie, actor… o “Darín y Francella”' : 'Película, serie, actor…'}
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
          {/* La voz necesita internet (el reconocimiento es en línea): sin conexión no se ofrece. */}
          {online && <VoiceButton voice={voice} />}
        </div>
      </form>
      <VoiceStatus voice={voice} />
      <p className="sp-sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <KeyboardToggle
        value={text}
        onChange={change}
        // visual-pc-19: solo en modo TV (en PC y celular está el teclado del aparato).
        openInTv
        doneLabel="Buscar"
        label="Teclado para buscar"
        onVoice={voice.supported && online ? voice.toggle : undefined}
        listening={voice.listening}
        onDone={() => {
          schedule.flush()
          const q = normalizeQuery(text)
          if (q.length >= MIN_QUERY) saveRecent(q)
          document.querySelector<HTMLElement>(FIRST_RESULT)?.focus()
        }}
      />
      {/* Sin conexión, este es el único aviso (el banner general no se muestra en Buscar). */}
      {!online && (
        <EmptyState
          icon="search"
          title="Sin conexión"
          text="La búsqueda necesita internet y se hace sola cuando vuelva. Mientras tanto tenés Mi lista y lo que viste en Vos."
        />
      )}

      {/* Con una sola letra la pantalla sigue en lo de siempre: se avisa por qué no busca (uso-09). */}
      {showRecents && text.trim().length === 1 && (
        <p className="muted small search-min-hint" role="status">
          Escribí al menos {MIN_QUERY} letras para buscar.
        </p>
      )}

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
                    else focusField()
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
            title={`No hay ${SEARCH_TABS.find((t) => t.id === shownTab)?.label.toLowerCase()} para “${echoQuery(query)}”`}
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
          title={`No pudimos buscar “${echoQuery(query)}”`}
          text={`${failed.length ? `${failed.join(', ')}: ` : ''}${errorOf(sources) ?? 'El servicio de búsqueda no respondió.'}`}
          action={{ label: 'Reintentar', onClick: () => setRetry((n) => n + 1) }}
        />
      )}
      {canSearch && outcome === 'empty' && (
        <EmptyState icon="search" title={`No encontramos nada para “${echoQuery(query)}”`} text="Probá con otro nombre o con menos palabras." />
      )}
    </div>
  )
}

/** El primer error, ya en castellano ("Tardó demasiado en responder…"). */
const errorOf = (sources: readonly SearchSource[]) => sources.find((s) => s.status === 'error')?.error

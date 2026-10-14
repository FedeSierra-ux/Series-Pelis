import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { KeyboardToggle } from '../components/OnScreenKeyboard'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { PeopleRow, PersonAvatar } from '../components/PeopleRow'
import { searchableCatalogs } from '../lib/addons'
import { findPerson, getTogether, searchCatalog, searchPeople, type TmdbPersonResult } from '../lib/discoverApi'
import { useAddons, useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { debounce, MIN_QUERY, normalizeQuery, parseTogether, pushRecent, removeRecent } from '../lib/searchHistory'
import { recentSearchesStore, useStore } from '../lib/store'
import { useTmdbKey } from '../lib/tmdb'
import { useTvMode } from '../lib/tv'
import type { MetaPreview } from '../lib/types'

interface Group {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
}

const DEBOUNCE_MS = 300
/** Esqueletos de la primera búsqueda: dos filas en PC, para que al llegar los pósters no empuje tanto lo de abajo. */
const SKELETONS = 12

const saveRecent = (q: string) => recentSearchesStore.set((list) => pushRecent(list, q))

/** Personas de TMDB que coinciden con la búsqueda (vacío sin key). */
function usePeople(query: string, enabled: boolean) {
  const [state, setState] = useState<{ q: string; people: TmdbPersonResult[]; loading: boolean }>({ q: '', people: [], loading: false })
  useEffect(() => {
    if (!enabled || query.length < MIN_QUERY) {
      // Con el campo vacío se olvida la anterior: la próxima búsqueda no arranca con caras de otra.
      setState({ q: '', people: [], loading: false })
      return
    }
    let alive = true
    // Mientras busca quedan las personas de la búsqueda anterior: la fila no se cierra y se vuelve a abrir.
    setState((s) => ({ ...s, loading: true }))
    searchPeople(query)
      .then((people) => alive && setState({ q: query, people: people.slice(0, 15), loading: false }))
      .catch(() => alive && setState({ q: query, people: [], loading: false }))
    return () => {
      alive = false
    }
  }, [query, enabled])
  if (!enabled || query.length < MIN_QUERY) return { people: [], loading: false, stale: false }
  // Hasta que llega la respuesta (incluido el primer render de la búsqueda nueva) se muestra la anterior, atenuada.
  const stale = state.q !== query
  return { people: state.people, loading: stale || state.loading, stale }
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

export function Search() {
  useTitle('Buscar')
  const addons = useAddons()
  const recents = useStore(recentSearchesStore)
  const tmdbOn = useTmdbKey().length > 0
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [query, setQuery] = useState(() => normalizeQuery(params.get('q') ?? ''))
  const [groups, setGroups] = useState<Group[]>([])
  const input = useRef<HTMLInputElement>(null)
  const tv = useTvMode()
  const online = useOnline()
  // Resultados mientras escribís: se busca cuando dejás de tipear 300 ms (o ya, con Enter).
  const schedule = useMemo(() => debounce((v: string) => setQuery(normalizeQuery(v)), DEBOUNCE_MS), [])
  useEffect(() => () => schedule.cancel(), [schedule])

  const people = usePeople(query, tmdbOn)
  const together = useTogether(query, tmdbOn)
  // Sin ningún catálogo con búsqueda (ej. Cinemeta apagado) no hay dónde buscar: se avisa en vez de "no encontramos nada".
  const canSearch = useMemo(() => searchableCatalogs(addons).length > 0, [addons])

  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true })
    if (query.length < MIN_QUERY) {
      setGroups([])
      return
    }
    // Cada letra nueva cancela los pedidos de la anterior.
    const ctrl = new AbortController()
    const targets = searchableCatalogs(addons).map(({ addon, catalog }, _, all) => ({
      addon,
      catalog,
      key: `${addon.transportUrl}|${catalog.type}|${catalog.id}`,
      title: `${typeLabel(catalog.type)}${all.length > 2 ? ` · ${addon.manifest.name}` : ''}`,
    }))
    // Cada grupo conserva los resultados anteriores (atenuados) hasta que llegan los nuevos: así la grilla no
    // vuelve a los esqueletos ni salta con cada letra.
    setGroups((prev) =>
      targets.map(({ key, title }) => ({ key, title, items: prev.find((g) => g.key === key)?.items ?? [], loading: true })),
    )
    targets.forEach(({ addon, catalog, key }) => {
      searchCatalog(addon, catalog, query, ctrl.signal)
        .then((found) => found.map((m) => ({ ...m, type: m.type ?? catalog.type })))
        .catch(() => [])
        .then((items) => {
          if (!ctrl.signal.aborted) setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, items, loading: false } : g)))
        })
    })
    return () => ctrl.abort()
  }, [query, addons])

  const change = (v: string) => {
    setText(v)
    schedule(v)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    schedule.flush()
    const q = normalizeQuery(text)
    if (q.length >= MIN_QUERY) saveRecent(q)
    // Cierra el teclado en pantalla (celular / TV) y deja ver los resultados.
    input.current?.blur()
  }

  const pickRecent = (q: string) => {
    schedule.cancel()
    setText(q)
    setQuery(q)
    saveRecent(q)
    input.current?.focus({ preventScroll: true })
  }

  // Abrir un resultado cuenta como búsqueda "hecha": va a recientes.
  const onResultsClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a') && query.length >= MIN_QUERY) saveRecent(query)
  }

  const anyLoading = groups.some((g) => g.loading) || people.loading
  const noResults =
    query.length >= MIN_QUERY && !anyLoading && groups.every((g) => g.items.length === 0) && people.people.length === 0
  const showRecents = query.length < MIN_QUERY && text.trim().length < MIN_QUERY

  return (
    <div className="page">
      <header className="page-header">
        <h1>Buscar</h1>
      </header>
      <form role="search" onSubmit={submit} className="search-form">
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
            // Control remoto: ↓ va a lo primero de abajo (la búsqueda reciente o el primer resultado),
            // no a lo que quede más cerca del centro del campo.
            if (e.key !== 'ArrowDown') return
            const first = document.querySelector<HTMLElement>(
              '.recent-query, .together-banner, .search-people a.cast-card, .search-group a.poster-card',
            )
            if (!first) return
            e.preventDefault()
            first.focus({ preventScroll: true })
            first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
          }}
          enterKeyHint="search"
        />
      </form>
      <KeyboardToggle
        value={text}
        onChange={change}
        alwaysToggle
        openInTv
        doneLabel="Buscar"
        label="Teclado para buscar"
        onDone={() => {
          schedule.flush()
          const q = normalizeQuery(text)
          if (q.length >= MIN_QUERY) saveRecent(q)
          document.querySelector<HTMLElement>('.search-people a.cast-card, .search-group a.poster-card')?.focus()
        }}
      />
      {!online && <div className="empty muted">Sin conexión: la búsqueda necesita internet. Mientras tanto tenés Mi lista y el Historial.</div>}

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

      <div onClick={onResultsClick}>
        {together && (
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

        {query.length >= MIN_QUERY && (people.loading || people.people.length > 0) && (
          <div className="search-people">
            <PeopleRow title="Personas" people={people.people} loading={people.loading} stale={people.stale} />
          </div>
        )}

        {groups
          .filter((g) => g.loading || g.items.length > 0)
          .map((g) => (
            <section key={g.key} className="search-group">
              <h2>{g.title}</h2>
              <div className={g.loading && g.items.length > 0 ? 'grid is-stale' : 'grid'} aria-busy={g.loading}>
                {g.loading && g.items.length === 0
                  ? Array.from({ length: SKELETONS }, (_, i) => <PosterSkeleton key={i} />)
                  : g.items.map((m) => <PosterCard key={m.id} meta={m} />)}
              </div>
            </section>
          ))}
      </div>
      {!canSearch && (
        <EmptyState
          icon="search"
          title="Ningún addon activo permite buscar"
          text="Activá Cinemeta u otro addon con búsqueda en Ajustes."
          action={{ label: 'Ir a Ajustes', to: '/settings' }}
        />
      )}
      {canSearch && noResults && online && (
        <EmptyState icon="search" title={`No encontramos nada para “${query}”`} text="Probá con otro nombre o con menos palabras." />
      )}
      {canSearch && showRecents && recents.length === 0 && (
        <EmptyState icon="search" title="Escribí al menos 2 letras" text="Buscá por película, serie o persona." />
      )}
    </div>
  )
}

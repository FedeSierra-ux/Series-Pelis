import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { PeopleRow, PersonAvatar } from '../components/PeopleRow'
import { searchableCatalogs } from '../lib/addons'
import { findPerson, getTogether, searchCatalog, searchPeople, type TmdbPersonResult } from '../lib/discoverApi'
import { useAddons, useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { debounce, MIN_QUERY, normalizeQuery, parseTogether, pushRecent, removeRecent } from '../lib/searchHistory'
import { recentSearchesStore, settingsStore, useStore } from '../lib/store'
import type { MetaPreview } from '../lib/types'

interface Group {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
}

const DEBOUNCE_MS = 300

const saveRecent = (q: string) => recentSearchesStore.set((list) => pushRecent(list, q))

/** Personas de TMDB que coinciden con la búsqueda (vacío sin key). */
function usePeople(query: string, enabled: boolean) {
  const [state, setState] = useState<{ q: string; people: TmdbPersonResult[]; loading: boolean }>({ q: '', people: [], loading: false })
  useEffect(() => {
    if (!enabled || query.length < MIN_QUERY) return
    let alive = true
    setState({ q: query, people: [], loading: true })
    searchPeople(query)
      .then((people) => alive && setState({ q: query, people: people.slice(0, 15), loading: false }))
      .catch(() => alive && setState({ q: query, people: [], loading: false }))
    return () => {
      alive = false
    }
  }, [query, enabled])
  return enabled && state.q === query ? state : { q: query, people: [], loading: false }
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
  const tmdbOn = useStore(settingsStore).tmdbKey.trim().length > 0
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [query, setQuery] = useState(() => normalizeQuery(params.get('q') ?? ''))
  const [groups, setGroups] = useState<Group[]>([])
  const input = useRef<HTMLInputElement>(null)
  // Resultados mientras escribís: se busca cuando dejás de tipear 300 ms (o ya, con Enter).
  const schedule = useMemo(() => debounce((v: string) => setQuery(normalizeQuery(v)), DEBOUNCE_MS), [])
  useEffect(() => () => schedule.cancel(), [schedule])

  const people = usePeople(query, tmdbOn)
  const together = useTogether(query, tmdbOn)

  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true })
    if (query.length < MIN_QUERY) {
      setGroups([])
      return
    }
    // Cada letra nueva cancela los pedidos de la anterior.
    const ctrl = new AbortController()
    const targets = searchableCatalogs(addons)
    const next: Group[] = targets.map(({ addon, catalog }) => ({
      key: `${addon.transportUrl}|${catalog.type}|${catalog.id}`,
      title: `${typeLabel(catalog.type)}${targets.length > 2 ? ` · ${addon.manifest.name}` : ''}`,
      items: [],
      loading: true,
    }))
    setGroups(next)
    targets.forEach(({ addon, catalog }, i) => {
      searchCatalog(addon, catalog, query, ctrl.signal)
        .then((items) => {
          next[i] = { ...next[i], items: items.map((m) => ({ ...m, type: m.type ?? catalog.type })), loading: false }
        })
        .catch(() => {
          next[i] = { ...next[i], loading: false }
        })
        .finally(() => !ctrl.signal.aborted && setGroups([...next]))
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
          autoFocus
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
            <PeopleRow title="Personas" people={people.people} loading={people.loading} />
          </div>
        )}

        {groups
          .filter((g) => g.loading || g.items.length > 0)
          .map((g) => (
            <section key={g.key} className="search-group">
              <h2>{g.title}</h2>
              <div className="grid">
                {g.loading
                  ? Array.from({ length: 6 }, (_, i) => <PosterSkeleton key={i} />)
                  : g.items.map((m) => <PosterCard key={m.id} meta={m} />)}
              </div>
            </section>
          ))}
      </div>
      {noResults && <div className="empty">No encontramos nada para “{query}”.</div>}
      {showRecents && recents.length === 0 && <div className="empty muted">Escribí al menos 2 letras.</div>}
    </div>
  )
}

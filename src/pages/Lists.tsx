import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { Empty } from '../components/Status'
import { CURATED, curatedById, curatedPath, type CuratedDef } from '../lib/curated'
import { curatedItemPath, loadCurated, type CuratedResult } from '../lib/discoverApi'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { settingsStore, useStore } from '../lib/store'
import { useTmdbKey } from '../lib/tmdb'
import { errorText } from '../lib/errors'

// Listas curadas (v0.5): índice en /lists y cada lista en /lists/:id.

/** A partir de cuánto se avisa que la lista está tardando. */
const SLOW_AFTER_MS = 8000

function toggleHomeRow(id: string) {
  settingsStore.set((s) => {
    const rows = s.curatedRows ?? []
    return { ...s, curatedRows: rows.includes(id) ? rows.filter((x) => x !== id) : [...rows, id] }
  })
}

function HomeToggle({ id }: { id: string }) {
  const rows = useStore(settingsStore).curatedRows ?? []
  const on = rows.includes(id)
  return (
    <button type="button" className={`btn btn-small${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleHomeRow(id)}>
      {on ? '✓ En Inicio' : '+ Mostrar en Inicio'}
    </button>
  )
}

function ListTile({ def }: { def: CuratedDef }) {
  return (
    <article className="list-tile">
      <Link to={curatedPath(def)} className="list-tile-main">
        <span className="list-tile-type muted small">{typeLabel(def.type)}</span>
        <h2>{def.title}</h2>
        <p className="muted small">{def.description}</p>
      </Link>
      <HomeToggle id={def.id} />
    </article>
  )
}

export function ListsIndex() {
  useTitle('Listas')
  const tmdbOn = useTmdbKey().length > 0
  const lists = CURATED.filter((l) => tmdbOn || !l.needsTmdb)
  return (
    <div className="page lists-page">
      <header className="page-header">
        <h1>Listas</h1>
      </header>
      <div className="list-tiles">
        {lists.map((l) => (
          <ListTile key={l.id} def={l} />
        ))}
      </div>
      {!tmdbOn && (
        <p className="muted small lists-note">
          Con una key de TMDB (<Link to="/settings">Ajustes</Link>) aparecen más: sagas y listas por tema.
        </p>
      )}
    </div>
  )
}

export function ListPage() {
  const { id = '' } = useParams()
  const def = curatedById(id)
  const tmdbOn = useTmdbKey().length > 0
  const [state, setState] = useState<{ id: string; data?: CuratedResult; error?: string }>()
  const blocked = !!def?.needsTmdb && !tmdbOn
  const [attempt, setAttempt] = useState(0)
  // Pasados unos segundos sin respuesta (Wikidata, para los Oscar, puede tardar mucho) se avisa.
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!def || blocked) return
    let alive = true
    setSlow(false)
    const timer = setTimeout(() => alive && setSlow(true), SLOW_AFTER_MS)
    loadCurated(id)
      .then((data) => alive && setState({ id, data }))
      .catch((err: unknown) => alive && setState({ id, error: errorText(err) }))
      .finally(() => clearTimeout(timer))
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [id, blocked, attempt])

  const current = state?.id === id ? state : undefined
  const pending = !!def && !blocked && !current
  const title = current?.data?.title ?? def?.title
  useTitle(title)

  if (!def) return <div className="page"><Empty>No existe esa lista. <Link to="/lists">Ver todas</Link></Empty></div>
  if (blocked)
    return (
      <div className="page">
        <Empty>
          Esta lista necesita una key de TMDB. Cargala en <Link to="/settings">Ajustes</Link>.
        </Empty>
      </div>
    )

  const items = current?.data?.items

  return (
    <div className="page lists-page">
      <header className="page-header">
        <div>
          <p className="muted small">
            <Link to="/lists">Listas</Link> ›
          </p>
          <h1>{title}</h1>
          <p className="muted small list-desc">{def.description}</p>
        </div>
        <HomeToggle id={id} />
      </header>
      {current?.error && (
        <div className="error-box" role="alert">
          <p>No se pudo cargar la lista: {current.error}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setState(undefined)
              setAttempt((n) => n + 1)
            }}
          >
            Probar de nuevo
          </button>
        </div>
      )}
      {pending && slow && (
        <p className="muted small" role="status">
          Está tardando más de lo normal… Esta lista se arma con datos de internet que a veces responden lento.
        </p>
      )}
      <div className="grid">
        {items
          ? items.map((m, i) => (
              <PosterCard
                key={m.id}
                meta={m}
                eager={i < 12}
                priority={i < 6}
                to={curatedItemPath(m)}
              />
            ))
          : pending && Array.from({ length: 18 }, (_, i) => <PosterSkeleton key={i} />)}
      </div>
      {items && items.length === 0 && <Empty>La lista está vacía por ahora.</Empty>}
    </div>
  )
}

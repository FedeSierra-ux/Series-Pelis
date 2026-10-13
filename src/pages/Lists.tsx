import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { Empty, ErrorBox } from '../components/Status'
import { CURATED, curatedById, curatedPath, type CuratedDef } from '../lib/curated'
import { curatedItemPath, loadCurated, type CuratedResult } from '../lib/discoverApi'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { settingsStore, useStore } from '../lib/store'

// Listas curadas (v0.5): índice en /lists y cada lista en /lists/:id.

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
  const tmdbOn = useStore(settingsStore).tmdbKey.trim().length > 0
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
  const tmdbOn = useStore(settingsStore).tmdbKey.trim().length > 0
  const [state, setState] = useState<{ id: string; data?: CuratedResult; error?: string }>()
  const blocked = !!def?.needsTmdb && !tmdbOn
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!def || blocked) return
    let alive = true
    loadCurated(id)
      .then((data) => alive && setState({ id, data }))
      .catch((err: unknown) => alive && setState({ id, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [id, blocked, attempt])

  const current = state?.id === id ? state : undefined
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
  const ranked = def.kind === 'imdb-top'

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
        <ErrorBox message={`No se pudo cargar la lista: ${current.error}`} onRetry={() => {
          setState(undefined)
          setAttempt((n) => n + 1)
        }} />
      )}
      <div className="grid">
        {items
          ? items.map((m, i) => (
              <PosterCard
                key={m.id}
                meta={m}
                eager={i < 12}
                to={curatedItemPath(m)}
                subtitle={ranked ? [`#${i + 1}`, m.releaseInfo].filter(Boolean).join(' · ') : undefined}
              />
            ))
          : !current?.error && Array.from({ length: 18 }, (_, i) => <PosterSkeleton key={i} />)}
      </div>
      {items && items.length === 0 && <Empty>La lista está vacía por ahora.</Empty>}
    </div>
  )
}

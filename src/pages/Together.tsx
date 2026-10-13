import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PersonAvatar } from '../components/PeopleRow'
import { TogetherPicker } from '../components/PersonPicker'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { Empty, ErrorBox } from '../components/Status'
import { getTogether, type Together as TogetherData } from '../lib/discoverApi'
import { useTitle } from '../lib/hooks'
import { itemYear, tmdbToPreview, useTmdbKey } from '../lib/tmdb'
import { errorText } from '../lib/errors'

// /together?ids=69310,1234 → títulos donde aparecen las dos personas (delante o detrás de cámara).

export function Together() {
  const [params] = useSearchParams()
  const key = useTmdbKey()
  const ids = (params.get('ids') ?? '')
    .split(',')
    .filter((x) => /^\d+$/.test(x))
    .map(Number)
  const [a, b] = ids
  const valid = ids.length === 2 && a !== b
  const [state, setState] = useState<{ k: string; data?: TogetherData; error?: string }>()
  const k = `${a},${b}`

  useEffect(() => {
    if (!key || !valid) return
    let alive = true
    getTogether(a, b)
      .then((data) => alive && setState({ k, data }))
      .catch((err: unknown) => alive && setState({ k, error: errorText(err) }))
    return () => {
      alive = false
    }
  }, [k, key])

  const current = state?.k === k ? state : undefined
  const data = current?.data
  useTitle(data ? `${data.a.name} y ${data.b.name}` : 'Juntos')

  const groups = useMemo(() => {
    const items = data?.items ?? []
    return [
      { title: 'Películas', list: items.filter((i) => i.media_type === 'movie') },
      { title: 'Series', list: items.filter((i) => i.media_type === 'tv') },
    ].filter((g) => g.list.length > 0)
  }, [data])

  if (!key)
    return (
      <div className="page">
        <Empty>
          Para buscar títulos con dos personas juntas cargá una key de TMDB en <Link to="/settings">Ajustes</Link>.
        </Empty>
      </div>
    )
  if (!valid) return <div className="page"><Empty>Elegí dos personas distintas.</Empty></div>
  if (current?.error) return <div className="page"><ErrorBox message={`No se pudo cargar: ${current.error}`} /></div>

  return (
    <div className="page together-page">
      <header className="together-head">
        {data ? (
          <>
            {[data.a, data.b].map((p) => (
              <Link key={p.id} to={`/person/${p.id}`} className="cast-card" title={p.name}>
                <PersonAvatar person={p} />
                <span className="cast-name">{p.name}</span>
              </Link>
            ))}
            <div className="together-title">
              <h1>Juntos</h1>
              <p className="muted">
                {data.items.length === 0
                  ? `${data.a.name} y ${data.b.name} no comparten ningún título en TMDB.`
                  : `${data.a.name} y ${data.b.name} aparecen juntos en ${data.items.length} ${data.items.length === 1 ? 'título' : 'títulos'}.`}
              </p>
              <TogetherPicker personId={data.a.id} personName={data.a.name} />
            </div>
          </>
        ) : (
          <h1>Juntos</h1>
        )}
      </header>

      {!data && (
        <div className="grid">
          {Array.from({ length: 12 }, (_, i) => (
            <PosterSkeleton key={i} />
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.title} className="search-group">
          <h2>{g.title}</h2>
          <div className="grid">
            {g.list.map((item) => {
              const meta = tmdbToPreview(item)
              const roles = [item.roleA, item.roleB].filter(Boolean).join(' / ')
              return <PosterCard key={meta.id} meta={meta} subtitle={[itemYear(item), roles].filter(Boolean).join(' · ') || undefined} />
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

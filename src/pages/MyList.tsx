import { useState } from 'react'
import { PosterCard } from '../components/PosterCard'
import { Empty } from '../components/Status'
import { useTitle } from '../lib/hooks'
import { progressStore, useStore, watchlistStore } from '../lib/store'

type Sort = 'added' | 'rating' | 'name'

export function MyList() {
  useTitle('Mi lista')
  const list = useStore(watchlistStore)
  const progress = useStore(progressStore)
  const [sort, setSort] = useState<Sort>('added')

  const items = Object.values(list).sort((a, b) => {
    if (sort === 'rating') return Number(b.imdbRating ?? 0) - Number(a.imdbRating ?? 0)
    if (sort === 'name') return a.name.localeCompare(b.name, 'es')
    return b.addedAt - a.addedAt
  })
  const watchedMovies = new Set(Object.values(progress).filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Mi lista</h1>
        <div className="filters">
          <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="added">Agregadas recientemente</option>
            <option value="rating">Mejor puntaje IMDb</option>
            <option value="name">Nombre</option>
          </select>
        </div>
      </header>
      {items.length === 0 ? (
        <Empty>Tu lista está vacía. Usá “+ Mi lista” en cualquier título para guardarlo acá.</Empty>
      ) : (
        <div className="grid">
          {items.map((m) => (
            <PosterCard
              key={m.id}
              meta={{ id: m.id, type: m.type, name: m.name, poster: m.poster, releaseInfo: m.year, imdbRating: m.imdbRating }}
              watched={watchedMovies.has(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
